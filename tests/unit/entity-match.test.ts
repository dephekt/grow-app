import { describe, expect, it } from 'vitest';
import { isAirQualityMetric, resolveAirQualityDevice, resolveClimateDevice } from '../../src/lib/entity-match';
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
