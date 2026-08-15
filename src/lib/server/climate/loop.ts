// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import type { DatabaseSync } from 'node:sqlite';
import { intEnv } from '$lib/server/env';
import { getSiteMqttService } from '$lib/server/mqtt/service';
import type { Snapshot } from '$lib/server/mqtt/types';
import { resolveGrowState } from '$lib/lights/grow-plan';
import { controlBand, type ClimateConfig, type ControlBand } from '$lib/climate/model';
import { decideClimate, type ClimateAction, type ClimateDecision } from '$lib/climate/decide';
import { resolveClimateInputs, type ClimateInputs } from '$lib/climate/inputs';
import { RollingMedian } from '$lib/climate/smoothing';
import { getClimateDb } from './db';
import { getClimateConfig, recordClimateEvent } from './store';

/** Median window for the control input. Long enough to swallow a single bad SHT45 sample,
 *  far shorter than the tent's ~20 min exchange time constant, so it costs no responsiveness. */
const SMOOTHING_WINDOW_MS = 5 * 60 * 1000;

/** A quiet loop still says so on this cadence, so a gap in the log means an outage rather
 *  than a decision nobody recorded. */
const HEARTBEAT_MS = 15 * 60 * 1000;

/** Cross-tick state: the smoothing window, when each relay last moved, and what was last
 *  written to the log. Held here rather than in the DB because all of it is re-derivable
 *  and a restart should simply resume observing. */
export class ClimateLoopState {
  readonly airVpd = new RollingMedian(SMOOTHING_WINDOW_MS);
  /** Smoothed for the same reason air VPD is, and more urgently: the temperature limits
   *  outrank VPD and bypass both the minimum-off and the predictive gate, so one glitched
   *  sample would otherwise be enough to start or force-stop the fan on its own. */
  readonly tentTempC = new RollingMedian(SMOOTHING_WINDOW_MS);
  exhaustOn: boolean | null = null;
  exhaustChangedMs: number | null = null;
  humidifierOn: boolean | null = null;
  humidifierChangedMs: number | null = null;
  private lastLogKey: string | null = null;
  private lastLogMs: number | null = null;

  /** Record observed relay positions, stamping a change time only on an actual transition —
   *  including one the loop did not cause, since a hand-flipped relay restarts its timers too. */
  noteRelays(
    exhaust: { present: boolean; on: boolean },
    humidifier: { present: boolean; on: boolean },
    nowMs: number
  ): void {
    // An undiscovered plug reads OFF from switchIsOn, which is absence, not a position. Taking
    // it as one makes the first discovery after a restart look like a transition and starts a
    // minimum-on for a fan that has in fact been running for hours.
    if (exhaust.present && this.exhaustOn !== exhaust.on) {
      // A cold start is not a transition: leaving the stamp null lets the first decision act
      // immediately rather than serving out a minimum the loop never observed the start of.
      if (this.exhaustOn !== null) this.exhaustChangedMs = nowMs;
      this.exhaustOn = exhaust.on;
    }
    if (humidifier.present && this.humidifierOn !== humidifier.on) {
      if (this.humidifierOn !== null) this.humidifierChangedMs = nowMs;
      this.humidifierOn = humidifier.on;
    }
  }

  /** Whether this action is worth a row: any change of verdict, else the heartbeat. `extra`
   *  carries side effects that are not part of the verdict — reconciled arms, publish errors. */
  shouldLog(action: ClimateAction, nowMs: number, extra = '', heartbeat = true): boolean {
    const key = `${logKey(action)}|${extra}`;
    if (key !== this.lastLogKey) return true;
    if (!heartbeat) return false;
    return this.lastLogMs === null || nowMs - this.lastLogMs >= HEARTBEAT_MS;
  }

  markLogged(action: ClimateAction, nowMs: number, extra = ''): void {
    this.lastLogKey = `${logKey(action)}|${extra}`;
    this.lastLogMs = nowMs;
  }
}

/**
 * Dedup identity of a verdict: its kind, plus its reason with the live numbers blanked out.
 *
 * The numbers have to go or every tick reads as a new decision. The reason itself cannot,
 * because `hold` covers outcomes that are nothing alike — in-band, loop off, owned by
 * firmware, serving a minimum, and "no tent air reading — failing safe". Keying on the kind
 * alone meant a loop that went blind right after an in-band tick never wrote a row at all.
 */
function logKey(action: ClimateAction): string {
  const shape = action.reason.replace(/[\d.]+/g, '#');
  switch (action.kind) {
    case 'exhaust':
    case 'humidify':
      return `${action.kind}:${action.on}:${shape}`;
    case 'delegated':
    case 'blocked':
      return `${action.kind}:${action.want}:${shape}`;
    default:
      return `hold:${shape}`;
  }
}

export interface ClimateTickDeps {
  db: DatabaseSync;
  snapshot: Snapshot;
  state: ClimateLoopState;
  nowMs: number;
  /** Injected so a test drives publishing without a broker. */
  publish: (entityId: string, on: boolean) => Promise<void>;
  canPublish: () => boolean;
}

export interface ClimateTickResult {
  config: ClimateConfig;
  band: ControlBand;
  inputs: ClimateInputs;
  smoothedAirVpd: number | null;
  decision: ClimateDecision;
  published: boolean;
}

/** One reconciliation pass: read the world, decide, publish if armed, log if it changed. */
export async function runClimateTick(deps: ClimateTickDeps): Promise<ClimateTickResult> {
  const { db, snapshot, state, nowMs, publish, canPublish } = deps;

  const config = getClimateConfig(db);
  const grow = resolveGrowState(new Date(nowMs));
  const target = config.airVpdOverride ?? grow.airVpdTarget;
  const band = controlBand(target, config.deadbandKpa);

  const inputs = resolveClimateInputs(snapshot, nowMs);
  if (inputs.airVpd === null) state.airVpd.reset();
  else state.airVpd.push(inputs.airVpd, nowMs);
  const smoothedAirVpd = state.airVpd.value();

  if (inputs.tent === null) state.tentTempC.reset();
  else state.tentTempC.push(inputs.tent.tempC, nowMs);
  const smoothedTempC = state.tentTempC.value();
  // The tent the law sees carries the smoothed temperature, so the limits that outrank VPD are
  // judged on the same kind of evidence VPD is. RH rides along only for display; the loop reads
  // it through airVpd, which is smoothed already.
  const tent = inputs.tent === null || smoothedTempC === null ? inputs.tent : { ...inputs.tent, tempC: smoothedTempC };

  state.noteRelays(inputs.exhaust, inputs.humidifier, nowMs);

  const decision = decideClimate({
    nowMs,
    config,
    band,
    reading: {
      tent,
      room: inputs.room,
      airVpd: smoothedAirVpd,
      leafVpd: inputs.leafVpd,
      lightsOn: inputs.lightsOn
    },
    exhaust: { present: inputs.exhaust.present, on: inputs.exhaust.on, lastChangeMs: state.exhaustChangedMs },
    humidifier: {
      present: inputs.humidifier.present,
      on: inputs.humidifier.on,
      lastChangeMs: state.humidifierChangedMs
    },
    armsOn: inputs.arms.filter((arm) => arm.on).map((arm) => arm.objectId)
  });

  const { action } = decision;
  let published = false;
  const reconciled: string[] = [];
  let publishError: string | null = null;

  // Armed but unable to reach the broker. Recorded explicitly, because the row would otherwise
  // be indistinguishable from an observe-mode dry run — same `published: false`, same italic
  // "would set exhaust ON" in the log — and an operator would read an outage as a dry run.
  const wouldPublish = action.kind === 'exhaust' || action.kind === 'humidify' || decision.reconcileArms.length > 0;
  if (config.mode === 'active' && !canPublish() && wouldPublish) {
    publishError = 'broker not connected';
  }

  // `observe` is the whole point of the dry run: it decides and logs but never publishes.
  if (config.mode === 'active' && canPublish()) {
    // Caught rather than thrown: the broker can drop between `canPublish` and the write, and
    // unwinding here would skip the log entirely — leaving a clean gap in the audit trail at
    // exactly the tick that failed to move the relay.
    try {
      for (const objectId of decision.reconcileArms) {
        const arm = inputs.arms.find((a) => a.objectId === objectId);
        if (arm) {
          await publish(arm.entity.id, false);
          reconciled.push(objectId);
        }
      }
      if (action.kind === 'exhaust' && inputs.exhaust.entity) {
        await publish(inputs.exhaust.entity.id, action.on);
        published = true;
      } else if (action.kind === 'humidify' && inputs.humidifier.entity) {
        await publish(inputs.humidifier.entity.id, action.on);
        published = true;
      }
    } catch (error) {
      publishError = error instanceof Error ? error.message : String(error);
    }
  }

  // Reconciliation and publish failures both join the logged reason AND the dedup key, so a
  // firmware arm the loop is quietly fighting every 30 s cannot read as a silent loop.
  const notes = [
    reconciled.length > 0 ? `disarmed ${reconciled.join(', ')}` : null,
    publishError ? `publish failed: ${publishError}` : null
  ].filter((n): n is string => n !== null);
  const logged: ClimateAction = notes.length > 0 ? { ...action, reason: `${action.reason} · ${notes.join(' · ')}` } : action;

  // A switched-off loop records the switch and then goes quiet: heartbeating "loop is off"
  // every 15 minutes forever is noise, not an outage signal.
  if (state.shouldLog(logged, nowMs, notes.join('|'), config.mode !== 'off')) {
    recordClimateEvent(db, {
      ts: new Date(nowMs).toISOString(),
      action: logged,
      mode: config.mode,
      published: published || reconciled.length > 0,
      airVpd: smoothedAirVpd,
      leafVpd: inputs.leafVpd,
      target,
      bandLow: band.low,
      bandHigh: band.high,
      // The smoothed temperature, because that is the one the verdict above was reached on.
      tentTempC: tent?.tempC ?? null,
      tentRhPct: tent?.rhPct ?? null,
      roomTempC: inputs.room?.tempC ?? null,
      roomRhPct: inputs.room?.rhPct ?? null,
      lightsOn: inputs.lightsOn
    });
    state.markLogged(logged, nowMs, notes.join('|'));
  }

  return { config, band, inputs, smoothedAirVpd, decision, published };
}

/** Tick interval in ms (`GROW_CLIMATE_TICK_SECONDS`, default 30s, floored at 5s). */
export function getClimateTickMs(): number {
  return Math.max(5, intEnv('GROW_CLIMATE_TICK_SECONDS', 30)) * 1000;
}

let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;
const loopState = new ClimateLoopState();

/** Exposed so /climate can render the same smoothed value and relay timers the loop decided on. */
export function getClimateLoopState(): ClimateLoopState {
  return loopState;
}

async function tickOnce(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const service = getSiteMqttService();
    await runClimateTick({
      db: getClimateDb(),
      snapshot: service.snapshot(),
      state: loopState,
      nowMs: Date.now(),
      // Confirmation is a UI double-check for a human; the loop has already decided.
      publish: (entityId, on) => service.publishCommand(entityId, { value: on, confirm: true }),
      canPublish: () => service.brokerConnected()
    });
  } finally {
    ticking = false;
  }
}

/** Start the climate timer, unref'd so it cannot hold the process alive on shutdown. */
export function startClimateLoop(): void {
  if (timer) return;
  timer = setInterval(() => {
    void tickOnce().catch((error) => console.error('[climate] tick failed', error));
  }, getClimateTickMs());
  timer.unref?.();
}

export function stopClimateLoop(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
