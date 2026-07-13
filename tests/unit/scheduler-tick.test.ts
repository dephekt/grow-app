import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openIrrigationDb } from '../../src/lib/server/opensprinkler/db';
import { createZone } from '../../src/lib/server/opensprinkler/zones';
import * as scheduleStore from '../../src/lib/server/opensprinkler/schedules';
import { createSchedule, getSchedule, markScheduleFired } from '../../src/lib/server/opensprinkler/schedules';
import {
  getScheduleGraceMs,
  getScheduleTickMs,
  runSchedulerTick,
  tickOnce,
  type SchedulerController,
  type SchedulerTickDeps
} from '../../src/lib/server/opensprinkler/scheduler';
import { zonedMinutesToInstant } from '../../src/lib/server/opensprinkler/schedule-time';

const TZ = 'America/Toronto';
const GRACE = 5 * 60_000;
const SLOT = zonedMinutesToInstant(2026, 7, 15, 360, TZ); // 06:00 local
const SLOT_ISO = new Date(SLOT).toISOString();
const NOW = SLOT + 30_000; // 30s into the grace window

/** A fake controller recording runs, with knobs for a busy station, a rejecting
 *  station, and a gate that keeps a run pending (for the re-entrancy test). */
class FakeController implements SchedulerController {
  runs: Array<{ sid: number; seconds: number }> = [];
  running = new Set<number>();
  rejectSids = new Set<number>();
  gate: Promise<void> | null = null;

  async runStation(sid: number, seconds: number): Promise<void> {
    if (this.rejectSids.has(sid)) throw new Error('Broker is not connected');
    this.runs.push({ sid, seconds });
    if (this.gate) await this.gate;
  }
  isStationRunning(sid: number): boolean {
    return this.running.has(sid);
  }
}

let db: DatabaseSync;

function deps(controller: SchedulerController, over: Partial<SchedulerTickDeps> = {}): SchedulerTickDeps {
  return { db, controller, nowMs: NOW, tz: TZ, graceMs: GRACE, ...over };
}

function events(): Array<Record<string, unknown>> {
  return db
    .prepare('SELECT source, actor, schedule_id, seconds, requested_percent, requested_ml FROM irrigation_events')
    .all() as Array<Record<string, unknown>>;
}

beforeEach(() => {
  db = openIrrigationDb(':memory:');
});

describe('runSchedulerTick', () => {
  it('fires a due schedule once, audits it, and advances last_fired to the slot', async () => {
    const zone = createZone(db, { name: 'T', stationSid: 0 });
    const sched = createSchedule(db, { zoneId: zone.id, times: [360], shotSeconds: 30 });
    const ctrl = new FakeController();

    await runSchedulerTick(deps(ctrl));

    expect(ctrl.runs).toEqual([{ sid: 0, seconds: 30 }]);
    expect(events()).toEqual([
      { source: 'schedule', actor: 'scheduler', schedule_id: sched.id, seconds: 30, requested_percent: null, requested_ml: null }
    ]);
    expect(getSchedule(db, sched.id)?.lastFiredAt).toBe(SLOT_ISO);

    // A second tick in the same window must not re-fire (last_fired dedup).
    await runSchedulerTick(deps(ctrl, { nowMs: NOW + 1000 }));
    expect(ctrl.runs).toHaveLength(1);
    expect(events()).toHaveLength(1);
  });

  it('treats a corrupt last_fired anchor as never-fired and recovers', async () => {
    const zone = createZone(db, { name: 'T', stationSid: 0 });
    const sched = createSchedule(db, { zoneId: zone.id, times: [360], shotSeconds: 30 });
    markScheduleFired(db, sched.id, 'not-a-real-date'); // unparseable anchor
    const ctrl = new FakeController();

    await runSchedulerTick(deps(ctrl));

    expect(ctrl.runs).toEqual([{ sid: 0, seconds: 30 }]); // fired despite the garbage anchor
    expect(getSchedule(db, sched.id)?.lastFiredAt).toBe(SLOT_ISO); // healed to the real slot
  });

  it('clamps the resolved run to the zone max-run cap', async () => {
    const zone = createZone(db, { name: 'T', stationSid: 0, maxRunSeconds: 300 });
    createSchedule(db, { zoneId: zone.id, times: [360], shotSeconds: 600 });
    const ctrl = new FakeController();

    await runSchedulerTick(deps(ctrl));
    expect(ctrl.runs).toEqual([{ sid: 0, seconds: 300 }]);
  });

  it('logs the requested percent/ml on the audit row for a volumetric shot', async () => {
    const zone = createZone(db, { name: 'T', stationSid: 0, substrateVolumeMl: 4000, drippers: 2, emitterLph: 2 });
    createSchedule(db, { zoneId: zone.id, times: [360], shotPercent: 3 });
    const ctrl = new FakeController();

    await runSchedulerTick(deps(ctrl));
    expect(ctrl.runs).toEqual([{ sid: 0, seconds: 108 }]); // 3% of 4000mL over 66.7mL/min
    expect(events()[0]).toMatchObject({ requested_percent: 3, requested_ml: null, source: 'schedule' });
  });

  it('consumes the window on a busy station: no fire, no audit, last_fired advanced', async () => {
    const zone = createZone(db, { name: 'T', stationSid: 0 });
    const sched = createSchedule(db, { zoneId: zone.id, times: [360], shotSeconds: 30 });
    const ctrl = new FakeController();
    ctrl.running.add(0);

    await runSchedulerTick(deps(ctrl));

    expect(ctrl.runs).toHaveLength(0);
    expect(events()).toHaveLength(0);
    expect(getSchedule(db, sched.id)?.lastFiredAt).toBe(SLOT_ISO);
  });

  it('leaves last_fired untouched when runStation rejects (retry next tick)', async () => {
    const zone = createZone(db, { name: 'T', stationSid: 0 });
    const sched = createSchedule(db, { zoneId: zone.id, times: [360], shotSeconds: 30 });
    const ctrl = new FakeController();
    ctrl.rejectSids.add(0);

    await runSchedulerTick(deps(ctrl));

    expect(events()).toHaveLength(0);
    expect(getSchedule(db, sched.id)?.lastFiredAt).toBeNull();
  });

  it('reverts last_fired to its prior value (not the slot) when runStation rejects', async () => {
    const zone = createZone(db, { name: 'T', stationSid: 0 });
    const sched = createSchedule(db, { zoneId: zone.id, times: [360], shotSeconds: 30 });
    // Seed a prior anchor at yesterday's slot so today's slot is fresh + unfired.
    const priorIso = new Date(zonedMinutesToInstant(2026, 7, 14, 360, TZ)).toISOString();
    markScheduleFired(db, sched.id, priorIso);
    const ctrl = new FakeController();
    ctrl.rejectSids.add(0);

    await runSchedulerTick(deps(ctrl));

    expect(events()).toHaveLength(0);
    // Reverted to the captured prior value, so the next in-grace tick retries this slot.
    expect(getSchedule(db, sched.id)?.lastFiredAt).toBe(priorIso);
  });

  it('does not open the valve when the pre-run anchor write fails (no double-fire)', async () => {
    const zone = createZone(db, { name: 'T', stationSid: 0 });
    const sched = createSchedule(db, { zoneId: zone.id, times: [360], shotSeconds: 30 });
    const ctrl = new FakeController();
    // The durable anchor is a precondition of firing: if advancing it throws, the run
    // must not happen (else the null anchor would re-fire every tick in the window).
    const spy = vi.spyOn(scheduleStore, 'markScheduleFired').mockImplementation(() => {
      throw new Error('disk full');
    });

    await runSchedulerTick(deps(ctrl));

    expect(ctrl.runs).toHaveLength(0);
    expect(events()).toHaveLength(0);
    expect(getSchedule(db, sched.id)?.lastFiredAt).toBeNull();
    spy.mockRestore();
  });

  it('fires a station at most once per tick when two schedules share it', async () => {
    const zone = createZone(db, { name: 'T', stationSid: 0 });
    const a = createSchedule(db, { zoneId: zone.id, times: [360], shotSeconds: 30 });
    const b = createSchedule(db, { zoneId: zone.id, times: [360], shotSeconds: 45 });
    const ctrl = new FakeController();

    await runSchedulerTick(deps(ctrl));

    expect(ctrl.runs).toHaveLength(1); // one fire; the other consumed via firedThisTick
    expect(events()).toHaveLength(1);
    // Both windows are consumed so neither retries the slot.
    expect(getSchedule(db, a.id)?.lastFiredAt).toBe(SLOT_ISO);
    expect(getSchedule(db, b.id)?.lastFiredAt).toBe(SLOT_ISO);
  });

  it('skips disabled schedules and schedules on a disabled zone', async () => {
    const zone = createZone(db, { name: 'T', stationSid: 0 });
    createSchedule(db, { zoneId: zone.id, times: [360], shotSeconds: 30, enabled: false });
    const disabledZone = createZone(db, { name: 'Off', stationSid: 1, enabled: false });
    createSchedule(db, { zoneId: disabledZone.id, times: [360], shotSeconds: 30 });
    const ctrl = new FakeController();

    await runSchedulerTick(deps(ctrl));
    expect(ctrl.runs).toHaveLength(0);
  });

  it('skips a paused zone: no fire, no audit, window not consumed (resumes when un-paused)', async () => {
    const zone = createZone(db, { name: 'T', stationSid: 0, schedulesPaused: true });
    const sched = createSchedule(db, { zoneId: zone.id, times: [360], shotSeconds: 30 });
    const ctrl = new FakeController();

    await runSchedulerTick(deps(ctrl));

    expect(ctrl.runs).toHaveLength(0);
    expect(events()).toHaveLength(0);
    // The anchor is untouched (never consumed), so un-pausing resumes from the normal due calc.
    expect(getSchedule(db, sched.id)?.lastFiredAt).toBeNull();
  });

  it('does not let one failing schedule abort its siblings', async () => {
    // A percent shot on a zone with no substrate volume throws at resolve time.
    const bad = createZone(db, { name: 'Bad', stationSid: 0 });
    const badSched = createSchedule(db, { zoneId: bad.id, times: [360], shotPercent: 3 });
    const good = createZone(db, { name: 'Good', stationSid: 1 });
    createSchedule(db, { zoneId: good.id, times: [360], shotSeconds: 30 });
    const ctrl = new FakeController();

    await runSchedulerTick(deps(ctrl));

    expect(ctrl.runs).toEqual([{ sid: 1, seconds: 30 }]); // the good one still fired
    expect(getSchedule(db, badSched.id)?.lastFiredAt).toBeNull(); // failure ≠ consume
  });

  it('drops a re-entrant tick while a prior tick is still in flight', async () => {
    const zone = createZone(db, { name: 'T', stationSid: 0 });
    createSchedule(db, { zoneId: zone.id, times: [360], shotSeconds: 30 });
    const ctrl = new FakeController();
    let release!: () => void;
    ctrl.gate = new Promise<void>((r) => (release = r));

    const first = tickOnce(deps(ctrl)); // suspends inside runStation on the gate
    const second = tickOnce(deps(ctrl)); // ticking is true → dropped
    release();
    await Promise.all([first, second]);

    expect(ctrl.runs).toHaveLength(1); // the dropped tick never fired
  });
});

describe('tick + grace clamps', () => {
  const KEYS = ['GROW_SCHEDULE_TICK_SECONDS', 'GROW_SCHEDULE_GRACE_SECONDS'];
  const clear = () => KEYS.forEach((k) => delete process.env[k]);
  beforeEach(clear);
  afterEach(clear);

  it('defaults the tick to 30s and grace to 300s', () => {
    expect(getScheduleTickMs()).toBe(30_000);
    expect(getScheduleGraceMs()).toBe(300_000);
  });

  it('floors the tick at 1s for a zero setting', () => {
    process.env.GROW_SCHEDULE_TICK_SECONDS = '0';
    expect(getScheduleTickMs()).toBe(1000);
  });

  it('floors grace up to the tick when grace < tick', () => {
    process.env.GROW_SCHEDULE_TICK_SECONDS = '60';
    process.env.GROW_SCHEDULE_GRACE_SECONDS = '10';
    expect(getScheduleGraceMs()).toBe(60_000);
  });

  it('passes grace through when grace >= tick', () => {
    process.env.GROW_SCHEDULE_TICK_SECONDS = '30';
    process.env.GROW_SCHEDULE_GRACE_SECONDS = '120';
    expect(getScheduleGraceMs()).toBe(120_000);
  });
});
