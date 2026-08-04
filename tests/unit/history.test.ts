// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { describe, expect, it } from 'vitest';
import { liveSnapshot } from '../../e2e/fixtures/live-snapshot';
import { isHistoryRange } from '../../src/lib/server/influx/query';
import { assembleDomainSeries, isTrendDomain, resolveDomainSeries } from '../../src/lib/server/influx/trend-domains';
import type { DeviceSnapshot, EntityConfig, Snapshot } from '../../src/lib/server/mqtt/types';
import type { TrendPoint } from '../../src/lib/trends';

describe('isHistoryRange', () => {
  it('accepts the known ranges', () => {
    for (const range of ['1h', '3h', '6h', '12h', '24h']) {
      expect(isHistoryRange(range)).toBe(true);
    }
  });

  it('rejects anything else', () => {
    expect(isHistoryRange('2h')).toBe(false);
    expect(isHistoryRange(null)).toBe(false);
    expect(isHistoryRange('')).toBe(false);
  });
});

describe('isTrendDomain', () => {
  it('accepts the domains', () => {
    for (const d of ['water', 'climate', 'thermal', 'air-quality', 'substrate']) expect(isTrendDomain(d)).toBe(true);
  });
  it('rejects anything else', () => {
    expect(isTrendDomain('air')).toBe(false);
    expect(isTrendDomain(null)).toBe(false);
  });
});

describe('resolveDomainSeries (live snapshot)', () => {
  const water = resolveDomainSeries(liveSnapshot, 'water');
  const climate = resolveDomainSeries(liveSnapshot, 'climate');
  const thermal = resolveDomainSeries(liveSnapshot, 'thermal');

  it('water = the five Atlas readings, all on the hydro device', () => {
    expect(water.map((s) => s.entity).sort()).toEqual([
      'water_ec',
      'water_orp',
      'water_ph',
      'water_tds',
      'water_temperature'
    ]);
    expect(water.every((s) => s.node === 'atlas-hydro-monitor')).toBe(true);
  });

  it('climate includes co2 / temperature / humidity from the AtomS3U rig', () => {
    const entities = climate.map((s) => s.entity);
    expect(entities).toContain('co2');
    expect(entities).toContain('temperature');
    expect(entities).toContain('humidity');
    expect(climate.every((s) => s.node === 'atoms3u-sensor-rig')).toBe(true);
  });

  it('thermal = the MLX90640 min/mean/max array temps', () => {
    expect(thermal.map((s) => s.entity).sort()).toEqual([
      'mlx90640_max_temp',
      'mlx90640_mean_temp',
      'mlx90640_min_temp'
    ]);
  });

  it('substrate is empty when no probe is on the bus', () => {
    expect(resolveDomainSeries(liveSnapshot, 'substrate')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Substrate: the one domain that charts DERIVED values, so it resolves raw specs
// and converts them after the query.
// ---------------------------------------------------------------------------

function substrateEntity(nodeId: string, objectId: string): EntityConfig {
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
    raw: {}
  };
}

function substrateSnapshot(nodeIds: string[]): Snapshot {
  const entities = nodeIds.flatMap((n) =>
    ['substrate_raw_counts', 'substrate_temperature', 'substrate_bulk_ec'].map((o) => substrateEntity(n, o))
  );
  const devices: DeviceSnapshot[] = nodeIds.map((nodeId) => ({
    id: nodeId,
    nodeId,
    name: nodeId,
    availability: 'online',
    entityIds: entities.filter((e) => e.nodeId === nodeId).map((e) => e.id)
  }));
  return { ...liveSnapshot, devices, entities, states: {} };
}

const T0 = '2026-08-04T00:00:00Z';
const T1 = '2026-08-04T00:05:00Z';

describe('substrate trend domain', () => {
  /**
   * Every probe on the bus publishes the SAME object ids. Keying a series on objectId
   * alone would collapse four pots into one and chart whichever answered last.
   */
  it('keys each probe’s series on node id so probes cannot collide', () => {
    const specs = resolveDomainSeries(substrateSnapshot(['substrate-a', 'substrate-b']), 'substrate');
    expect(specs).toHaveLength(6);
    expect(new Set(specs.map((s) => s.key)).size).toBe(6);
    expect(specs.map((s) => s.key)).toContain('substrate-a:substrate_raw_counts');
    expect(specs.map((s) => s.key)).toContain('substrate-b:substrate_raw_counts');
  });

  it('queries raw counts/temp/EC — the values actually recorded', () => {
    const specs = resolveDomainSeries(substrateSnapshot(['substrate-a']), 'substrate');
    expect(specs.map((s) => s.entity).sort()).toEqual([
      'substrate_bulk_ec',
      'substrate_raw_counts',
      'substrate_temperature'
    ]);
  });

  it('derives VWC as a percentage and pore EC in mS/cm', () => {
    const snapshot = substrateSnapshot(['substrate-a']);
    const specs = resolveDomainSeries(snapshot, 'substrate');
    const points = new Map<string, TrendPoint[]>([
      ['substrate-a:substrate_raw_counts', [{ t: T0, v: 2861.35 }]],
      ['substrate-a:substrate_temperature', [{ t: T0, v: 26.6 }]],
      ['substrate-a:substrate_bulk_ec', [{ t: T0, v: 0.025 }]]
    ]);
    const series = assembleDomainSeries(snapshot, 'substrate', specs, points);

    const vwc = series.find((s) => s.key === 'substrate-a:vwc');
    expect(vwc?.unit).toBe('%');
    expect(vwc?.label).toBe('VWC');
    expect(vwc?.points[0].v).toBeCloseTo(47.3, 1);

    const pwec = series.find((s) => s.key === 'substrate-a:pwec');
    expect(pwec?.unit).toBe('mS/cm');
    expect(pwec?.points[0].v).toBeCloseTo(0.097, 3);
  });

  /**
   * Influx aggregates with createEmpty:false, so any of the three can miss a bucket.
   * Pore EC needs all three at the same instant — a half-filled bucket must be dropped,
   * not carried over from a neighbour.
   */
  it('drops a pore-EC bucket that is missing one of its three inputs', () => {
    const snapshot = substrateSnapshot(['substrate-a']);
    const specs = resolveDomainSeries(snapshot, 'substrate');
    const points = new Map<string, TrendPoint[]>([
      [
        'substrate-a:substrate_raw_counts',
        [
          { t: T0, v: 2861.35 },
          { t: T1, v: 2870 }
        ]
      ],
      ['substrate-a:substrate_temperature', [{ t: T0, v: 26.6 }]],
      [
        'substrate-a:substrate_bulk_ec',
        [
          { t: T0, v: 0.025 },
          { t: T1, v: 0.026 }
        ]
      ]
    ]);
    const series = assembleDomainSeries(snapshot, 'substrate', specs, points);
    // VWC needs only counts, so both buckets chart.
    expect(series.find((s) => s.key === 'substrate-a:vwc')?.points).toHaveLength(2);
    // Pore EC has no temperature at T1.
    expect(series.find((s) => s.key === 'substrate-a:pwec')?.points).toHaveLength(1);
  });

  it('names each series after its probe once there is more than one', () => {
    const snapshot = substrateSnapshot(['substrate-a', 'substrate-b']);
    const specs = resolveDomainSeries(snapshot, 'substrate');
    const points = new Map<string, TrendPoint[]>([
      ['substrate-a:substrate_raw_counts', [{ t: T0, v: 2861.35 }]],
      ['substrate-b:substrate_raw_counts', [{ t: T0, v: 2700 }]]
    ]);
    const zones = [{ name: 'Tent 1', substrateType: 'Coco', substrateNodeId: 'substrate-a' }];
    const series = assembleDomainSeries(snapshot, 'substrate', specs, points, zones);
    expect(series.map((s) => s.label)).toEqual(['Tent 1 VWC', 'B VWC']);
  });

  it('applies the bound zone’s curve to the history it derives', () => {
    const snapshot = substrateSnapshot(['substrate-a']);
    const specs = resolveDomainSeries(snapshot, 'substrate');
    const points = new Map<string, TrendPoint[]>([['substrate-a:substrate_raw_counts', [{ t: T0, v: 2861.35 }]]]);

    const soilless = assembleDomainSeries(snapshot, 'substrate', specs, points, [
      { name: 'Tent 1', substrateType: 'Coco', substrateNodeId: 'substrate-a' }
    ]);
    const mineral = assembleDomainSeries(snapshot, 'substrate', specs, points, [
      { name: 'Bed', substrateType: 'Loam', substrateNodeId: 'substrate-a' }
    ]);
    expect(soilless[0].points[0].v).toBeCloseTo(47.3, 1);
    expect(mineral[0].points[0].v).toBeCloseTo(41.4, 1);
  });

  it('charts nothing for a probe with no recorded counts', () => {
    const snapshot = substrateSnapshot(['substrate-a']);
    const specs = resolveDomainSeries(snapshot, 'substrate');
    expect(assembleDomainSeries(snapshot, 'substrate', specs, new Map())).toEqual([]);
  });
});
