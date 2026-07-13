import { describe, expect, it } from 'vitest';
import type { DeviceSnapshot, EntityConfig, Snapshot } from '../../src/lib/server/mqtt/types';
import {
  resolveEntity,
  numericValue,
  openSprinklerAvailability,
  anyStationRunning,
  irrigationDrawing,
  runoffRunning,
  IRRIGATION_NODE,
  RUNOFF_NODE
} from '../../src/lib/irrigation/model';

function makeEntity(
  nodeId: string,
  overrides: Partial<EntityConfig> & { id: string; name: string; objectId: string }
): EntityConfig {
  return {
    component: 'sensor',
    uniqueId: overrides.id,
    nodeId,
    device: { identifiers: [nodeId], name: nodeId, manufacturer: 'stackdrift', model: nodeId },
    payloadAvailable: 'online',
    payloadNotAvailable: 'offline',
    dangerous: false,
    writable: false,
    raw: {},
    ...overrides
  };
}

function makeDevice(id: string, availability: 'online' | 'offline' | 'unknown'): DeviceSnapshot {
  return { id, nodeId: id, name: id, availability, entityIds: [] };
}

function snap(opts: {
  entities?: EntityConfig[];
  states?: Record<string, { value: string | null }>;
  devices?: DeviceSnapshot[];
}): Snapshot {
  return {
    entities: opts.entities ?? [],
    states: opts.states ?? {},
    devices: opts.devices ?? []
  } as unknown as Snapshot;
}

// Both plugs publish objectId "voltage" — resolution MUST disambiguate by node.
const irrigVoltage = makeEntity(IRRIGATION_NODE, { id: 'irrig_voltage', name: 'Voltage', objectId: 'voltage', unit: 'V' });
const runoffVoltage = makeEntity(RUNOFF_NODE, { id: 'runoff_voltage', name: 'Voltage', objectId: 'voltage', unit: 'V' });
const pumpPower = makeEntity(IRRIGATION_NODE, { id: 'irrig_pump_power', name: 'Pump Power', objectId: 'pump_power', unit: 'W' });
const station1 = makeEntity('opensprinkler', {
  id: 'opensprinkler_station_1',
  name: 'Zone 1',
  objectId: 'station_1',
  component: 'binary_sensor',
  payloadOn: 'ON'
});

describe('irrigation model — entity resolution', () => {
  it('disambiguates a shared objectId by node', () => {
    const s = snap({ entities: [irrigVoltage, runoffVoltage] });
    expect(resolveEntity(s, { node: IRRIGATION_NODE, objectId: 'voltage' })?.id).toBe('irrig_voltage');
    expect(resolveEntity(s, { node: RUNOFF_NODE, objectId: 'voltage' })?.id).toBe('runoff_voltage');
  });

  it('numericValue reads and parses the live state, null when absent', () => {
    const s = snap({ entities: [pumpPower], states: { irrig_pump_power: { value: '62.4' } } });
    expect(numericValue(s, { node: IRRIGATION_NODE, objectId: 'pump_power' })).toBeCloseTo(62.4);
    expect(numericValue(snap({ entities: [pumpPower] }), { node: IRRIGATION_NODE, objectId: 'pump_power' })).toBeNull();
  });
});

describe('irrigation model — OpenSprinkler status', () => {
  it('reads availability from the opensprinkler device; unknown when absent', () => {
    expect(openSprinklerAvailability(snap({ devices: [makeDevice('opensprinkler', 'online')] }))).toBe('online');
    expect(openSprinklerAvailability(snap({ devices: [makeDevice('opensprinkler', 'offline')] }))).toBe('offline');
    expect(openSprinklerAvailability(snap({}))).toBe('unknown');
  });

  it('anyStationRunning is true only when a station binary_sensor reads ON', () => {
    expect(anyStationRunning(snap({ entities: [station1], states: { opensprinkler_station_1: { value: 'ON' } } }))).toBe(true);
    expect(anyStationRunning(snap({ entities: [station1], states: { opensprinkler_station_1: { value: 'OFF' } } }))).toBe(false);
    expect(anyStationRunning(snap({ entities: [station1] }))).toBe(false);
  });
});

describe('irrigation model — pump running', () => {
  it('irrigationDrawing crosses the draw threshold (5 W above the 3 W noise floor)', () => {
    const base = { entities: [pumpPower] };
    expect(irrigationDrawing(snap({ ...base, states: { irrig_pump_power: { value: '62.4' } } }))).toBe(true);
    expect(irrigationDrawing(snap({ ...base, states: { irrig_pump_power: { value: '0' } } }))).toBe(false);
    expect(irrigationDrawing(snap({ ...base, states: { irrig_pump_power: { value: '4' } } }))).toBe(false);
  });

  it('runoffRunning reads the binary sensor against payloadOn', () => {
    const running = makeEntity(RUNOFF_NODE, {
      id: 'runoff_run',
      name: 'Runoff Pump Running',
      objectId: 'runoff_pump_running',
      component: 'binary_sensor',
      payloadOn: 'ON'
    });
    expect(runoffRunning(snap({ entities: [running], states: { runoff_run: { value: 'ON' } } }))).toBe(true);
    expect(runoffRunning(snap({ entities: [running], states: { runoff_run: { value: 'OFF' } } }))).toBe(false);
    expect(runoffRunning(snap({ entities: [running] }))).toBe(false);
  });
});
