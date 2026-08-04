// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { describe, expect, it } from 'vitest';
import {
  deriveReadings,
  hasSubstrateProbe,
  permittivityFromCounts,
  poreWaterEc,
  resolveSubstrateProbes,
  substrateCurveFor,
  vwcFromCounts
} from '../../src/lib/substrate';
import type { DeviceSnapshot, EntityConfig, Snapshot } from '../../src/lib/server/mqtt/types';

/**
 * The reading probe A actually published from quantum-sensor the day this landed —
 * a TEROS 12 in a freshly hydrated pot of pure coco. Anchoring the maths to a real
 * sample rather than a round number keeps the expectations checkable against the
 * hardware.
 */
const LIVE = { counts: 2861.35, temperatureC: 26.6, bulkEc: 0.025 };

/**
 * METER's equations transcribed in their EXPANDED form, straight off the TEROS 11/12
 * manual §4.1. The module evaluates the same polynomials by Horner's method, so this
 * is an independent statement of the contract rather than a copy of the code — a
 * transposed coefficient or a dropped term shows up as a mismatch here.
 */
function manualSoilless(raw: number): number {
  return 6.771e-10 * raw ** 3 - 5.105e-6 * raw ** 2 + 1.302e-2 * raw - 10.848;
}
function manualMineral(raw: number): number {
  return 3.879e-4 * raw - 0.6956;
}
function manualPermittivity(raw: number): number {
  return (2.887e-9 * raw ** 3 - 2.08e-5 * raw ** 2 + 5.276e-2 * raw - 43.39) ** 2;
}

/** What the module promises: METER's polynomial, clamped to a physical volume. */
const expectedVwc = (raw: number, curve: 'soilless' | 'mineral') =>
  Math.min(1, Math.max(0, curve === 'soilless' ? manualSoilless(raw) : manualMineral(raw)));

describe('TEROS 12 water-content calibration', () => {
  it('matches METER eq. 7 (soilless) across the whole accepted range', () => {
    for (let raw = 0; raw <= 10000; raw += 25) {
      expect(vwcFromCounts(raw, 'soilless')).toBeCloseTo(expectedVwc(raw, 'soilless'), 10);
    }
  });

  it('matches METER eq. 6 (mineral) across the whole accepted range', () => {
    for (let raw = 0; raw <= 10000; raw += 25) {
      expect(vwcFromCounts(raw, 'mineral')).toBeCloseTo(expectedVwc(raw, 'mineral'), 10);
    }
  });

  /**
   * The soilless cubic passes 1.0 m³/m³ at roughly 3390 counts and keeps climbing —
   * it was fitted over a medium's usable range, not extrapolated past saturation. Well
   * above anything coco reaches (a drenched pot is ~0.70), so in practice this is the
   * probe standing in water; the clamp keeps that reporting a full pot instead of an
   * impossible 250 % volume.
   */
  it('clamps at saturation instead of extrapolating past a full pot', () => {
    expect(manualSoilless(3400)).toBeGreaterThan(1);
    expect(vwcFromCounts(3400, 'soilless')).toBe(1);
    expect(vwcFromCounts(3380, 'soilless')).toBeLessThan(1);
    expect(vwcFromCounts(9000, 'soilless')).toBe(1);
  });

  it('reads the live coco sample at ~47 % VWC', () => {
    expect(vwcFromCounts(LIVE.counts, 'soilless')).toBeCloseTo(0.473, 2);
  });

  /**
   * The whole reason the medium is configured per zone rather than compiled in. Six
   * points of VWC is the difference between "irrigate now" and "still in dryback", so
   * a silent fallback to the wrong curve is a real misread, not a rounding detail.
   */
  it('disagrees materially between the two curves on the same counts', () => {
    const soilless = vwcFromCounts(LIVE.counts, 'soilless')!;
    const mineral = vwcFromCounts(LIVE.counts, 'mineral')!;
    expect(Math.abs(soilless - mineral)).toBeGreaterThan(0.05);
  });

  it('reads zero rather than a negative volume when the probe is in air', () => {
    // Both polynomials go negative below roughly 1800 counts; a TEROS in air reads
    // near 1000.
    expect(manualSoilless(1000)).toBeLessThan(0);
    expect(vwcFromCounts(1000, 'soilless')).toBe(0);
    expect(vwcFromCounts(1000, 'mineral')).toBe(0);
  });

  it('rejects counts outside the sensor range instead of extrapolating', () => {
    expect(vwcFromCounts(-1, 'soilless')).toBeNull();
    expect(vwcFromCounts(10001, 'soilless')).toBeNull();
    expect(vwcFromCounts(Number.NaN, 'soilless')).toBeNull();
    expect(permittivityFromCounts(10001)).toBeNull();
  });
});

describe('dielectric permittivity', () => {
  it('matches METER eq. 8', () => {
    for (let raw = 2000; raw <= 4000; raw += 50) {
      expect(permittivityFromCounts(raw)).toBeCloseTo(manualPermittivity(raw), 8);
    }
  });

  it('reads the live coco sample at ~24', () => {
    expect(permittivityFromCounts(LIVE.counts)).toBeCloseTo(24.12, 1);
  });
});

describe('pore-water EC (Hilhorst)', () => {
  const liveArgs = {
    bulkEc: LIVE.bulkEc,
    permittivity: permittivityFromCounts(LIVE.counts)!,
    temperatureC: LIVE.temperatureC,
    vwc: vwcFromCounts(LIVE.counts, 'soilless')!
  };

  it('derives pore EC from the live sample', () => {
    // 77.858 × 0.025 / (24.124 − 4.1)
    expect(poreWaterEc(liveArgs)).toBeCloseTo(0.097, 3);
  });

  /**
   * The distinction the card exists to make visible. Bulk EC averages water, air and
   * solids; pore EC is the solution the roots sit in and runs several times higher.
   * Steering a feed on the bulk number under-doses badly.
   */
  it('reports pore EC well above the bulk EC it derives from', () => {
    const pore = poreWaterEc({ ...liveArgs, bulkEc: 0.73 })!;
    expect(pore / 0.73).toBeGreaterThan(3);
    expect(pore).toBeCloseTo(2.84, 1);
  });

  it('refuses the model below METER’s 0.10 m³/m³ validity floor', () => {
    expect(poreWaterEc({ ...liveArgs, vwc: 0.09 })).toBeNull();
    expect(poreWaterEc({ ...liveArgs, vwc: 0.11 })).not.toBeNull();
  });

  /**
   * σp has a pole at εb = 4.1. Without headroom a probe a few counts either side of it
   * swings between a plausible number and a wild one, so the row must drop out rather
   * than print the spike.
   */
  it('refuses to divide near the permittivity pole', () => {
    expect(poreWaterEc({ ...liveArgs, permittivity: 4.11 })).toBeNull();
    expect(poreWaterEc({ ...liveArgs, permittivity: 4.6 })).toBeNull();
    expect(poreWaterEc({ ...liveArgs, permittivity: 5.2 })).not.toBeNull();
  });

  it('compensates for temperature in the right direction', () => {
    // Water's permittivity falls as it warms, so the same bulk EC implies a more
    // concentrated solution at a lower temperature.
    const cold = poreWaterEc({ ...liveArgs, temperatureC: 15 })!;
    const hot = poreWaterEc({ ...liveArgs, temperatureC: 30 })!;
    expect(cold).toBeGreaterThan(hot);
  });

  it('rejects a negative bulk EC', () => {
    expect(poreWaterEc({ ...liveArgs, bulkEc: -0.1 })).toBeNull();
  });
});

describe('curve selection from the zone medium', () => {
  it('recognises the media the zone editor offers', () => {
    expect(substrateCurveFor('Coco')).toEqual({ curve: 'soilless', assumed: false });
    expect(substrateCurveFor('Rockwool')).toEqual({ curve: 'soilless', assumed: false });
  });

  it('puts potting soil on the soilless curve, where METER puts it', () => {
    // Contains both keywords; soilless must win.
    expect(substrateCurveFor('Potting soil')).toEqual({ curve: 'soilless', assumed: false });
  });

  it('recognises mineral media', () => {
    expect(substrateCurveFor('Loam')).toEqual({ curve: 'mineral', assumed: false });
    expect(substrateCurveFor('Living soil')).toEqual({ curve: 'mineral', assumed: false });
  });

  it('falls back to soilless but flags that it assumed', () => {
    expect(substrateCurveFor(null)).toEqual({ curve: 'soilless', assumed: true });
    expect(substrateCurveFor('  ')).toEqual({ curve: 'soilless', assumed: true });
    expect(substrateCurveFor('something new')).toEqual({ curve: 'soilless', assumed: true });
  });
});

describe('deriveReadings', () => {
  it('leaves everything derived null when the probe reported nothing', () => {
    const r = deriveReadings({ counts: null, temperatureC: null, bulkEc: null }, { curve: 'soilless', assumed: true });
    expect(r.vwc).toBeNull();
    expect(r.poreEc).toBeNull();
    expect(r.permittivity).toBeNull();
  });

  /** A TEROS 11 omits bulk EC entirely; water content must still read. */
  it('still derives VWC when the probe reports no bulk EC', () => {
    const r = deriveReadings({ ...LIVE, bulkEc: null }, { curve: 'soilless', assumed: false });
    expect(r.vwc).toBeCloseTo(0.473, 2);
    expect(r.poreEc).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Probe resolution from a snapshot
// ---------------------------------------------------------------------------

function makeEntity(nodeId: string, objectId: string, overrides: Partial<EntityConfig> = {}): EntityConfig {
  return {
    id: `${nodeId}_${objectId}`,
    component: 'sensor',
    name: objectId,
    uniqueId: `${nodeId}_${objectId}`,
    objectId,
    nodeId,
    device: { identifiers: [nodeId], name: nodeId, manufacturer: 'METER Group', model: 'TEROS 12' },
    payloadAvailable: 'online',
    payloadNotAvailable: 'offline',
    dangerous: false,
    writable: false,
    raw: {},
    ...overrides
  };
}

function probeEntities(nodeId: string): EntityConfig[] {
  return [
    makeEntity(nodeId, 'substrate_raw_counts'),
    makeEntity(nodeId, 'substrate_temperature', { unit: '°C' }),
    makeEntity(nodeId, 'substrate_bulk_ec', { unit: 'mS/cm' }),
    makeEntity(nodeId, 'substrate_serial', { entityCategory: 'diagnostic' })
  ];
}

function makeSnapshot(
  entities: EntityConfig[],
  states: Record<string, string>,
  availability: Record<string, 'online' | 'offline'> = {}
): Snapshot {
  const nodes = [...new Set(entities.map((e) => e.nodeId ?? ''))];
  const devices: DeviceSnapshot[] = nodes.map((nodeId) => ({
    id: nodeId,
    nodeId,
    name: nodeId,
    availability: availability[nodeId] ?? 'online',
    entityIds: entities.filter((e) => e.nodeId === nodeId).map((e) => e.id)
  }));
  return {
    site: 'daniel-home',
    timezone: 'UTC',
    topicPrefix: 'grow/daniel-home',
    discoveryPrefix: 'grow/daniel-home/_discovery',
    generatedAt: new Date().toISOString(),
    broker: { connected: true, connecting: false, error: null, lastConnectedAt: null, lastMessageAt: null },
    devices,
    entities,
    states: Object.fromEntries(Object.entries(states).map(([k, v]) => [k, { value: v, updatedAt: null }])),
    uiConfigs: {},
    lights: [],
    firmware: { devices: {}, channels: {} }
  };
}

const liveStates = {
  'substrate-a_substrate_raw_counts': String(LIVE.counts),
  'substrate-a_substrate_temperature': String(LIVE.temperatureC),
  'substrate-a_substrate_bulk_ec': String(LIVE.bulkEc),
  'substrate-a_substrate_serial': 'T12-00065327'
};

describe('resolveSubstrateProbes', () => {
  it('reads an unbound probe on the default curve', () => {
    const probes = resolveSubstrateProbes(makeSnapshot(probeEntities('substrate-a'), liveStates));
    expect(probes).toHaveLength(1);
    expect(probes[0].nodeId).toBe('substrate-a');
    expect(probes[0].serial).toBe('T12-00065327');
    expect(probes[0].readings.vwc).toBeCloseTo(0.473, 2);
    expect(probes[0].readings.curveAssumed).toBe(true);
    expect(probes[0].zoneName).toBeNull();
  });

  it('takes its curve and its label from the zone that claims it', () => {
    const probes = resolveSubstrateProbes(makeSnapshot(probeEntities('substrate-a'), liveStates), [
      { name: 'Tent 1 — Gelato', substrateType: 'Coco', substrateNodeId: 'substrate-a' }
    ]);
    expect(probes[0].label).toBe('Tent 1 — Gelato');
    expect(probes[0].zoneName).toBe('Tent 1 — Gelato');
    expect(probes[0].readings.curve).toBe('soilless');
    expect(probes[0].readings.curveAssumed).toBe(false);
  });

  it('switches curve when the zone is a mineral medium', () => {
    const probes = resolveSubstrateProbes(makeSnapshot(probeEntities('substrate-a'), liveStates), [
      { name: 'Outdoor bed', substrateType: 'Loam', substrateNodeId: 'substrate-a' }
    ]);
    expect(probes[0].readings.curve).toBe('mineral');
    expect(probes[0].readings.vwc).toBeCloseTo(manualMineral(LIVE.counts), 6);
  });

  /**
   * A probe's last reading stays retained on the broker forever. A pot that read 47 %
   * when the publisher died is not 47 % now, so an offline device must read nothing
   * rather than something stale.
   */
  it('reports nothing for an offline probe', () => {
    const probes = resolveSubstrateProbes(
      makeSnapshot(probeEntities('substrate-a'), liveStates, { 'substrate-a': 'offline' })
    );
    expect(probes[0].available).toBe(false);
    expect(probes[0].readings.counts).toBeNull();
    expect(probes[0].readings.vwc).toBeNull();
    expect(probes[0].readings.poreEc).toBeNull();
  });

  it('drops an unplugged probe’s nan rather than parsing it', () => {
    const probes = resolveSubstrateProbes(
      makeSnapshot(probeEntities('substrate-a'), { ...liveStates, 'substrate-a_substrate_raw_counts': 'nan' })
    );
    expect(probes[0].readings.counts).toBeNull();
    expect(probes[0].readings.vwc).toBeNull();
  });

  it('orders probes by node id so the tabs hold their position', () => {
    const entities = [...probeEntities('substrate-c'), ...probeEntities('substrate-a'), ...probeEntities('substrate-b')];
    const probes = resolveSubstrateProbes(makeSnapshot(entities, {}));
    expect(probes.map((p) => p.nodeId)).toEqual(['substrate-a', 'substrate-b', 'substrate-c']);
  });

  it('ignores a node that publishes no counts entity', () => {
    const entities = [makeEntity('half-probe', 'substrate_temperature', { unit: '°C' })];
    expect(resolveSubstrateProbes(makeSnapshot(entities, {}))).toHaveLength(0);
    expect(hasSubstrateProbe(makeSnapshot(entities, {}))).toBe(false);
  });

  it('binds each probe to its own zone when several are deployed', () => {
    const entities = [...probeEntities('substrate-a'), ...probeEntities('substrate-b')];
    const probes = resolveSubstrateProbes(makeSnapshot(entities, {}), [
      { name: 'Tent 1', substrateType: 'Coco', substrateNodeId: 'substrate-a' },
      { name: 'Bed 2', substrateType: 'Loam', substrateNodeId: 'substrate-b' }
    ]);
    expect(probes.map((p) => p.label)).toEqual(['Tent 1', 'Bed 2']);
    expect(probes.map((p) => p.readings.curve)).toEqual(['soilless', 'mineral']);
  });
});
