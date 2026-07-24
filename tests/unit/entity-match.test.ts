import { describe, expect, it } from 'vitest';
import {
  findQuantumPpfdEntity,
  hasQuantumPpfd,
  isAirQualityMetric,
  isQuantumPpfd,
  liveQuantumMetric,
  liveQuantumPpfd,
  resolveAirQualityDevice,
  resolveClimateDevice
} from '../../src/lib/entity-match';
import type { DeviceSnapshot, EntityConfig, Snapshot } from '../../src/lib/server/mqtt/types';

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

function makeDevice(nodeId: string, entities: EntityConfig[]): DeviceSnapshot {
  return {
    id: nodeId,
    nodeId,
    name: nodeId,
    availability: 'online',
    entityIds: entities.map((e) => e.id)
  };
}

// Mirrors the real fleet: the climate rig (SCD41) and the air monitor (SCD40 +
// SEN55) BOTH publish a CO₂ sensor named exactly "CO2", so resolver behavior
// must not depend on which one appears first in the snapshot.
const climateRigCo2 = makeEntity('climate-rig', { id: 'rig_co2', name: 'CO2', objectId: 'co2' });
const climateRigHumidity = makeEntity('climate-rig', {
  id: 'rig_humidity',
  name: 'Humidity',
  objectId: 'humidity',
  deviceClass: 'humidity'
});
const airqCo2 = makeEntity('m5stack-airq', { id: 'airq_co2', name: 'CO2', objectId: 'co2' });
const airqPm25 = makeEntity('m5stack-airq', { id: 'airq_pm25', name: 'PM <2.5um', objectId: 'pm__2_5um' });
const airqVoc = makeEntity('m5stack-airq', { id: 'airq_voc', name: 'VOC Index', objectId: 'voc_index' });
const airqHumidity = makeEntity('m5stack-airq', {
  id: 'airq_humidity',
  name: 'SEN55 Humidity',
  objectId: 'sen55_humidity',
  deviceClass: 'humidity'
});

function makeSnapshot(entities: EntityConfig[]): Snapshot {
  const byNode = new Map<string, EntityConfig[]>();
  for (const e of entities) byNode.set(e.nodeId ?? '', [...(byNode.get(e.nodeId ?? '') ?? []), e]);
  return {
    site: 'daniel-home',
    timezone: 'UTC',
    topicPrefix: 'grow/daniel-home',
    discoveryPrefix: 'grow/daniel-home/_discovery',
    generatedAt: new Date().toISOString(),
    broker: { connected: true, connecting: false, error: null, lastConnectedAt: null, lastMessageAt: null },
    devices: [...byNode.entries()].map(([nodeId, list]) => makeDevice(nodeId, list)),
    entities,
    states: {},
    uiConfigs: {},
    lights: [],
    firmware: { devices: {}, channels: {} }
  };
}

describe('isAirQualityMetric', () => {
  it('matches the fleet objectId shapes and compact pm slugs', () => {
    for (const objectId of ['pm__1um', 'pm__2_5um', 'pm_10_0', 'pm25', 'pm4_0', 'voc_index', 'nox_index', 'voc']) {
      expect(isAirQualityMetric(makeEntity('n', { id: objectId, name: objectId, objectId }))).toBe(true);
    }
  });

  it('matches on the pm deviceClasses regardless of objectId', () => {
    const e = makeEntity('n', { id: 'x', name: 'x', objectId: 'fine_dust', deviceClass: 'pm25' });
    expect(isAirQualityMetric(e)).toBe(true);
  });

  it('rejects unrelated sensors and diagnostics', () => {
    for (const objectId of ['co2', 'fan_rpm_alarm', 'co2_ppm_avg', 'advocacy', 'temperature']) {
      expect(isAirQualityMetric(makeEntity('n', { id: objectId, name: objectId, objectId }))).toBe(false);
    }
    const diagnostic = makeEntity('n', {
      id: 'diag_voc',
      name: 'VOC Index',
      objectId: 'voc_index',
      entityCategory: 'diagnostic'
    });
    expect(isAirQualityMetric(diagnostic)).toBe(false);
  });
});

describe('resolveAirQualityDevice', () => {
  it('resolves the particulate/gas monitor by its PM/VOC/NOx entities', () => {
    const snapshot = makeSnapshot([climateRigCo2, airqCo2, airqPm25, airqVoc]);
    expect(resolveAirQualityDevice(snapshot)?.nodeId).toBe('m5stack-airq');
  });

  it('resolves nothing when no air-quality metrics exist', () => {
    expect(resolveAirQualityDevice(makeSnapshot([climateRigCo2, climateRigHumidity]))).toBeUndefined();
  });
});

describe('resolveClimateDevice', () => {
  it('never binds CLIMATE to the air-quality monitor, regardless of entity order', () => {
    const ordered = [climateRigCo2, airqCo2, airqPm25, airqVoc, airqHumidity, climateRigHumidity];
    const reversed = [...ordered].reverse();
    expect(resolveClimateDevice(makeSnapshot(ordered))?.nodeId).toBe('climate-rig');
    expect(resolveClimateDevice(makeSnapshot(reversed))?.nodeId).toBe('climate-rig');
  });

  it('does not fall back to the air monitor via humidity when the climate rig lacks CO₂', () => {
    const snapshot = makeSnapshot([airqCo2, airqPm25, airqHumidity, climateRigHumidity]);
    expect(resolveClimateDevice(snapshot)?.nodeId).toBe('climate-rig');
  });

  it('leaves CLIMATE unresolved when only the air monitor exists — it owns AIR QUALITY instead', () => {
    const snapshot = makeSnapshot([airqCo2, airqPm25, airqVoc, airqHumidity]);
    expect(resolveClimateDevice(snapshot)).toBeUndefined();
  });
});

describe('isQuantumPpfd', () => {
  it('matches the Apogee PPFD sensor by objectId (PPFD has no HA device_class)', () => {
    const ppfd = makeEntity('quantum-sensor', { id: 'qs_ppfd', name: 'Canopy PPFD', objectId: 'ppfd', unit: 'µmol/s/m²' });
    expect(isQuantumPpfd(ppfd)).toBe(true);
  });

  it('falls back to a µmol unit when the objectId differs', () => {
    const alt = makeEntity('quantum-sensor', { id: 'qs_par', name: 'PAR', objectId: 'canopy_par', unit: 'µmol/m²/s' });
    expect(isQuantumPpfd(alt)).toBe(true);
  });

  it('does not match the historised detector-mV / tilt diagnostics that share the device', () => {
    const mv = makeEntity('quantum-sensor', { id: 'qs_mv', name: 'Detector signal', objectId: 'detector_mv', unit: 'mV' });
    const tilt = makeEntity('quantum-sensor', { id: 'qs_tilt', name: 'Sensor tilt', objectId: 'tilt', unit: '°' });
    expect(isQuantumPpfd(mv)).toBe(false);
    expect(isQuantumPpfd(tilt)).toBe(false);
  });

  it('ignores a diagnostic-category entity even if named ppfd', () => {
    const diag = makeEntity('quantum-sensor', {
      id: 'qs_ppfd_diag',
      name: 'ppfd',
      objectId: 'ppfd',
      unit: 'µmol/s/m²',
      entityCategory: 'diagnostic'
    });
    expect(isQuantumPpfd(diag)).toBe(false);
  });
});

describe('liveQuantumPpfd', () => {
  const ppfd = makeEntity('quantum-sensor', { id: 'qs_ppfd', name: 'Canopy PPFD', objectId: 'ppfd', unit: 'µmol/s/m²' });

  it('reads the live value when the owning device is online', () => {
    const snap = makeSnapshot([ppfd]);
    snap.states = { [ppfd.id]: { value: '156.9', updatedAt: null } };
    expect(liveQuantumPpfd(snap)).toBeCloseTo(156.9);
  });

  it('returns null when the owning device is offline (its retained value is stale)', () => {
    const snap = makeSnapshot([ppfd]);
    snap.states = { [ppfd.id]: { value: '156.9', updatedAt: null } };
    snap.devices = snap.devices.map((d) => ({ ...d, availability: 'offline' as const }));
    expect(liveQuantumPpfd(snap)).toBeNull();
  });

  it('clamps dark-offset noise (a slightly-negative reading) to 0', () => {
    const snap = makeSnapshot([ppfd]);
    snap.states = { [ppfd.id]: { value: '-0.3', updatedAt: null } };
    expect(liveQuantumPpfd(snap)).toBe(0);
  });

  it('returns null when no quantum sensor is present', () => {
    expect(liveQuantumPpfd(makeSnapshot([]))).toBeNull();
  });

  it('returns null for an empty/cleared retained value (not a live 0)', () => {
    const snap = makeSnapshot([ppfd]);
    snap.states = { [ppfd.id]: { value: '', updatedAt: null } };
    expect(liveQuantumPpfd(snap)).toBeNull();
  });

  it('catches an offline device even when the entity carries no nodeId', () => {
    const noNode = makeEntity('quantum-sensor', {
      id: 'qs_ppfd',
      name: 'Canopy PPFD',
      objectId: 'ppfd',
      unit: 'µmol/s/m²',
      nodeId: undefined
    });
    const snap = makeSnapshot([noNode]);
    snap.states = { [noNode.id]: { value: '146', updatedAt: null } };
    // Owner resolved via the entity's device identifier ('quantum-sensor'), which is offline.
    snap.devices = [{ ...makeDevice('quantum-sensor', [noNode]), availability: 'offline' as const }];
    expect(liveQuantumPpfd(snap)).toBeNull();
  });
});

describe('findQuantumPpfdEntity / hasQuantumPpfd', () => {
  it('prefers the exact objectId ppfd over a µmol-unit sensor, regardless of order', () => {
    const par = makeEntity('n', { id: 'par', name: 'PAR', objectId: 'ppfd', unit: 'µmol/s/m²' });
    const other = makeEntity('n', { id: 'other', name: 'Umol thing', objectId: 'canopy_umol', unit: 'µmol/m²/s' });
    expect(findQuantumPpfdEntity([other, par])?.id).toBe('par');
    expect(findQuantumPpfdEntity([par, other])?.id).toBe('par');
  });

  it('falls back to the first µmol-unit sensor when no ppfd objectId exists', () => {
    const other = makeEntity('n', { id: 'other', name: 'Umol thing', objectId: 'canopy_umol', unit: 'µmol/m²/s' });
    expect(findQuantumPpfdEntity([other])?.id).toBe('other');
  });

  it('distinguishes a registered quantum sensor from none', () => {
    const ppfd = makeEntity('quantum-sensor', { id: 'qs_ppfd', name: 'Canopy PPFD', objectId: 'ppfd', unit: 'µmol/s/m²' });
    expect(hasQuantumPpfd(makeSnapshot([ppfd]))).toBe(true);
    expect(hasQuantumPpfd(makeSnapshot([]))).toBe(false);
  });
});

describe('liveQuantumMetric', () => {
  const ppfd = makeEntity('quantum-sensor', { id: 'qs_ppfd', name: 'Canopy PPFD', objectId: 'ppfd', unit: 'µmol/s/m²' });
  const mv = makeEntity('quantum-sensor', { id: 'qs_mv', name: 'Detector', objectId: 'detector_mv', unit: 'mV' });
  const tilt = makeEntity('quantum-sensor', { id: 'qs_tilt', name: 'Tilt', objectId: 'tilt', unit: '°' });

  it('reads a sibling metric (value + unit) on the quantum device', () => {
    const snap = makeSnapshot([ppfd, mv, tilt]);
    snap.states = {
      [mv.id]: { value: '1.8972', updatedAt: null },
      [tilt.id]: { value: '5.70', updatedAt: null }
    };
    expect(liveQuantumMetric(snap, 'detector_mv')).toEqual({ value: 1.8972, unit: 'mV' });
    expect(liveQuantumMetric(snap, 'tilt')).toEqual({ value: 5.7, unit: '°' });
  });

  it('returns null when the quantum device is offline', () => {
    const snap = makeSnapshot([ppfd, mv]);
    snap.states = { [mv.id]: { value: '1.9', updatedAt: null } };
    snap.devices = snap.devices.map((d) => ({ ...d, availability: 'offline' as const }));
    expect(liveQuantumMetric(snap, 'detector_mv')).toBeNull();
  });

  it('returns null when the metric is absent, empty, or there is no quantum sensor', () => {
    const snap = makeSnapshot([ppfd, mv]);
    snap.states = { [mv.id]: { value: '', updatedAt: null } };
    expect(liveQuantumMetric(snap, 'detector_mv')).toBeNull(); // empty value
    expect(liveQuantumMetric(snap, 'tilt')).toBeNull(); // no such entity on the device
    expect(liveQuantumMetric(makeSnapshot([]), 'detector_mv')).toBeNull(); // no quantum sensor at all
  });
});
