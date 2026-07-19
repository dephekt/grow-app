import { describe, it, expect } from 'vitest';
import {
  dliFor,
  resolveGrowState,
  buildGuidance,
  WEEKLY_PLAN,
  GROW_START
} from '$lib/lights/grow-plan';

describe('dliFor', () => {
  it('converts a steady PPFD held for the photoperiod into mol·m⁻²·d⁻¹', () => {
    // 555 µmol × 20 h = 39.96 mol/day
    expect(dliFor(555, 20)).toBeCloseTo(39.96, 2);
    expect(dliFor(0, 20)).toBe(0);
    expect(dliFor(1155, 12)).toBeCloseTo(49.9, 1);
  });
});

describe('resolveGrowState', () => {
  it('lands on veg week 2 seven days after the start', () => {
    const s = resolveGrowState(new Date('2026-07-19'));
    expect(s.week).toBe(2);
    expect(s.stage.key).toBe('veg');
    expect(s.ppfdTarget).toBe(555);
    expect(s.onHours).toBe(20);
    expect(s.dliTarget).toBeCloseTo(39.96, 2);
  });

  it('clamps to week 1 before the grow starts', () => {
    const s = resolveGrowState(new Date('2026-06-01'));
    expect(s.week).toBe(1);
    expect(s.stage.key).toBe('seedling');
  });

  it('clamps to the final week well past the end', () => {
    const s = resolveGrowState(new Date('2027-01-01'));
    expect(s.week).toBe(WEEKLY_PLAN[WEEKLY_PLAN.length - 1].week);
    expect(s.stage.key).toBe('ripen');
  });

  it('marks exactly one week current in the weekly series', () => {
    const s = resolveGrowState(new Date('2026-07-19'), GROW_START);
    expect(s.weekly.filter((w) => w.current)).toHaveLength(1);
    expect(s.weekly.find((w) => w.current)?.week).toBe(2);
    expect(s.weekly).toHaveLength(WEEKLY_PLAN.length);
  });
});

describe('buildGuidance', () => {
  it('recommends full power + lowering the fixture when the dimmer alone cannot reach target', () => {
    const g = buildGuidance(336, 78, 555); // needs 129% → dimmer alone is impossible
    expect(g.status).toBe('under');
    expect(g.deltaPct).toBeCloseTo(-39.5, 0);
    expect(g.dimmerForTargetPct ?? 0).toBeGreaterThan(100);
    expect(g.message).toMatch(/raise to 100% and lower the fixture/i);
    expect(g.message).not.toMatch(/second fixture/i);
    // targetDistanceCm is the 100% hang height for the target, not a current-dimmer figure.
    expect(g.targetDistanceCm).toBeCloseTo(68.7, 0);
  });

  it('reframes the low-dimmer case as full power + a specific hang height (the reported bad case)', () => {
    const g = buildGuidance(108, 30, 555); // 30% reading 108 vs veg 555
    expect(g.status).toBe('under');
    expect(g.message).toMatch(/raise to 100%/i);
    expect(g.message).toMatch(/lower the fixture to ≈69 cm/);
    expect(g.message).not.toMatch(/second fixture/i);
    expect(g.estDistanceCm).toBeCloseTo(105.9, 0); // current height inferred from 108 @ 30%
    expect(g.targetDistanceCm).toBeCloseTo(68.7, 0); // 100% hang for 555
  });

  it('tells you to raise the dimmer when there is headroom', () => {
    const g = buildGuidance(300, 40, 555); // needs 74%
    expect(g.status).toBe('under');
    expect(g.dimmerForTargetPct).toBeCloseTo(74, 0);
    expect(g.message).toMatch(/raise intensity to ~74%/i);
  });

  it('reports on-target within tolerance', () => {
    const g = buildGuidance(550, 78, 555);
    expect(g.status).toBe('on-target');
    expect(g.message).toMatch(/on target/i);
  });

  it('reports over-target with a dim-down suggestion', () => {
    const g = buildGuidance(700, 78, 555);
    expect(g.status).toBe('over');
    expect(g.message).toMatch(/lower intensity|raise the fixture/i);
  });

  it('is unknown until PPFD is calibrated', () => {
    const g = buildGuidance(null, 78, 555);
    expect(g.status).toBe('unknown');
    expect(g.deltaPct).toBeNull();
    expect(g.message).toMatch(/calibration anchor/i);
  });

  it('recommends full power + lowering even when the dimmer duty is unknown', () => {
    const g = buildGuidance(336, null, 555);
    expect(g.status).toBe('under');
    expect(g.estDistanceCm).toBeNull();
    expect(g.message).toMatch(/raise to 100% and lower the fixture/i);
    expect(g.targetDistanceCm).toBeCloseTo(68.7, 0);
  });
});
