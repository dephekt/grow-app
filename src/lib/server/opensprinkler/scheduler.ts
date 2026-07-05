import type { DatabaseSync } from 'node:sqlite';
import { intEnv } from '$lib/server/env';
import { getIrrigationDb } from './db';
import { getIrrigationController } from './controller';
import { getOpenSprinklerConfig } from './config';
import { computeScheduleDue } from './schedule-due';
import { getScheduleTimeZone } from './schedule-time';
import { listActiveSchedules, markScheduleFired, parseAnchorMs, type Schedule } from './schedules';
import { getZone, recordEvent } from './zones';
import { clampSeconds, resolveShotSeconds, type ShotInput } from './shots';

/**
 * The irrigation schedule reconciliation tick. Not a durable-execution framework — a
 * level-triggered loop that, each tick, asks each active schedule "are you due right
 * now?" (`computeScheduleDue`) and fires the ones that are through the existing
 * IrrigationController. Restart-safety comes for free: next-due is recomputed from the
 * persisted `last_fired_at` on every tick, so a bounce just resumes from state. Single
 * container / single writer, so no distributed locking is needed.
 */

/** Just the slice of the controller the tick drives, so tests pass a fake. */
export interface SchedulerController {
  runStation(sid: number, seconds: number): Promise<void>;
  isStationRunning(sid: number): boolean;
}

export interface SchedulerTickDeps {
  db: DatabaseSync;
  controller: SchedulerController;
  nowMs: number;
  tz: string;
  graceMs: number;
}

function shotInputFor(schedule: Schedule): ShotInput {
  // Exactly one is non-null (DB CHECK), but keep resolveShotSeconds' precedence order.
  if (schedule.shotSeconds != null) return { seconds: schedule.shotSeconds };
  if (schedule.shotMl != null) return { ml: schedule.shotMl };
  if (schedule.shotPercent != null) return { percent: schedule.shotPercent };
  return {};
}

/**
 * Run one reconciliation pass. Pure w.r.t. its injected deps (db, controller, clock),
 * so the whole firing decision matrix unit-tests without a real timer or MQTT.
 *
 * Concurrency is guarded in three layers: the persisted `last_fired` dedup (primary),
 * a live `isStationRunning` check, and a per-tick `firedThisTick` set (two schedules
 * sharing a station in one tick). On a busy station the window is *consumed* — we
 * advance `last_fired` without firing or auditing — so we don't retry a slot we chose
 * to skip. A `runStation` rejection, by contrast, leaves `last_fired` untouched so an
 * in-grace retry on the next tick can still succeed.
 */
export async function runSchedulerTick(deps: SchedulerTickDeps): Promise<void> {
  const { db, controller, nowMs, tz, graceMs } = deps;
  const firedThisTick = new Set<number>();

  for (const schedule of listActiveSchedules(db)) {
    try {
      const lastFiredMs = parseAnchorMs(schedule.lastFiredAt);
      const due = computeScheduleDue(schedule.times, lastFiredMs, nowMs, tz, graceMs);
      if (!due.shouldFire || due.dueAt === null) continue;

      const zone = getZone(db, schedule.zoneId);
      if (!zone) continue; // raced with a zone delete after the active-schedules query

      const slotIso = new Date(due.dueAt).toISOString();

      // Busy: another schedule already fired this station this tick, or it's running
      // (a manual run or the OS web UI). Consume the window and move on.
      if (firedThisTick.has(zone.stationSid) || controller.isStationRunning(zone.stationSid)) {
        markScheduleFired(db, schedule.id, slotIso);
        continue;
      }

      const seconds = clampSeconds(resolveShotSeconds(shotInputFor(schedule), zone), zone.maxRunSeconds);

      // Make the durable dedup anchor a PRECONDITION of the physical fire, not a
      // consequence. Advance last_fired BEFORE opening the valve: if that write throws
      // (e.g. a full disk), it throws before the run happens — a skipped shot, never a
      // valve that re-fires every tick across the grace window because the anchor never
      // advanced. Claim the station for this tick only AFTER the anchor is durable, so a
      // failed anchor write doesn't wrongly mark the station busy and skip a co-located
      // sibling schedule this tick.
      const priorLastFired = schedule.lastFiredAt;
      markScheduleFired(db, schedule.id, slotIso);
      firedThisTick.add(zone.stationSid);

      try {
        await controller.runStation(zone.stationSid, seconds);
      } catch (error) {
        // The run itself failed. Revert the anchor (best-effort) so an in-grace retry
        // on the next tick can still succeed. If the revert write also fails, leave the
        // window consumed — a skipped shot is the safe direction; never double-fire.
        try {
          markScheduleFired(db, schedule.id, priorLastFired);
        } catch (revertError) {
          console.error(`[schedule] schedule ${schedule.id} anchor revert failed after run rejection`, revertError);
        }
        throw error; // surface to the per-schedule catch (logs, continues to siblings)
      }

      // Fired and the anchor is already durable: a failed audit write must not un-fire
      // the run (mirrors the manual-run route).
      try {
        recordEvent(db, {
          zoneId: zone.id,
          stationSid: zone.stationSid,
          source: 'schedule',
          actor: 'scheduler',
          scheduleId: schedule.id,
          requestedPercent: schedule.shotPercent,
          requestedMl: schedule.shotMl,
          seconds
        });
      } catch (error) {
        console.error('[schedule] failed to record run event', error);
      }
    } catch (error) {
      // A misbehaving schedule (bad shot spec, run rejection) must not abort siblings.
      console.error(`[schedule] schedule ${schedule.id} failed to fire`, error);
    }
  }
}

// A slow tick (a runStation spanning the interval) must not overlap the next one, or
// last_fired wouldn't be advanced yet and the same slot could double-fire. This flag
// drops a re-entrant tick. Module-level: there is one scheduler per process.
let ticking = false;

/** One guarded tick: dropped if a prior tick is still in flight. Exported so the
 *  interval and the re-entrancy test share the exact same guard. */
export async function tickOnce(deps: SchedulerTickDeps): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    await runSchedulerTick(deps);
  } finally {
    ticking = false;
  }
}

/** Tick interval in ms (`GROW_SCHEDULE_TICK_SECONDS`, default 30s, floored at 1s). */
export function getScheduleTickMs(): number {
  return Math.max(1, intEnv('GROW_SCHEDULE_TICK_SECONDS', 30)) * 1000;
}

/** Skip-missed grace in ms (`GROW_SCHEDULE_GRACE_SECONDS`, default 300s). Floored at
 *  one tick so every slot gets at least one chance to fire before it expires. */
export function getScheduleGraceMs(): number {
  return Math.max(intEnv('GROW_SCHEDULE_GRACE_SECONDS', 300) * 1000, getScheduleTickMs());
}

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the reconciliation timer (web app only — never the read-only recorder). No-op
 * unless the site is OS-enabled or a timer is already running. `unref()` keeps the tick
 * from holding the process alive on shutdown.
 */
export function startIrrigationScheduler(): void {
  if (timer) return;
  if (!getOpenSprinklerConfig().enabled) return;

  timer = setInterval(() => {
    void tickOnce({
      db: getIrrigationDb(),
      controller: getIrrigationController(),
      nowMs: Date.now(),
      tz: getScheduleTimeZone(),
      graceMs: getScheduleGraceMs()
    }).catch((error) => console.error('[schedule] tick failed', error));
  }, getScheduleTickMs());
  timer.unref?.();
}

export function stopIrrigationScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
