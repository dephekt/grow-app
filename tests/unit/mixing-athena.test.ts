import { describe, it, expect } from 'vitest';
import {
  perTenLitres,
  mix,
  volumeForMode,
  DOSE_TABLE,
  FEED_SCHEDULE,
  MEDIUM,
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

describe('MEDIUM', () => {
  it('pins the coco batch pH target to 6.0 (window 5.8–6.2)', () => {
    expect(MEDIUM.ph).toMatchObject({ min: 5.8, max: 6.2, target: 6.0 });
    expect(MEDIUM.label).toMatch(/coco/i);
  });
});

describe('FEED_SCHEDULE — CCI LED coco setpoints, dosed with Athena Pro', () => {
  const rowFor = (ec: number) => DOSE_TABLE.find((r) => r.ec === ec);

  it('follows the CCI LED feed-EC path (seedling 1.5 → veg/early-flower 3.5 → bulk 3.0 → finish 2.5)', () => {
    expect(FEED_SCHEDULE.map((s) => s.ec)).toEqual([1.5, 3.5, 3.5, 3.0, 2.5]);
  });

  it('targets coco pH 6.0 for veg + flower (seedling 5.5–5.6)', () => {
    for (const s of FEED_SCHEDULE) {
      if (s.key === 'seedling') expect(s.ph).toMatch(/5\.5|5\.6/);
      else expect(s.ph).toBe('6.0');
    }
  });

  it('doses each stage to its feed EC off the 226 g/L chart', () => {
    for (const s of FEED_SCHEDULE) {
      const row = rowFor(s.ec);
      expect(row, `no chart row for EC ${s.ec}`).toBeTruthy();
      expect(s.primary.ml).toBe(row!.growBloom);
      const core = s.core.match(/(\d+)/);
      if (/core/i.test(s.core) && core) expect(Number(core[1])).toBe(row!.core);
    }
  });
});
