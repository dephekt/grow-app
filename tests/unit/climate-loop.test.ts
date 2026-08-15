// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openClimateDb } from '../../src/lib/server/climate/db';
import { listClimateEvents, updateClimateConfig } from '../../src/lib/server/climate/store';
import {
  buildDecisionInput,
  ClimateLoopState,
  MIN_SMOOTHING_SAMPLES,
  runClimateTick,
  updateClimateSmoothing
} from '../../src/lib/server/climate/loop';
import { resolveClimateInputs } from '../../src/lib/climate/inputs';
import { controlBand, DEFAULT_CLIMATE_CONFIG, EXHAUST_NODE } from '../../src/lib/climate/model';
import { airVpdKpa } from '../../src/lib/climate/psychro';
import type { DeviceSnapshot, EntityConfig, EntityState, Snapshot } from '../../src/lib/server/mqtt/types';

const RIG = 'atoms3u-sensor-rig';
const ROOM = 'feather-air-monitor';

/** Grow week 1 (GROW_START 2026-08-10), so the plan target is the book's 1.0 kPa. */
const NOW = Date.UTC(2026, 7, 14, 12, 0, 0);
const NOW_ISO = new Date(NOW).toISOString();

function makeEntity(
  nodeId: string,
  overrides: Partial<EntityConfig> & { id: string; name: string; objectId: string }
): EntityConfig {
  return {
    component: 'sensor',
    uniqueId: overrides.id,
    nodeId,
    device: { identifiers: [`slug_${overrides.id}`], name: nodeId, manufacturer: 'x', model: 'y' },
    payloadAvailable: 'online',
    payloadNotAvailable: 'offline',
    dangerous: false,
    writable: false,
    raw: {},
    ...overrides
  } as EntityConfig;
}

const sw = (nodeId: string, id: string, objectId: string) =>
  makeEntity(nodeId, {
    id,
    name: objectId,
    objectId,
    component: 'switch',
    writable: true,
    payloadOn: 'ON',
    payloadOff: 'OFF'
  });

const ENTITIES: EntityConfig[] = [
  makeEntity(RIG, { id: 'rig_t', name: 'Temperature', objectId: 'temperature', deviceClass: 'temperature', unit: '°C' }),
  makeEntity(RIG, { id: 'rig_h', name: 'Humidity', objectId: 'humidity', deviceClass: 'humidity', unit: '%' }),
  makeEntity(ROOM, {
    id: 'room_t',
    name: 'Ext Temperature',
    objectId: 'ext_temperature',
    deviceClass: 'temperature',
    unit: '°C'
  }),
  makeEntity(ROOM, { id: 'room_h', name: 'Ext Humidity', objectId: 'ext_humidity', deviceClass: 'humidity', unit: '%' }),
  sw(EXHAUST_NODE, 'fan_relay', 'exhaust_fan'),
  sw(EXHAUST_NODE, 'fan_cyc', 'fan_cycle'),
  sw(EXHAUST_NODE, 'fan_sch', 'fan_schedule')
];

function snapshotWith(values: Record<string, string>, entities: EntityConfig[] = ENTITIES): Snapshot {
  const nodes = [...new Set(entities.map((e) => e.nodeId ?? ''))];
  const devices: DeviceSnapshot[] = nodes.map(
    (nodeId) =>
      ({
        id: `dev_${nodeId}`,
        nodeId,
        name: nodeId,
        availability: 'online',
        entityIds: entities.filter((e) => e.nodeId === nodeId).map((e) => e.id)
      }) as DeviceSnapshot
  );
  const states: Record<string, EntityState> = {};
  for (const [id, value] of Object.entries(values)) states[id] = { value, updatedAt: NOW_ISO };
  return {
    site: 'daniel-home',
    timezone: 'UTC',
    topicPrefix: 'grow/daniel-home',
    discoveryPrefix: 'grow/daniel-home/_discovery',
    generatedAt: NOW_ISO,
    broker: { connected: true, connecting: false, error: null, lastConnectedAt: null, lastMessageAt: null },
    devices,
    entities,
    states,
    uiConfigs: {},
    lights: [],
    firmware: { devices: {}, channels: {} }
  } as unknown as Snapshot;
}

/** Sealed and drifting dry-side: air VPD 0.86, under the 0.90 floor, with a much drier room. */
const WANTS_VENT = {
  rig_t: '29.48',
  rig_h: '79.1',
  room_t: '25.0',
  room_h: '50.0',
  fan_relay: 'OFF',
  fan_cyc: 'OFF',
  fan_sch: 'OFF'
};

let db: DatabaseSync;
let published: Array<{ entityId: string; on: boolean }>;

function deps(values: Record<string, string>, state: ClimateLoopState, nowMs = NOW, entities?: EntityConfig[]) {
  return {
    db,
    snapshot: snapshotWith(values, entities),
    state,
    nowMs,
    publish: async (entityId: string, on: boolean) => {
      published.push({ entityId, on });
    },
    canPublish: () => true
  };
}

beforeEach(() => {
  db = openClimateDb(':memory:');
  published = [];
});

/**
 * A state whose smoothing window is already filled, i.e. the loop as it is after its first
 * minute. Fills it through updateClimateSmoothing rather than by ticking, so no log rows and
 * no relay stamps come with it and the tests below stay about the verdict they assert.
 */
function warmed(values: Record<string, string>, nowMs = NOW, entities?: EntityConfig[]): ClimateLoopState {
  const state = new ClimateLoopState();
  const inputs = resolveClimateInputs(snapshotWith(values, entities), nowMs);
  for (let i = MIN_SMOOTHING_SAMPLES - 1; i > 0; i--) {
    updateClimateSmoothing(state, inputs, nowMs - i * 30_000);
  }
  return state;
}

const BAND = controlBand(1.0, DEFAULT_CLIMATE_CONFIG.deadbandKpa);

describe('buildDecisionInput — the two windows', () => {
  /** RH falling 79 → 67 over five minutes: a vent run, which is when the windows diverge. */
  function ramped(): ClimateLoopState {
    const state = new ClimateLoopState();
    const rh = [79.1, 76.7, 74.3, 71.9, 69.5, 67.1];
    rh.forEach((h, i) => {
      const at = NOW - (rh.length - 1 - i) * 60_000;
      updateClimateSmoothing(state, resolveClimateInputs(snapshotWith({ ...WANTS_VENT, rig_h: String(h) }), at), at);
    });
    return state;
  }

  it('reports a fast reading ahead of the median while VPD is climbing', () => {
    const state = ramped();
    const inputs = resolveClimateInputs(snapshotWith({ ...WANTS_VENT, rig_h: '67.1' }), NOW);
    const built = buildDecisionInput(inputs, state, DEFAULT_CLIMATE_CONFIG, BAND, NOW);

    expect(built.reading.airVpd).not.toBeNull();
    expect(built.reading.airVpdFast).not.toBeNull();
    // The whole point: on a rising leg the short window is nearer the tent than the median.
    expect(built.reading.airVpdFast!).toBeGreaterThan(built.reading.airVpd!);
  });

  it('agrees with the median once the tent settles', () => {
    const state = new ClimateLoopState();
    for (let i = 5; i >= 0; i--) {
      const at = NOW - i * 60_000;
      updateClimateSmoothing(state, resolveClimateInputs(snapshotWith(WANTS_VENT), at), at);
    }
    const built = buildDecisionInput(
      resolveClimateInputs(snapshotWith(WANTS_VENT), NOW),
      state,
      DEFAULT_CLIMATE_CONFIG,
      BAND,
      NOW
    );
    expect(built.reading.airVpdFast!).toBeCloseTo(built.reading.airVpd!, 6);
  });
});

describe('runClimateTick', () => {
  it('resolves the week target from the grow plan', async () => {
    const result = await runClimateTick(deps(WANTS_VENT, new ClimateLoopState()));
    expect(result.band).toEqual({ target: 1.0, low: 0.9, high: 1.1 });
  });

  it('decides and logs in observe mode but publishes nothing', async () => {
    const result = await runClimateTick(deps(WANTS_VENT, warmed(WANTS_VENT)));
    expect(result.decision).toMatchObject({ kind: 'delegated', want: 'exhaust' });
    expect(published).toEqual([]);

    const [row] = listClimateEvents(db);
    expect(row.mode).toBe('observe');
    expect(row.published).toBe(false);
  });

  it('publishes once armed, and records the reading it decided on', async () => {
    updateClimateConfig(db, { mode: 'active', exhaustSource: 'loop' }, NOW_ISO);
    const result = await runClimateTick(deps(WANTS_VENT, warmed(WANTS_VENT)));

    expect(result.decision).toMatchObject({ kind: 'exhaust', on: true });
    expect(published).toEqual([{ entityId: 'fan_relay', on: true }]);

    const [row] = listClimateEvents(db);
    expect(row).toMatchObject({ kind: 'exhaust', actuator: 'exhaust', on: true, published: true });
    expect(row.airVpd).toBeCloseTo(0.86, 2);
    expect(row.tentTempC).toBe(29.48);
    expect(row.roomTempC).toBe(25.0);
    expect(row.target).toBe(1.0);
  });

  it('never publishes while the broker is down', async () => {
    updateClimateConfig(db, { mode: 'active', exhaustSource: 'loop' }, NOW_ISO);
    await runClimateTick({ ...deps(WANTS_VENT, warmed(WANTS_VENT)), canPublish: () => false });
    expect(published).toEqual([]);
  });

  it('never publishes to a firmware arm, whatever the config', async () => {
    // It cannot restore persistent device state it did not set, so it does not touch it: an
    // app crash or a blind sensor would otherwise strand the plug with no supervisor.
    const armed = { ...WANTS_VENT, fan_cyc: 'ON', fan_sch: 'ON' };
    for (const config of [
      { mode: 'active' as const, exhaustSource: 'loop' as const },
      { mode: 'active' as const, exhaustSource: 'firmware' as const },
      { mode: 'observe' as const, exhaustSource: 'loop' as const }
    ]) {
      updateClimateConfig(db, config, NOW_ISO);
      published = [];
      await runClimateTick(deps(armed, warmed(armed)));
      expect(published.map((p) => p.entityId)).not.toContain('fan_cyc');
      expect(published.map((p) => p.entityId)).not.toContain('fan_sch');
    }
  });

  it('refuses the relay while an arm drives it, rather than taking it', async () => {
    updateClimateConfig(db, { mode: 'active', exhaustSource: 'loop' }, NOW_ISO);
    const armed = { ...WANTS_VENT, fan_cyc: 'ON' };
    const result = await runClimateTick(deps(armed, warmed(armed)));

    expect(result.decision).toMatchObject({ kind: 'blocked', want: 'exhaust', on: true });
    expect(published).toEqual([]);
  });

  it('collapses an unchanged verdict into one row, then heartbeats', async () => {
    const inBand = { ...WANTS_VENT, rig_t: '27.0', rig_h: '72.0' };
    const state = warmed(inBand);
    for (let i = 0; i < 5; i++) {
      await runClimateTick(deps(inBand, state, NOW + i * 30_000));
    }
    expect(listClimateEvents(db)).toHaveLength(1);

    await runClimateTick(deps(inBand, state, NOW + 15 * 60_000));
    expect(listClimateEvents(db)).toHaveLength(2);
  });

  it('logs again as soon as the verdict changes', async () => {
    updateClimateConfig(db, { mode: 'active', exhaustSource: 'loop' }, NOW_ISO);
    const state = warmed(WANTS_VENT);
    await runClimateTick(deps(WANTS_VENT, state));

    // Several ticks, because one dry sample cannot move a median — which is the point of it.
    // The intervening holds are logged too, so assert on the commands rather than every row.
    const dry = { ...WANTS_VENT, fan_relay: 'ON', rig_t: '28.0', rig_h: '55.0' };
    for (let i = 1; i <= 4; i++) await runClimateTick(deps(dry, state, NOW + i * 30_000));

    const commands = listClimateEvents(db)
      .filter((r) => r.kind === 'exhaust')
      .map((r) => r.on);
    expect(commands).toEqual([false, true]);
  });

  it('holds when the tent sensor drops out mid-run', async () => {
    updateClimateConfig(db, { mode: 'active', exhaustSource: 'loop' }, NOW_ISO);
    const state = new ClimateLoopState();
    await runClimateTick(deps({ ...WANTS_VENT, rig_t: '', rig_h: '' }, state));
    expect(published).toEqual([]);
    expect(listClimateEvents(db)[0].reason).toContain('failing safe');
  });

  it('clears the smoothing window when the input goes away, so it cannot outlive the sensor', async () => {
    const state = new ClimateLoopState();
    const first = await runClimateTick(deps(WANTS_VENT, state));
    expect(first.decisionInput.reading.airVpd).not.toBeNull();
    expect(state.tentTempC.value(NOW)).not.toBeNull();

    const second = await runClimateTick(deps({ ...WANTS_VENT, rig_t: '' }, state, NOW + 30_000));
    expect(second.decisionInput.reading.airVpd).toBeNull();
    expect(state.tentTempC.value(NOW + 30_000)).toBeNull();
  });

  it('logs a row that replays exactly: airVpdKpa(logged tent pair) === logged airVpd', async () => {
    // The pair and the VPD used to be smoothed independently, so the audit row could not be
    // used to reconstruct the decision it recorded.
    const state = warmed(WANTS_VENT);
    await runClimateTick(deps(WANTS_VENT, state, NOW));
    await runClimateTick(deps({ ...WANTS_VENT, rig_t: '29.9', rig_h: '77.0' }, state, NOW + 30_000));

    for (const row of listClimateEvents(db)) {
      if (row.tentTempC === null || row.tentRhPct === null || row.airVpd === null) continue;
      expect(airVpdKpa(row.tentTempC, row.tentRhPct)).toBeCloseTo(row.airVpd, 9);
    }
  });

  it('still records the decision when the publish fails', async () => {
    // The broker can drop between canPublish() and the write. Unwinding here would leave a
    // clean gap in the audit log at exactly the tick that failed to move the relay.
    updateClimateConfig(db, { mode: 'active', exhaustSource: 'loop' }, NOW_ISO);
    const result = await runClimateTick({
      ...deps(WANTS_VENT, warmed(WANTS_VENT)),
      publish: async () => {
        throw new Error('Broker is not connected');
      }
    });

    expect(result.published).toBe(false);
    const [row] = listClimateEvents(db);
    expect(row.kind).toBe('exhaust');
    expect(row.published).toBe(false);
    expect(row.reason).toContain('publish failed: Broker is not connected');
  });

  it('records the contention once, not on every tick', async () => {
    updateClimateConfig(db, { mode: 'active', exhaustSource: 'loop' }, NOW_ISO);
    const armed = { ...WANTS_VENT, fan_cyc: 'ON' };
    const state = warmed(armed);

    await runClimateTick(deps(armed, state, NOW));
    await runClimateTick(deps(armed, state, NOW + 30_000));

    const rows = listClimateEvents(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('blocked');
    expect(rows[0].reason).toContain('fan_cycle still drives the relay');
  });

  it('logs the loop going blind, even straight after an in-band hold', async () => {
    // Both are `hold`, so keying the dedup on the action kind alone left the fail-safe — the
    // one hold that matters — invisible for up to a whole heartbeat.
    const inBand = { ...WANTS_VENT, rig_t: '27.0', rig_h: '72.0' };
    const state = warmed(inBand);
    await runClimateTick(deps(inBand, state, NOW));
    expect(listClimateEvents(db)).toHaveLength(1);

    await runClimateTick(deps({ ...inBand, rig_t: '', rig_h: '' }, state, NOW + 30_000));
    const rows = listClimateEvents(db);
    expect(rows).toHaveLength(2);
    expect(rows[0].reason).toContain('failing safe');
  });

  it('does not log a fresh row for the same verdict at a different reading', async () => {
    // The numbers are blanked out of the dedup key, so drifting within the band stays quiet.
    const state = warmed({ ...WANTS_VENT, rig_t: '27.0', rig_h: '72.0' });
    await runClimateTick(deps({ ...WANTS_VENT, rig_t: '27.0', rig_h: '72.0' }, state, NOW));
    await runClimateTick(deps({ ...WANTS_VENT, rig_t: '27.2', rig_h: '71.5' }, state, NOW + 30_000));
    expect(listClimateEvents(db)).toHaveLength(1);
  });

  it('marks an armed-but-unreachable tick as a publish failure, not a dry run', async () => {
    // Without this the row is `published: false` with an unmodified reason — byte-identical to
    // an observe-mode row, so an outage reads as a deliberate dry run.
    updateClimateConfig(db, { mode: 'active', exhaustSource: 'loop' }, NOW_ISO);
    await runClimateTick({ ...deps(WANTS_VENT, warmed(WANTS_VENT)), canPublish: () => false });

    const [row] = listClimateEvents(db);
    expect(row.published).toBe(false);
    expect(row.reason).toContain('broker not connected');
  });

  it('records the switch to off once, then stays quiet through the heartbeat', async () => {
    updateClimateConfig(db, { mode: 'off' }, NOW_ISO);
    const state = new ClimateLoopState();
    await runClimateTick(deps(WANTS_VENT, state, NOW));
    expect(listClimateEvents(db)).toHaveLength(1);

    await runClimateTick(deps(WANTS_VENT, state, NOW + 20 * 60_000));
    expect(listClimateEvents(db)).toHaveLength(1);
  });

  describe('restart warm-up', () => {
    // The loop restarts on every deploy, and on tick 1 the median IS the single sample while
    // every relay timer is still null — so nothing else would damp a glitch.
    it('refuses to act on a hot glitch in the first samples after a restart', async () => {
      updateClimateConfig(db, { mode: 'active', exhaustSource: 'loop' }, NOW_ISO);
      const cold = new ClimateLoopState();
      const result = await runClimateTick(deps({ ...WANTS_VENT, rig_t: '33.0' }, cold, NOW));

      expect(result.decision).toEqual({ kind: 'hold', reason: 'smoothing window still filling' });
      expect(published).toEqual([]);
    });

    it('refuses to act on a cold glitch that would force-stop a running fan', async () => {
      updateClimateConfig(db, { mode: 'active', exhaustSource: 'loop' }, NOW_ISO);
      const cold = new ClimateLoopState();
      const result = await runClimateTick(deps({ ...WANTS_VENT, rig_t: '12.0', fan_relay: 'ON' }, cold, NOW));

      expect(result.decision.kind).toBe('hold');
      expect(published).toEqual([]);
    });

    it('acts once the window has filled', async () => {
      updateClimateConfig(db, { mode: 'active', exhaustSource: 'loop' }, NOW_ISO);
      const state = new ClimateLoopState();
      for (let i = 0; i < MIN_SMOOTHING_SAMPLES - 1; i++) {
        await runClimateTick(deps(WANTS_VENT, state, NOW + i * 30_000));
      }
      expect(published).toEqual([]);

      const result = await runClimateTick(deps(WANTS_VENT, state, NOW + (MIN_SMOOTHING_SAMPLES - 1) * 30_000));
      expect(result.decision).toMatchObject({ kind: 'exhaust', on: true });
    });

    it('re-warms after the sensor drops out and returns', async () => {
      // reset() empties the window, so a returning sensor is a cold start again.
      const state = warmed(WANTS_VENT);
      await runClimateTick(deps({ ...WANTS_VENT, rig_t: '' }, state, NOW));
      const result = await runClimateTick(deps({ ...WANTS_VENT, rig_t: '33.0' }, state, NOW + 30_000));
      expect(result.decision.reason).toContain('smoothing window still filling');
    });
  });

  describe('temperature smoothing', () => {
    // The limits outrank VPD and bypass both the minimum-off and the predictive gate, so an
    // unsmoothed temperature would let one bad sample move the relay on its own.
    const settle = async (state: ClimateLoopState, values: Record<string, string>) => {
      for (let i = 0; i < 5; i++) await runClimateTick(deps(values, state, NOW + i * 30_000));
    };

    it('ignores a single hot outlier', async () => {
      updateClimateConfig(db, { mode: 'active', exhaustSource: 'loop' }, NOW_ISO);
      const state = new ClimateLoopState();
      const calm = { ...WANTS_VENT, rig_t: '27.0', rig_h: '72.0' };
      await settle(state, calm);
      published = [];

      const result = await runClimateTick(deps({ ...calm, rig_t: '33.0' }, state, NOW + 150_000));
      expect(result.decision.kind).toBe('hold');
      expect(published).toEqual([]);
    });

    it('ignores a single cold outlier while the fan runs', async () => {
      updateClimateConfig(db, { mode: 'active', exhaustSource: 'loop' }, NOW_ISO);
      const state = new ClimateLoopState();
      const running = { ...WANTS_VENT, rig_t: '27.0', rig_h: '72.0', fan_relay: 'ON' };
      await settle(state, running);
      published = [];

      // 12 °C is far under the 20 °C floor, which force-stops the fan ahead of every timer.
      const result = await runClimateTick(deps({ ...running, rig_t: '12.0' }, state, NOW + 150_000));
      expect(result.decision.kind).toBe('hold');
      expect(published).toEqual([]);
    });

    it('force-stops on a sustained cold excursion', async () => {
      updateClimateConfig(db, { mode: 'active', exhaustSource: 'loop' }, NOW_ISO);
      const state = new ClimateLoopState();
      const cold = { ...WANTS_VENT, rig_t: '12.0', rig_h: '72.0', fan_relay: 'ON' };
      await settle(state, cold);

      const result = await runClimateTick(deps(cold, state, NOW + 150_000));
      expect(result.decision).toMatchObject({ kind: 'exhaust', on: false });
      expect(result.decision.reason).toContain('regardless of VPD');
    });

    it('still acts on a sustained excursion', async () => {
      updateClimateConfig(db, { mode: 'active', exhaustSource: 'loop' }, NOW_ISO);
      const state = new ClimateLoopState();
      await settle(state, { ...WANTS_VENT, rig_t: '33.0', rig_h: '40.0' });
      const result = await runClimateTick(deps({ ...WANTS_VENT, rig_t: '33.0', rig_h: '40.0' }, state, NOW + 150_000));
      expect(result.decision).toMatchObject({ kind: 'exhaust', on: true });
      expect(result.decision.reason).toContain('vent limit');
    });
  });

  it('does not read an undiscovered plug as OFF, so discovery is not a transition', async () => {
    // Otherwise the first snapshot after a restart looks like the fan just started, and the
    // loop refuses to stop a fan that has in fact been running for hours.
    const state = new ClimateLoopState();
    // The ENTITY has to go, not just its state: discovery is what makes a plug commandable.
    const beforeDiscovery = ENTITIES.filter((e) => e.id !== 'fan_relay');

    await runClimateTick(deps(WANTS_VENT, state, NOW, beforeDiscovery));
    expect(state.exhaustOn).toBeNull();

    await runClimateTick(deps({ ...WANTS_VENT, fan_relay: 'ON' }, state, NOW + 30_000));
    expect(state.exhaustOn).toBe(true);
    expect(state.exhaustChangedMs).toBeNull();
  });

  it('stamps a relay change it did not cause, so a hand-flip serves the same minimum', async () => {
    const state = new ClimateLoopState();
    await runClimateTick(deps(WANTS_VENT, state, NOW));
    expect(state.exhaustChangedMs).toBeNull(); // cold start is not a transition
    await runClimateTick(deps({ ...WANTS_VENT, fan_relay: 'ON' }, state, NOW + 30_000));
    expect(state.exhaustChangedMs).toBe(NOW + 30_000);
  });
});
