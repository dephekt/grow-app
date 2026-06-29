import { describe, expect, it } from 'vitest';
import { dashboardSnapshot } from '../../e2e/fixtures/dashboard-snapshot';
import { isHistoryRange } from '../../src/lib/server/influx/query';
import { resolveTrendSeries } from '../../src/lib/server/influx/trend-series';

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

describe('resolveTrendSeries', () => {
  const resolved = resolveTrendSeries(dashboardSnapshot);

  it('resolves pH from the Atlas water_ph sensor', () => {
    const ph = resolved.find((s) => s.key === 'ph');
    expect(ph).toMatchObject({ node: 'atlas-hydro-monitor', entity: 'water_ph' });
  });

  it('resolves air temperature from the AtomS3U sensor, not the water probe', () => {
    const air = resolved.find((s) => s.key === 'air_temp');
    expect(air).toMatchObject({ node: 'atoms3u-sensor-rig', entity: 'temperature' });
  });

  it('omits CO2 when the site has no CO2 sensor discovered', () => {
    expect(resolved.find((s) => s.key === 'co2')).toBeUndefined();
  });
});
