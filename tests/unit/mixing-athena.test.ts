import { describe, it, expect } from 'vitest';
import {
  perTenLitres,
  mix,
  volumeForMode,
  DOSE_TABLE,
  FEED_SCHEDULE,
  TANK
} from '$lib/mixing/athena';

describe('perTenLitres', () => {
  it('returns the printed chart values at the table EC points', () => {
    expect(perTenLitres(1.0)).toMatchObject({ growBloom: 27, core: 16, extrapolated: false });
    expect(perTenLitres(3.0)).toMatchObject({ growBloom: 90, core: 54, extrapolated: false });
    expect(perTenLitres(4.0)).toMatchObject({ growBloom: 124, core: 75, extrapolated: false });
  });

  it('interpolates on the chart curve between points', () => {
    // Midway 1.0↔1.5: grow (27+42)/2 = 34.5, core (16+25)/2 = 20.5
    const p = perTenLitres(1.25);
    expect(p.growBloom).toBeCloseTo(34.5, 5);
    expect(p.core).toBeCloseTo(20.5, 5);
    expect(p.extrapolated).toBe(false);
  });

  it('extrapolates below the chart and clamps at zero, flagged', () => {
    const low = perTenLitres(0.8); // below the 1.0 floor
    expect(low.extrapolated).toBe(true);
    expect(low.growBloom).toBeGreaterThan(0);
    expect(low.growBloom).toBeLessThan(27);
    // Far below zero-crossing never goes negative.
    expect(perTenLitres(0.05).growBloom).toBe(0);
    expect(perTenLitres(0.05).core).toBe(0);
  });

  it('extrapolates above the chart, flagged', () => {
    const high = perTenLitres(4.5);
    expect(high.extrapolated).toBe(true);
    expect(high.growBloom).toBeGreaterThan(124);
  });
});

describe('mix — known reservoir presets @ EC 3.0', () => {
  it('initial full tank (47.5 L) → Grow/Bloom 427.5 mL, Core 256.5 mL', () => {
    const m = mix(3.0, TANK.full);
    expect(m.growBloom).toBeCloseTo(427.5, 5);
    expect(m.core).toBeCloseTo(256.5, 5);
    expect(m.perTenL).toEqual({ growBloom: 90, core: 54 });
  });

  it('normal refill (38 L) → Grow/Bloom 342 mL, Core 205.2 mL', () => {
    const m = mix(3.0, TANK.refill);
    expect(m.growBloom).toBeCloseTo(342, 5);
    expect(m.core).toBeCloseTo(205.2, 5);
  });

  it('scales down to a 1 L pitcher', () => {
    const m = mix(1.0, 1);
    expect(m.growBloom).toBeCloseTo(2.7, 5);
    expect(m.core).toBeCloseTo(1.6, 5);
  });
});

describe('volumeForMode', () => {
  it('maps modes to litres', () => {
    expect(volumeForMode('full', 999)).toBe(47.5);
    expect(volumeForMode('refill', 999)).toBe(38);
    expect(volumeForMode('custom', 1)).toBe(1);
  });
});

describe('FEED_SCHEDULE reconciles with the dosage chart', () => {
  const row = (ec: number) => DOSE_TABLE.find((r) => r.ec === ec)!;

  it('clone EC 2.0 = Pro Bloom 57 + Core 34', () => {
    const clone = FEED_SCHEDULE.find((s) => s.key === 'clone')!;
    expect(clone.ec).toBe(2.0);
    expect(clone.primary.ml).toBe(row(2.0).growBloom); // 57
    expect(clone.core).toContain(String(row(2.0).core)); // 34
  });

  it('veg + flower EC 3.0 = Grow/Bloom 90 + Core 54', () => {
    for (const key of ['veg', 'flower'] as const) {
      const s = FEED_SCHEDULE.find((x) => x.key === key)!;
      expect(s.ec).toBe(3.0);
      expect(s.primary.ml).toBe(row(3.0).growBloom); // 90
      expect(s.core).toContain(String(row(3.0).core)); // 54
    }
  });
});
