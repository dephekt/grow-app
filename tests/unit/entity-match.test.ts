// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { describe, expect, it } from 'vitest';
import {
  findQuantumPpfdEntity,
  hasUnreadableState,
  hasQuantumPpfd,
  isAmbientTemperature,
  isExternalReference,
  isHumidity,
  isQuantumPpfd,
  liveQuantumMetric,
  liveQuantumPpfd,
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

// Retained discovery can outlive a retired publisher, so resolver behavior must
// not depend on whether that node's entities arrive before the active climate rig.
const climateRigCo2 = makeEntity('climate-rig', { id: 'rig_co2', name: 'CO2', objectId: 'co2' });
const climateRigHumidity = makeEntity('climate-rig', {
  id: 'rig_humidity',
  name: 'Humidity',
  objectId: 'humidity',
  deviceClass: 'humidity'
});
const airqCo2 = makeEntity('m5stack-airq', { id: 'airq_co2', name: 'CO2', objectId: 'co2' });
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

describe('resolveClimateDevice', () => {
  it('never binds CLIMATE to a retired device, regardless of entity order', () => {
    const ordered = [climateRigCo2, airqCo2, airqHumidity, climateRigHumidity];
    const reversed = [...ordered].reverse();
    expect(resolveClimateDevice(makeSnapshot(ordered))?.nodeId).toBe('climate-rig');
    expect(resolveClimateDevice(makeSnapshot(reversed))?.nodeId).toBe('climate-rig');
  });

  it('does not fall back to a retired device via humidity when the climate rig lacks CO₂', () => {
    const snapshot = makeSnapshot([airqCo2, airqHumidity, climateRigHumidity]);
    expect(resolveClimateDevice(snapshot)?.nodeId).toBe('climate-rig');
  });

  it('leaves CLIMATE unresolved when only the retired device remains in discovery', () => {
    const snapshot = makeSnapshot([airqCo2, airqHumidity]);
    expect(resolveClimateDevice(snapshot)).toBeUndefined();
  });

  // A TEROS substrate probe reports °C from inside the pot. Without the substrate
  // guard in isAmbientTemperature it satisfies resolveClimateDevice's third
  // fallback, so a late-arriving air rig would hand CLIMATE to a soil probe.
  it('never binds CLIMATE to a substrate probe when no air rig has been discovered', () => {
    const substrateTemp = makeEntity('substrate-a', {
      id: 'substrate_a_temperature',
      name: 'Substrate Temperature',
      objectId: 'substrate_temperature',
      deviceClass: 'temperature',
      unit: '°C'
    });
    expect(resolveClimateDevice(makeSnapshot([substrateTemp]))).toBeUndefined();

    // Positive control on the SAME fixture: only the objectId differs, so this
    // asserts the exclusion above is what rejected it, not a malformed snapshot.
    const airTemp = makeEntity('substrate-a', {
      id: 'substrate_a_temperature',
      name: 'Air Temperature',
      objectId: 'air_temperature',
      deviceClass: 'temperature',
      unit: '°C'
    });
    expect(resolveClimateDevice(makeSnapshot([airTemp]))?.nodeId).toBe('substrate-a');
  });

  // The objectId is a contract with OUR publisher; the display name is all a
  // third-party integration may carry. A soil probe that publishes a bare
  // "temperature" must still be kept out of the air slot.
  it('rejects a substrate probe that names its medium only in the display name', () => {
    const named = makeEntity('some-probe', {
      id: 'probe_temperature',
      name: 'Substrate Temperature',
      objectId: 'temperature',
      deviceClass: 'temperature',
      unit: '°C'
    });
    expect(resolveClimateDevice(makeSnapshot([named]))).toBeUndefined();

    const rootZone = makeEntity('some-probe', {
      id: 'probe_temperature',
      name: 'Root Zone Temp',
      objectId: 'temperature',
      deviceClass: 'temperature',
      unit: '°C'
    });
    expect(resolveClimateDevice(makeSnapshot([rootZone]))).toBeUndefined();
  });

  // The other half of that rule, and the reason the name check is not simply the whole
  // exclusion list: "internal" and "board" describe plenty of sensors that really are
  // reporting the air. Widening the name match to cover them would silently empty the
  // CLIMATE card for anyone who named their rig this way.
  it('still accepts an air sensor whose NAME contains a hardware-internal word', () => {
    for (const name of ['Internal Room Temp', 'Board Room Sensor', 'Chip Tent Probe']) {
      const air = makeEntity('air-rig', {
        id: 'air_temperature',
        name,
        objectId: 'temperature',
        deviceClass: 'temperature',
        unit: '°C'
      });
      expect(resolveClimateDevice(makeSnapshot([air]))?.nodeId, name).toBe('air-rig');
    }
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

  // The regression. The Apogee publisher emits a daily peak alongside the live reading, and it
  // carries the identical unit — so the unit fallback, on its own, cannot tell a measurement from
  // a summary of measurements.
  it('does not match the daily peak, which shares the live entity\'s exact unit', () => {
    const peak = makeEntity('quantum-sensor', {
      id: 'qs_peak',
      name: 'Peak PPFD today',
      objectId: 'peak_ppfd',
      unit: 'µmol/s/m²'
    });
    expect(isQuantumPpfd(peak)).toBe(false);
  });

  it('rejects aggregate ids by whole segment, not by substring', () => {
    const mk = (objectId: string) =>
      makeEntity('quantum-sensor', { id: `qs_${objectId}`, name: objectId, objectId, unit: 'µmol/s/m²' });
    for (const oid of ['peak_ppfd', 'ppfd_max', 'daily_ppfd', 'avg_ppfd', 'ppfd_total']) {
      expect(isQuantumPpfd(mk(oid)), oid).toBe(false);
    }
    // "peakiness" and "maximal" merely CONTAIN an aggregate word; they are not aggregates.
    for (const oid of ['canopy_par', 'peakiness_par', 'maximal_par']) {
      expect(isQuantumPpfd(mk(oid)), oid).toBe(true);
    }
  });
});

describe('findQuantumPpfdEntity', () => {
  const ppfd = makeEntity('quantum-sensor', { id: 'qs_ppfd', name: 'Canopy PPFD', objectId: 'ppfd', unit: 'µmol/s/m²' });
  const peak = makeEntity('quantum-sensor', {
    id: 'qs_peak',
    name: 'Peak PPFD today',
    objectId: 'peak_ppfd',
    unit: 'µmol/s/m²'
  });

  // Discovery configs arrive retained, in broker order, and the two callers iterate different
  // collections — the client a name-sorted array, the server an insertion-ordered Map. The
  // resolver must not depend on which one it got.
  it('binds to the live reading regardless of iteration order', () => {
    expect(findQuantumPpfdEntity([ppfd, peak])?.objectId).toBe('ppfd');
    expect(findQuantumPpfdEntity([peak, ppfd])?.objectId).toBe('ppfd');
  });

  // The window that mattered: during the retained-discovery burst the peak can arrive first and
  // be the only µmol entity present. Resolving to it there would anchor a spectrum calibration
  // against the day's peak instead of the live value — a persisted wrong number, not a glitch.
  it('resolves to nothing rather than to the peak when the live reading has not arrived yet', () => {
    expect(findQuantumPpfdEntity([peak])).toBeUndefined();
  });

  it('still honours the unit fallback for a differently-named live sensor', () => {
    const alt = makeEntity('quantum-sensor', { id: 'qs_par', name: 'PAR', objectId: 'canopy_par', unit: 'µmol/m²/s' });
    expect(findQuantumPpfdEntity([alt])?.objectId).toBe('canopy_par');
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

  it('reads a sibling metric value on the quantum device', () => {
    const snap = makeSnapshot([ppfd, mv, tilt]);
    snap.states = {
      [mv.id]: { value: '1.8972', updatedAt: null },
      [tilt.id]: { value: '5.70', updatedAt: null }
    };
    expect(liveQuantumMetric(snap, 'detector_mv')).toBe(1.8972);
    expect(liveQuantumMetric(snap, 'tilt')).toBe(5.7);
  });

  it('reads a legitimate 0 reading (tilt level / detector dark), not null', () => {
    const snap = makeSnapshot([ppfd, tilt]);
    snap.states = { [tilt.id]: { value: '0', updatedAt: null } };
    expect(liveQuantumMetric(snap, 'tilt')).toBe(0);
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

  it('ignores a same-objectId sibling on a DIFFERENT device', () => {
    const otherTilt = makeEntity('other-rig', { id: 'other_tilt', name: 'Tilt', objectId: 'tilt', unit: '°' });
    const snap = makeSnapshot([ppfd, otherTilt]);
    snap.states = { [otherTilt.id]: { value: '9.9', updatedAt: null } };
    expect(liveQuantumMetric(snap, 'tilt')).toBeNull();
  });
});

describe('hasUnreadableState', () => {
  const lux = makeEntity('climate-rig', {
    id: 'rig_illuminance',
    name: 'Illuminance',
    objectId: 'illuminance',
    deviceClass: 'illuminance',
    unit: 'lx'
  });

  function snapshotWithLux(value: string | undefined): Snapshot {
    const snap = makeSnapshot([climateRigCo2, lux]);
    return value === undefined ? snap : { ...snap, states: { [lux.id]: { value, updatedAt: null } } };
  }

  it('flags the markers ESPHome publishes when a sensor cannot read', () => {
    expect(hasUnreadableState(snapshotWithLux('nan'), lux)).toBe(true);
    expect(hasUnreadableState(snapshotWithLux('-inf'), lux)).toBe(true);
    expect(hasUnreadableState(snapshotWithLux(' NaN '), lux)).toBe(true);
  });

  it('does not flag a real reading, including zero', () => {
    expect(hasUnreadableState(snapshotWithLux('812.4'), lux)).toBe(false);
    expect(hasUnreadableState(snapshotWithLux('0'), lux)).toBe(false);
  });

  // "Has not reported yet" is a different statement from "cannot read": a booting device should
  // keep its rows and show the placeholder, not look like it has no sensors.
  it('does not flag an entity that has simply not reported yet', () => {
    expect(hasUnreadableState(snapshotWithLux(undefined), lux)).toBe(false);
    expect(hasUnreadableState(snapshotWithLux(''), lux)).toBe(false);
  });
});

// The room node the exhaust fan draws from reads like a perfectly good air sensor, which is
// exactly the hazard: resolveClimateDevice falls back to humidity and then ambient
// temperature, so it would capture the tent's CLIMATE card whenever the in-tent rig is
// undiscovered and present room air as canopy air.
describe('external reference sensors', () => {
  const extTemp = makeEntity('feather-air-monitor', {
    id: 'feather_ext_temperature',
    name: 'Ext Temperature',
    objectId: 'ext_temperature',
    deviceClass: 'temperature',
    unit: '°C'
  });
  const extHumidity = makeEntity('feather-air-monitor', {
    id: 'feather_ext_humidity',
    name: 'Ext Humidity',
    objectId: 'ext_humidity',
    deviceClass: 'humidity'
  });

  it('recognises the ext prefix on both objectId and display name', () => {
    expect(isExternalReference(extTemp)).toBe(true);
    expect(isExternalReference(extHumidity)).toBe(true);
    expect(
      isExternalReference(
        makeEntity('n', { id: 'a', name: 'Ext. Temperature', objectId: 'whatever', deviceClass: 'temperature' })
      )
    ).toBe(true);
  });

  it('keeps them out of the ambient air slots', () => {
    expect(isAmbientTemperature(extTemp)).toBe(false);
    expect(isHumidity(extHumidity)).toBe(false);
  });

  it('never binds CLIMATE to the external node when no in-tent rig has been discovered', () => {
    expect(resolveClimateDevice(makeSnapshot([extTemp, extHumidity]))).toBeUndefined();

    // Positive control on the SAME fixture: only the naming differs, so this asserts the
    // exclusion is what rejected it rather than a malformed snapshot.
    const tentTemp = makeEntity('feather-air-monitor', {
      id: 'feather_ext_temperature',
      name: 'Temperature',
      objectId: 'temperature',
      deviceClass: 'temperature',
      unit: '°C'
    });
    expect(resolveClimateDevice(makeSnapshot([tentTemp]))?.nodeId).toBe('feather-air-monitor');
  });

  it('yields CLIMATE to the in-tent rig even when the external node is discovered first', () => {
    const rigCo2 = makeEntity('atoms3u-sensor-rig', { id: 'rig_co2', name: 'CO2', objectId: 'co2' });
    expect(resolveClimateDevice(makeSnapshot([extTemp, extHumidity, rigCo2]))?.nodeId).toBe('atoms3u-sensor-rig');
  });

  // Word/segment anchored so ordinary ids that merely contain the letters are unaffected.
  it('does not catch unrelated names that merely contain the letters', () => {
    expect(
      isExternalReference(makeEntity('n', { id: 'b', name: 'Next Temperature', objectId: 'next_temperature' }))
    ).toBe(false);
    expect(isExternalReference(makeEntity('n', { id: 'c', name: 'Extractor Power', objectId: 'extractor_power' }))).toBe(
      false
    );
  });
});
