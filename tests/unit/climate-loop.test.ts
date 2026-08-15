// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openClimateDb } from '../../src/lib/server/climate/db';
import { listClimateEvents, updateClimateConfig } from '../../src/lib/server/climate/store';
import { ClimateLoopState, runClimateTick } from '../../src/lib/server/climate/loop';
import { EXHAUST_NODE } from '../../src/lib/climate/model';
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

function snapshotWith(values: Record<string, string>): Snapshot {
  const nodes = [...new Set(ENTITIES.map((e) => e.nodeId ?? ''))];
  const devices: DeviceSnapshot[] = nodes.map(
    (nodeId) =>
      ({
        id: `dev_${nodeId}`,
        nodeId,
        name: nodeId,
        availability: 'online',
        entityIds: ENTITIES.filter((e) => e.nodeId === nodeId).map((e) => e.id)
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
    entities: ENTITIES,
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

function deps(values: Record<string, string>, state: ClimateLoopState, nowMs = NOW) {
  return {
    db,
    snapshot: snapshotWith(values),
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

describe('runClimateTick', () => {
  it('resolves the week target from the grow plan', async () => {
    const result = await runClimateTick(deps(WANTS_VENT, new ClimateLoopState()));
    expect(result.band).toEqual({ target: 1.0, low: 0.9, high: 1.1 });
  });

  it('decides and logs in observe mode but publishes nothing', async () => {
    const result = await runClimateTick(deps(WANTS_VENT, new ClimateLoopState()));
    expect(result.decision.action).toMatchObject({ kind: 'delegated', want: 'exhaust' });
    expect(published).toEqual([]);

    const [row] = listClimateEvents(db);
    expect(row.mode).toBe('observe');
    expect(row.published).toBe(false);
  });

  it('publishes once armed, and records the reading it decided on', async () => {
    updateClimateConfig(db, { mode: 'active', exhaustSource: 'loop' }, NOW_ISO);
    const result = await runClimateTick(deps(WANTS_VENT, new ClimateLoopState()));

    expect(result.decision.action).toMatchObject({ kind: 'exhaust', on: true });
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
    await runClimateTick({ ...deps(WANTS_VENT, new ClimateLoopState()), canPublish: () => false });
    expect(published).toEqual([]);
  });

  it('reconciles an armed firmware cycle off before acting', async () => {
    updateClimateConfig(db, { mode: 'active', exhaustSource: 'loop' }, NOW_ISO);
    await runClimateTick(deps({ ...WANTS_VENT, fan_cyc: 'ON', fan_sch: 'ON' }, new ClimateLoopState()));
    expect(published).toEqual([
      { entityId: 'fan_cyc', on: false },
      { entityId: 'fan_sch', on: false },
      { entityId: 'fan_relay', on: true }
    ]);
  });

  it('leaves the firmware arms alone while firmware still owns the fan', async () => {
    updateClimateConfig(db, { mode: 'active' }, NOW_ISO);
    await runClimateTick(deps({ ...WANTS_VENT, fan_cyc: 'ON' }, new ClimateLoopState()));
    expect(published).toEqual([]);
  });

  it('collapses an unchanged verdict into one row, then heartbeats', async () => {
    const state = new ClimateLoopState();
    // Inside the band: a hold, repeated.
    const inBand = { ...WANTS_VENT, rig_t: '27.0', rig_h: '66.5' };
    for (let i = 0; i < 5; i++) {
      await runClimateTick(deps(inBand, state, NOW + i * 30_000));
    }
    expect(listClimateEvents(db)).toHaveLength(1);

    await runClimateTick(deps(inBand, state, NOW + 15 * 60_000));
    expect(listClimateEvents(db)).toHaveLength(2);
  });

  it('logs again as soon as the verdict changes', async () => {
    updateClimateConfig(db, { mode: 'active', exhaustSource: 'loop' }, NOW_ISO);
    const state = new ClimateLoopState();
    await runClimateTick(deps(WANTS_VENT, state));
    // Fan now running and VPD driven clear of the top of band.
    await runClimateTick(deps({ ...WANTS_VENT, fan_relay: 'ON', rig_t: '28.0', rig_h: '60.0' }, state, NOW + 600_000));

    const kinds = listClimateEvents(db).map((r) => [r.kind, r.on]);
    expect(kinds).toEqual([
      ['exhaust', false],
      ['exhaust', true]
    ]);
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
    await runClimateTick(deps(WANTS_VENT, state));
    expect(state.airVpd.value()).not.toBeNull();
    await runClimateTick(deps({ ...WANTS_VENT, rig_t: '' }, state, NOW + 30_000));
    expect(state.airVpd.value()).toBeNull();
  });

  it('still records the decision when the publish fails', async () => {
    // The broker can drop between canPublish() and the write. Unwinding here would leave a
    // clean gap in the audit log at exactly the tick that failed to move the relay.
    updateClimateConfig(db, { mode: 'active', exhaustSource: 'loop' }, NOW_ISO);
    const result = await runClimateTick({
      ...deps(WANTS_VENT, new ClimateLoopState()),
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

  it('records the arms it disarmed, so a firmware arm it is fighting is visible', async () => {
    updateClimateConfig(db, { mode: 'active', exhaustSource: 'loop' }, NOW_ISO);
    const state = new ClimateLoopState();
    // Inside the band, so the verdict is a plain hold and only the arms distinguish the tick.
    const inBand = { ...WANTS_VENT, rig_t: '27.0', rig_h: '66.5', fan_cyc: 'ON' };
    await runClimateTick(deps(inBand, state));

    const [row] = listClimateEvents(db);
    expect(row.kind).toBe('hold');
    expect(row.reason).toContain('disarmed fan_cycle');
    expect(row.published).toBe(true);
  });

  it('logs the moment a firmware arm starts fighting a previously quiet loop', async () => {
    updateClimateConfig(db, { mode: 'active', exhaustSource: 'loop' }, NOW_ISO);
    const state = new ClimateLoopState();
    const inBand = { ...WANTS_VENT, rig_t: '27.0', rig_h: '66.5' };

    await runClimateTick(deps(inBand, state, NOW));
    await runClimateTick(deps(inBand, state, NOW + 30_000));
    expect(listClimateEvents(db)).toHaveLength(1);

    // Same verdict, but now something is re-arming the plug underneath the loop.
    await runClimateTick(deps({ ...inBand, fan_cyc: 'ON' }, state, NOW + 60_000));
    expect(listClimateEvents(db)).toHaveLength(2);
    expect(listClimateEvents(db)[0].reason).toContain('disarmed fan_cycle');
  });

  it('stamps a relay change it did not cause, so a hand-flip serves the same minimum', async () => {
    const state = new ClimateLoopState();
    await runClimateTick(deps(WANTS_VENT, state, NOW));
    expect(state.exhaustChangedMs).toBeNull(); // cold start is not a transition
    await runClimateTick(deps({ ...WANTS_VENT, fan_relay: 'ON' }, state, NOW + 30_000));
    expect(state.exhaustChangedMs).toBe(NOW + 30_000);
  });
});
