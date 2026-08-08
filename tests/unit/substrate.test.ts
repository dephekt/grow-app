// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { describe, expect, it } from 'vitest';
import {
  DISPLAY_DIGITS,
  PORE_EC_OFFSETS,
  atDisplayPrecision,
  bandStatus,
  deriveReadings,
  poreEcCompareDeltaPct,
  vwcPercent,
  poreEcGap,
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

const OPEN = { min: null, max: null };

describe('bandStatus', () => {
  it('places a reading inside, above and below its band', () => {
    const band = { min: 30, max: 60 };
    expect(bandStatus(45, band)).toBe('ok');
    expect(bandStatus(61, band)).toBe('high');
    expect(bandStatus(29, band)).toBe('low');
  });

  /** Inclusive, matching statusFromLive — the two panels must not disagree on a
   *  reading that sits exactly on its bound. */
  it('treats the bounds themselves as breached', () => {
    const band = { min: 30, max: 60 };
    expect(bandStatus(30, band)).toBe('low');
    expect(bandStatus(60, band)).toBe('high');
    expect(bandStatus(30.1, band)).toBe('ok');
    expect(bandStatus(59.9, band)).toBe('ok');
  });

  it('honours an open side', () => {
    expect(bandStatus(5, { min: 30, max: null })).toBe('low');
    expect(bandStatus(500, { min: 30, max: null })).toBe('ok');
    expect(bandStatus(500, { min: null, max: 60 })).toBe('high');
    expect(bandStatus(5, { min: null, max: 60 })).toBe('ok');
  });

  /**
   * The same rule statusFromLive applies to MQTT-published thresholds: a reading with
   * nothing to compare against is not evidence that anything is fine. The two must not
   * disagree about what OK means.
   */
  it('is unknown without a reading or without a band', () => {
    expect(bandStatus(null, { min: 30, max: 60 })).toBe('unknown');
    expect(bandStatus(45, OPEN)).toBe('unknown');
    expect(bandStatus(45, undefined)).toBe('unknown');
    expect(bandStatus(Number.NaN, { min: 30, max: 60 })).toBe('unknown');
  });

  it('resolves a degenerate min == max band deterministically', () => {
    const band = { min: 40, max: 40 };
    expect(bandStatus(40, band)).toBe('high');
    expect(bandStatus(41, band)).toBe('high');
    expect(bandStatus(39, band)).toBe('low');
  });

  /** Every row is judged at the precision it prints, so a dot cannot contradict the
   *  number beside it — pwEC 1.999 renders "2.00" and must not read low against a 2.0 floor. */
  it('compares every row at the precision the card prints', () => {
    const probes = resolveSubstrateProbes(
      makeSnapshot(probeEntities('substrate-a'), {
        ...liveStates,
        'substrate-a_substrate_temperature': '23.999'
      }),
      [{ id: 'z1', name: '4x4', substrateType: 'Coco', substrateTempMaxC: 24 }],
      [{ nodeId: 'substrate-a', zoneId: 'z1' }]
    );
    // 23.999 prints as "24.0 °C"; judged raw it would read ok, judged as printed it is high.
    expect(probes[0].status.temperatureC).toBe('high');
  });

  it('compares VWC at the precision the card prints', () => {
    expect(vwcPercent(0.29999999999)).toBe(30);
    expect(vwcPercent(0.47)).toBe(47);
    expect(bandStatus(vwcPercent(0.30000000000000004), { min: 30, max: 60 })).toBe('low');
    expect(bandStatus(vwcPercent(0.3049), { min: 30, max: 60 })).toBe('ok');
    // pwEC prints at 2 decimals, temperature at 1.
    expect(atDisplayPrecision(1.999, DISPLAY_DIGITS.poreEc)).toBe(2);
    expect(atDisplayPrecision(23.999, DISPLAY_DIGITS.temperatureC)).toBe(24);
    expect(bandStatus(atDisplayPrecision(1.999, DISPLAY_DIGITS.poreEc), { min: 2, max: 6 })).toBe('low');
  });
});


describe('poreEcGap', () => {
  const probe = (readings: Partial<import('../../src/lib/substrate').SubstrateReadings>, available = true) => ({
    nodeId: 'substrate-a',
    label: 'A',
    deviceName: 'substrate-a',
    zoneName: null,
    name: null,
    available,
    serial: null,
    substrateType: null,
    readings: {
      counts: 2861.35,
      temperatureC: 26.6,
      bulkEc: 0.025,
      vwc: 0.47,
      poreEc: null,
      poreEcCoir: null,
      permittivity: 24.1,
      curve: 'soilless' as const,
      curveAssumed: true,
      ...readings
    },
    thresholds: { vwcPct: OPEN, temperatureC: OPEN, poreEc: OPEN },
    status: { vwc: 'unknown' as const, temperatureC: 'unknown' as const, poreEc: 'unknown' as const }
  });

  it('says nothing when pore EC derived fine', () => {
    expect(poreEcGap(probe({ poreEc: 0.097 }))).toBeNull();
  });

  it('distinguishes offline from a missing reading', () => {
    expect(poreEcGap(probe({}, false))).toBe('offline');
    expect(poreEcGap(probe({ counts: null }))).toBe('no-reading');
    expect(poreEcGap(probe({ temperatureC: null }))).toBe('no-reading');
  });

  it('distinguishes a probe with no EC electrode from a dry one', () => {
    expect(poreEcGap(probe({ bulkEc: null }))).toBe('no-bulk-ec');
    expect(poreEcGap(probe({ vwc: 0.05 }))).toBe('too-dry');
  });

  /**
   * A conductivity below zero is a broken electrode, not a dry pot. Reporting it as
   * "too dry" would send someone to irrigate a probe that needs replacing.
   */
  it('calls a negative bulk EC a bad reading rather than a dry pot', () => {
    expect(poreEcGap(probe({ bulkEc: -0.1 }))).toBe('bad-bulk-ec');
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
// The coir εσb=0 carried alongside the committed one
// ---------------------------------------------------------------------------

describe('pore EC offset comparison', () => {
  const soilless = { curve: 'soilless' as const, assumed: false };

  it('commits to the generic offset and carries the coir one beside it', () => {
    expect(PORE_EC_OFFSETS.committed.value).toBe(4.1);
    expect(PORE_EC_OFFSETS.coir.value).toBe(1.64);
  });

  /** Hilhorst by hand at the live sample, so a swapped offset shows up as a mismatch. */
  it('divides by (εb − offset) for whichever offset it is given', () => {
    const permittivity = permittivityFromCounts(LIVE.counts)!;
    const water = 80.3 - 0.37 * (LIVE.temperatureC - 20);
    const args = { bulkEc: LIVE.bulkEc, permittivity, temperatureC: LIVE.temperatureC, vwc: 0.47 };

    expect(poreWaterEc({ ...args, offset: 4.1 })).toBeCloseTo((water * LIVE.bulkEc) / (permittivity - 4.1), 10);
    expect(poreWaterEc({ ...args, offset: 1.64 })).toBeCloseTo((water * LIVE.bulkEc) / (permittivity - 1.64), 10);
  });

  it('defaults to the committed offset when none is named', () => {
    const permittivity = permittivityFromCounts(LIVE.counts)!;
    const args = { bulkEc: LIVE.bulkEc, permittivity, temperatureC: LIVE.temperatureC, vwc: 0.47 };
    expect(poreWaterEc(args)).toBe(poreWaterEc({ ...args, offset: PORE_EC_OFFSETS.committed.value }));
  });

  /** A smaller offset leaves a bigger denominator, so the coir reading always sits lower. */
  it('reads lower than the committed value at the live sample', () => {
    const r = deriveReadings(LIVE, soilless);
    expect(r.poreEc).toBeCloseTo(0.097, 3);
    expect(r.poreEcCoir).toBeLessThan(r.poreEc!);
    expect(poreEcCompareDeltaPct(r)).toBeCloseTo(-11, 0);
  });

  /** The offset is the pole the model divides by, so the headroom gate moves with it. */
  it('gates each offset against its own pole', () => {
    const permittivity = 4.6;
    const args = { bulkEc: 0.5, permittivity, temperatureC: 20, vwc: 0.2 };
    expect(poreWaterEc({ ...args, offset: 4.1 })).toBeNull();
    expect(poreWaterEc({ ...args, offset: 1.64 })).not.toBeNull();
  });

  /**
   * Between roughly 12 % and 23 % VWC the committed offset is already past its pole while
   * the coir one is not, and Hilhorst there returns tens of mS/cm the model cannot support.
   * Deriving it anyway would put nonsense on the card during exactly the dryback someone
   * turned the comparison on to watch.
   */
  it('withholds the comparison wherever the committed reading does not derive', () => {
    for (let counts = 1900; counts <= 2055; counts += 5) {
      const r = deriveReadings({ counts, temperatureC: 22, bulkEc: 1.2 }, soilless);
      expect(r.poreEc).toBeNull();
      expect(r.poreEcCoir).toBeNull();
    }
    // Just the other side of it both derive again, and the comparison reads lower as always.
    const wet = deriveReadings({ counts: 2100, temperatureC: 22, bulkEc: 1.2 }, soilless);
    expect(wet.poreEc).not.toBeNull();
    expect(wet.poreEcCoir).toBeLessThan(wet.poreEc!);
  });

  it('reports no delta when the committed reading is missing', () => {
    expect(poreEcCompareDeltaPct(deriveReadings({ ...LIVE, bulkEc: null }, soilless))).toBeNull();
  });

  /** Zero bulk EC drives both readings to zero, and a percentage off zero is meaningless. */
  it('reports no delta when the committed reading is zero', () => {
    const r = deriveReadings({ ...LIVE, bulkEc: 0 }, soilless);
    expect(r.poreEc).toBe(0);
    expect(poreEcCompareDeltaPct(r)).toBeNull();
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
    const probes = resolveSubstrateProbes(
      makeSnapshot(probeEntities('substrate-a'), liveStates),
      [{ id: 'z1', name: 'Tent 1 — Gelato', substrateType: 'Coco' }],
      [{ nodeId: 'substrate-a', zoneId: 'z1' }]
    );
    // The zone supplies the curve and the bands; the label comes from the plant, so an
    // unnamed probe falls back to its bus letter rather than borrowing the zone's name.
    expect(probes[0].label).toBe('A');
    expect(probes[0].zoneName).toBe('Tent 1 — Gelato');
    expect(probes[0].readings.curve).toBe('soilless');
    expect(probes[0].readings.curveAssumed).toBe(false);
  });

  it('switches curve when the zone is a mineral medium', () => {
    const probes = resolveSubstrateProbes(
      makeSnapshot(probeEntities('substrate-a'), liveStates),
      [{ id: 'z1', name: 'Outdoor bed', substrateType: 'Loam' }],
      [{ nodeId: 'substrate-a', zoneId: 'z1' }]
    );
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

  /** VWC is stored as a percent and read as m3/m3 — the 100x that would silently pass
   *  every type check. */
  it('compares VWC against the band in percent, not m3/m3', () => {
    const zone = {
      id: 'z1',
      name: '4x4',
      substrateType: 'Coco',
      vwcMinPct: 30,
      vwcMaxPct: 60
    };
    const bound = [{ nodeId: 'substrate-a', zoneId: 'z1' }];
    // The live sample derives to 0.47 m3/m3 = 47 %, inside 30-60.
    const inside = resolveSubstrateProbes(makeSnapshot(probeEntities('substrate-a'), liveStates), [zone], bound);
    expect(inside[0].readings.vwc).toBeCloseTo(0.47, 1);
    expect(inside[0].status.vwc).toBe('ok');

    // Had the raw fraction been compared, 0.47 would read as below a min of 30.
    const tight = resolveSubstrateProbes(
      makeSnapshot(probeEntities('substrate-a'), liveStates),
      [{ ...zone, vwcMinPct: 50, vwcMaxPct: 60 }],
      bound
    );
    expect(tight[0].status.vwc).toBe('low');
  });

  it('flags substrate temperature and pore EC against their own bands', () => {
    const probes = resolveSubstrateProbes(
      makeSnapshot(probeEntities('substrate-a'), liveStates),
      [
      {
        id: 'z1',
        name: '4x4',
        substrateType: 'Coco',
        substrateTempMinC: 18,
        substrateTempMaxC: 24,
        pwecMin: 2,
        pwecMax: 6
      }
      ],
      [{ nodeId: 'substrate-a', zoneId: 'z1' }]
    );
    // 26.6 C is above the 24 ceiling; pore EC derives to ~0.09, below the floor of 2.
    expect(probes[0].status.temperatureC).toBe('high');
    expect(probes[0].status.poreEc).toBe('low');
  });

  it('leaves every status unknown for an unbound probe', () => {
    const probes = resolveSubstrateProbes(makeSnapshot(probeEntities('substrate-a'), liveStates));
    expect(probes[0].status).toEqual({ vwc: 'unknown', temperatureC: 'unknown', poreEc: 'unknown' });
    expect(probes[0].thresholds.vwcPct).toEqual(OPEN);
  });

  /** An offline probe reports nothing, so it cannot be in or out of band either. */
  it('does not judge an offline probe against its bands', () => {
    const probes = resolveSubstrateProbes(
      makeSnapshot(probeEntities('substrate-a'), liveStates, { 'substrate-a': 'offline' }),
      [{ id: 'z1', name: '4x4', substrateType: 'Coco', vwcMinPct: 30, vwcMaxPct: 60 }],
      [{ nodeId: 'substrate-a', zoneId: 'z1' }]
    );
    expect(probes[0].status.vwc).toBe('unknown');
  });

  it('binds each probe to its own zone when several are deployed', () => {
    const entities = [...probeEntities('substrate-a'), ...probeEntities('substrate-b')];
    const probes = resolveSubstrateProbes(
      makeSnapshot(entities, {}),
      [
        { id: 'z1', name: 'Tent 1', substrateType: 'Coco' },
        { id: 'z2', name: 'Bed 2', substrateType: 'Loam' }
      ],
      [
        { nodeId: 'substrate-a', zoneId: 'z1', name: 'Gelato A' },
        { nodeId: 'substrate-b', zoneId: 'z2', name: 'Mule A' }
      ]
    );
    expect(probes.map((p) => p.label)).toEqual(['Gelato A', 'Mule A']);
    expect(probes.map((p) => p.readings.curve)).toEqual(['soilless', 'mineral']);
  });
});
