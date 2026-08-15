// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { describe, expect, it } from 'vitest';
import { resolveClimateInputs } from '../../src/lib/climate/inputs';
import { EXHAUST_NODE } from '../../src/lib/climate/model';
import type { DeviceSnapshot, EntityConfig, EntityState, Snapshot } from '../../src/lib/server/mqtt/types';

/** Matches the fixture's state `updatedAt`, so nothing reads as stale unless a test says so. */
const NOW = Date.parse('2026-08-14T12:00:00.000Z');

const RIG = 'atoms3u-sensor-rig';
const ROOM = 'feather-air-monitor';
const LIGHT = 'grow-light';

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

function makeSnapshot(
  entities: EntityConfig[],
  values: Record<string, string>,
  availabilityByNode: Record<string, string> = {},
  updatedAtById: Record<string, string> = {}
): Snapshot {
  const nodes = [...new Set(entities.map((e) => e.nodeId ?? ''))];
  const devices: DeviceSnapshot[] = nodes.map(
    (nodeId) =>
      ({
        id: `dev_${nodeId}`,
        nodeId,
        name: nodeId,
        availability: availabilityByNode[nodeId] ?? 'online',
        entityIds: entities.filter((e) => e.nodeId === nodeId).map((e) => e.id)
      }) as DeviceSnapshot
  );
  const states: Record<string, EntityState> = {};
  for (const [id, value] of Object.entries(values)) {
    states[id] = { value, updatedAt: updatedAtById[id] ?? '2026-08-14T12:00:00.000Z' };
  }
  return {
    site: 'daniel-home',
    timezone: 'UTC',
    topicPrefix: 'grow/daniel-home',
    discoveryPrefix: 'grow/daniel-home/_discovery',
    generatedAt: '2026-08-14T12:00:00.000Z',
    broker: { connected: true, connecting: false, error: null, lastConnectedAt: null, lastMessageAt: null },
    devices,
    entities,
    states,
    uiConfigs: {},
    lights: [],
    firmware: { devices: {}, channels: {} }
  } as unknown as Snapshot;
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

/** The live fleet in miniature: in-tent rig, room feather, exhaust plug with its arms, lamp. */
function fullFleet() {
  return [
    makeEntity(RIG, { id: 'rig_t', name: 'Temperature', objectId: 'temperature', deviceClass: 'temperature', unit: '°C' }),
    makeEntity(RIG, { id: 'rig_h', name: 'Humidity', objectId: 'humidity', deviceClass: 'humidity', unit: '%' }),
    makeEntity(RIG, { id: 'rig_co2', name: 'CO2', objectId: 'co2', deviceClass: 'carbon_dioxide', unit: 'ppm' }),
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
    sw(EXHAUST_NODE, 'fan_sch', 'fan_schedule'),
    sw(LIGHT, 'light_relay', 'grow_light')
  ];
}

const LIVE_VALUES = {
  rig_t: '27.18',
  rig_h: '63.5',
  rig_co2: '1200',
  room_t: '25.02',
  room_h: '61.4',
  fan_relay: 'ON',
  fan_cyc: 'OFF',
  fan_sch: 'OFF',
  light_relay: 'ON'
};

describe('resolveClimateInputs', () => {
  it('reads tent air from the CLIMATE device and computes its air VPD', () => {
    const inputs = resolveClimateInputs(makeSnapshot(fullFleet(), LIVE_VALUES), NOW);
    expect(inputs.tent).toEqual({ tempC: 27.18, rhPct: 63.5 });
    expect(inputs.tentNode).toBe(RIG);
    expect(inputs.airVpd).toBeCloseTo(1.32, 2);
  });

  it('reads room air from the external-reference guard, not a hardcoded node', () => {
    const inputs = resolveClimateInputs(makeSnapshot(fullFleet(), LIVE_VALUES), NOW);
    expect(inputs.room).toEqual({ tempC: 25.02, rhPct: 61.4 });
    expect(inputs.roomNode).toBe(ROOM);
  });

  it('never mistakes the room sensor for the tent', () => {
    // The whole point of the Ext prefix: with the rig gone, tent air must read null rather
    // than quietly falling back to the room and presenting it as canopy air.
    const withoutRig = fullFleet().filter((e) => e.nodeId !== RIG);
    const inputs = resolveClimateInputs(makeSnapshot(withoutRig, LIVE_VALUES), NOW);
    expect(inputs.tent).toBeNull();
    expect(inputs.airVpd).toBeNull();
    expect(inputs.room).not.toBeNull();
  });

  it('resolves the exhaust relay and both firmware arms', () => {
    const inputs = resolveClimateInputs(makeSnapshot(fullFleet(), { ...LIVE_VALUES, fan_cyc: 'ON' }), NOW);
    expect(inputs.exhaust.present).toBe(true);
    expect(inputs.exhaust.on).toBe(true);
    expect(inputs.arms.map((a) => a.objectId)).toEqual(['fan_cycle', 'fan_schedule']);
    expect(inputs.arms.filter((a) => a.on).map((a) => a.objectId)).toEqual(['fan_cycle']);
  });

  it('treats an offline plug as absent — a command to it cannot land', () => {
    const inputs = resolveClimateInputs(
      makeSnapshot(fullFleet(), LIVE_VALUES, { [EXHAUST_NODE]: 'offline' }),
      NOW
    );
    expect(inputs.exhaust.present).toBe(false);
  });

  it('drops tent air when its device goes offline rather than using the retained value', () => {
    const inputs = resolveClimateInputs(makeSnapshot(fullFleet(), LIVE_VALUES, { [RIG]: 'offline' }), NOW);
    expect(inputs.tent).toBeNull();
    expect(inputs.airVpd).toBeNull();
  });

  it('requires BOTH halves of an air pair', () => {
    const noHumidity = fullFleet().filter((e) => e.id !== 'rig_h');
    expect(resolveClimateInputs(makeSnapshot(noHumidity, LIVE_VALUES), NOW).tent).toBeNull();
  });

  it('ignores a blank retained payload instead of reading it as zero', () => {
    const inputs = resolveClimateInputs(makeSnapshot(fullFleet(), { ...LIVE_VALUES, rig_t: '' }), NOW);
    expect(inputs.tent).toBeNull();
  });

  it('ignores an unreadable (nan) payload', () => {
    const inputs = resolveClimateInputs(makeSnapshot(fullFleet(), { ...LIVE_VALUES, room_h: 'nan' }), NOW);
    expect(inputs.room).toBeNull();
  });

  it('reports the lamp from its relay', () => {
    expect(resolveClimateInputs(makeSnapshot(fullFleet(), LIVE_VALUES), NOW).lightsOn).toBe(true);
    expect(
      resolveClimateInputs(makeSnapshot(fullFleet(), { ...LIVE_VALUES, light_relay: 'OFF' }), NOW).lightsOn
    ).toBe(false);
  });

  it('falls back to PPFD when the light plug is undiscovered', () => {
    const noLight = fullFleet().filter((e) => e.nodeId !== LIGHT);
    const withPpfd = [
      ...noLight,
      makeEntity('quantum-sensor', { id: 'ppfd', name: 'PPFD', objectId: 'ppfd', unit: 'µmol/m²/s' })
    ];
    expect(resolveClimateInputs(makeSnapshot(withPpfd, { ...LIVE_VALUES, ppfd: '420' }), NOW).lightsOn).toBe(true);
    expect(resolveClimateInputs(makeSnapshot(withPpfd, { ...LIVE_VALUES, ppfd: '0' }), NOW).lightsOn).toBe(false);
  });

  it('reports no humidifier until a fifth plug exists', () => {
    const inputs = resolveClimateInputs(makeSnapshot(fullFleet(), LIVE_VALUES), NOW);
    expect(inputs.humidifier.present).toBe(false);
    expect(inputs.humidifier.on).toBe(false);
  });

  it('leaves leaf VPD null when there is no thermal ROI', () => {
    expect(resolveClimateInputs(makeSnapshot(fullFleet(), LIVE_VALUES), NOW).leafVpd).toBeNull();
  });

  describe('staleness', () => {
    const aged = (id: string, minutes: number) => ({
      [id]: new Date(NOW - minutes * 60_000).toISOString()
    });

    it('drops a reading a node stopped publishing, even with no offline LWT', () => {
      // The failure `isEntityOffline` cannot see: yanked power leaves availability `unknown`
      // and the retained value on the broker forever.
      const snapshot = makeSnapshot(fullFleet(), LIVE_VALUES, {}, aged('rig_t', 30));
      const inputs = resolveClimateInputs(snapshot, NOW);
      expect(inputs.tent).toBeNull();
      expect(inputs.airVpd).toBeNull();
    });

    it('drops the room reference on the same rule', () => {
      const snapshot = makeSnapshot(fullFleet(), LIVE_VALUES, {}, aged('room_h', 30));
      expect(resolveClimateInputs(snapshot, NOW).room).toBeNull();
    });

    it('keeps a reading that is merely a few minutes old', () => {
      const snapshot = makeSnapshot(fullFleet(), LIVE_VALUES, {}, aged('rig_t', 4));
      expect(resolveClimateInputs(snapshot, NOW).tent).not.toBeNull();
    });

    it('drops a reading with no timestamp at all', () => {
      const snapshot = makeSnapshot(fullFleet(), LIVE_VALUES);
      snapshot.states.rig_h = { value: '63.5', updatedAt: null };
      expect(resolveClimateInputs(snapshot, NOW).tent).toBeNull();
    });
  });

  it('prefers PPFD over an offline light plug’s retained relay position', () => {
    // Discovery is retained, so the relay entity outlives its device; believing its last known
    // position flips the vented-temperature offset by 2.8 °C.
    const withPpfd = [
      ...fullFleet(),
      makeEntity('quantum-sensor', { id: 'ppfd', name: 'PPFD', objectId: 'ppfd', unit: 'µmol/m²/s' })
    ];
    const snapshot = makeSnapshot(withPpfd, { ...LIVE_VALUES, light_relay: 'OFF', ppfd: '900' }, { [LIGHT]: 'offline' });
    expect(resolveClimateInputs(snapshot, NOW).lightsOn).toBe(true);
  });

  it('never takes a dewpoint as the room reference', () => {
    // Same deviceClass and unit as a real air temperature, and it sorts first.
    const withDewpoint = [
      makeEntity(ROOM, {
        id: 'room_dew',
        name: 'Ext Dewpoint',
        objectId: 'ext_dewpoint',
        deviceClass: 'temperature',
        unit: '°C'
      }),
      ...fullFleet()
    ];
    const inputs = resolveClimateInputs(makeSnapshot(withDewpoint, { ...LIVE_VALUES, room_dew: '15.0' }), NOW);
    expect(inputs.room).toEqual({ tempC: 25.02, rhPct: 61.4 });
  });

  it('picks the room reference deterministically when two exist', () => {
    // A bare .find() would bind whichever entity happened to sort first in discovery order,
    // silently switching the futility gate's input between restarts.
    const spare = makeEntity('spare-feather', {
      id: 'spare_t',
      name: 'Ext Temperature',
      objectId: 'ext_temperature',
      deviceClass: 'temperature',
      unit: '°C'
    });
    const spareRh = makeEntity('spare-feather', {
      id: 'spare_h',
      name: 'Ext Humidity',
      objectId: 'ext_humidity',
      deviceClass: 'humidity',
      unit: '%'
    });
    const values = { ...LIVE_VALUES, spare_t: '30.0', spare_h: '20.0' };
    const forward = resolveClimateInputs(makeSnapshot([...fullFleet(), spare, spareRh], values), NOW);
    const reversed = resolveClimateInputs(makeSnapshot([spare, spareRh, ...fullFleet()], values), NOW);
    expect(forward.roomNode).toBe(reversed.roomNode);
    expect(forward.room).toEqual(reversed.room);
  });

  it('never takes a daily-max aggregate as the room reference', () => {
    const withDailyMax = [
      makeEntity(ROOM, {
        id: 'room_max',
        name: 'Ext Daily Max Temperature',
        objectId: 'ext_daily_max_temperature',
        deviceClass: 'temperature',
        unit: '°C'
      }),
      ...fullFleet()
    ];
    const inputs = resolveClimateInputs(makeSnapshot(withDailyMax, { ...LIVE_VALUES, room_max: '31.0' }), NOW);
    expect(inputs.room).toEqual({ tempC: 25.02, rhPct: 61.4 });
  });
});
