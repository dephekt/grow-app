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
   * The three inputs are NOT recorded at the same cadence. The publisher skips a state
   * write when the payload has not changed, so on the real bus a substrate temperature
   * holding at 26.6 °C recorded 4 points in three hours while counts recorded 336.
   * Joining on equal timestamps intersects those to nearly nothing — pore EC has to
   * read each series as the step function it is.
   */
  it('carries a sparse temperature forward across dense counts', () => {
    const snapshot = substrateSnapshot(['substrate-a']);
    const specs = resolveDomainSeries(snapshot, 'substrate');
    const ticks = Array.from({ length: 20 }, (_, i) => new Date(Date.parse(T0) + i * 30_000).toISOString());
    const points = new Map<string, TrendPoint[]>([
      ['substrate-a:substrate_raw_counts', ticks.map((t) => ({ t, v: 2861.35 }))],
      // One temperature point, at the fifth tick — as if it changed once and held.
      ['substrate-a:substrate_temperature', [{ t: ticks[5], v: 26.6 }]],
      ['substrate-a:substrate_bulk_ec', [{ t: ticks[0], v: 0.025 }]]
    ]);
    const series = assembleDomainSeries(snapshot, 'substrate', specs, points);
    expect(series.find((s) => s.key === 'substrate-a:vwc')?.points).toHaveLength(20);
    // Every tick derives: the ones after the temperature point carry it forward, the
    // ones before it read it backwards rather than being dropped.
    expect(series.find((s) => s.key === 'substrate-a:pwec')?.points).toHaveLength(20);
  });

  it('steps pore EC when bulk EC changes, rather than interpolating', () => {
    const snapshot = substrateSnapshot(['substrate-a']);
    const specs = resolveDomainSeries(snapshot, 'substrate');
    const ticks = Array.from({ length: 4 }, (_, i) => new Date(Date.parse(T0) + i * 30_000).toISOString());
    const points = new Map<string, TrendPoint[]>([
      ['substrate-a:substrate_raw_counts', ticks.map((t) => ({ t, v: 2861.35 }))],
      ['substrate-a:substrate_temperature', [{ t: ticks[0], v: 26.6 }]],
      [
        'substrate-a:substrate_bulk_ec',
        [
          { t: ticks[0], v: 0.5 },
          { t: ticks[2], v: 1.0 }
        ]
      ]
    ]);
    const pwec = assembleDomainSeries(snapshot, 'substrate', specs, points).find(
      (s) => s.key === 'substrate-a:pwec'
    )!;
    // Held at 0.5 for the first two ticks, then doubles — pore EC is linear in bulk EC.
    expect(pwec.points[0].v).toBeCloseTo(pwec.points[1].v, 10);
    expect(pwec.points[2].v).toBeCloseTo(pwec.points[0].v * 2, 6);
    expect(pwec.points[3].v).toBeCloseTo(pwec.points[2].v, 10);
  });

  it('charts no pore EC when a series was never recorded at all', () => {
    const snapshot = substrateSnapshot(['substrate-a']);
    const specs = resolveDomainSeries(snapshot, 'substrate');
    const points = new Map<string, TrendPoint[]>([
      ['substrate-a:substrate_raw_counts', [{ t: T0, v: 2861.35 }]],
      ['substrate-a:substrate_temperature', [{ t: T0, v: 26.6 }]]
      // No bulk EC — a TEROS 11, or an electrode that never reported.
    ]);
    const series = assembleDomainSeries(snapshot, 'substrate', specs, points);
    expect(series.find((s) => s.key === 'substrate-a:vwc')?.points).toHaveLength(1);
    expect(series.find((s) => s.key === 'substrate-a:pwec')).toBeUndefined();
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

  /**
   * Counts outside the sensor's range — a stale retained payload from an older build —
   * derive to nothing. Emitting the series anyway would put a legend entry on the chart
   * with no line behind it, which the pore-EC path already avoids.
   */
  it('omits a VWC series whose every count was rejected', () => {
    const snapshot = substrateSnapshot(['substrate-a']);
    const specs = resolveDomainSeries(snapshot, 'substrate');
    const points = new Map<string, TrendPoint[]>([
      ['substrate-a:substrate_raw_counts', [{ t: T0, v: 99999 }, { t: T1, v: -5 }]]
    ]);
    expect(assembleDomainSeries(snapshot, 'substrate', specs, points)).toEqual([]);
  });

  it('charts nothing for a probe with no recorded counts', () => {
    const snapshot = substrateSnapshot(['substrate-a']);
    const specs = resolveDomainSeries(snapshot, 'substrate');
    expect(assembleDomainSeries(snapshot, 'substrate', specs, new Map())).toEqual([]);
  });
});
