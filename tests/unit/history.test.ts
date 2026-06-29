import { describe, expect, it } from 'vitest';
import { liveSnapshot } from '../../e2e/fixtures/live-snapshot';
import { isHistoryRange } from '../../src/lib/server/influx/query';
import { isTrendDomain, resolveDomainSeries } from '../../src/lib/server/influx/trend-domains';

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
    for (const d of ['water', 'climate', 'thermal', 'substrate']) expect(isTrendDomain(d)).toBe(true);
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

  it('substrate is empty (no probe deployed yet)', () => {
    expect(resolveDomainSeries(liveSnapshot, 'substrate')).toEqual([]);
  });
});
