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
  it('tells you to lower the fixture when 100% still would not reach target', () => {
    const g = buildGuidance(336, 78, 555); // needs 129% → impossible
    expect(g.status).toBe('under');
    expect(g.deltaPct).toBeCloseTo(-39.5, 0);
    expect((g.dimmerForTargetPct ?? 0)).toBeGreaterThan(100);
    expect(g.message).toMatch(/lower the fixture/i);
    expect(g.targetDistanceCm).toBeGreaterThan(0);
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

  it('still gives a delta message when the dimmer duty is unknown', () => {
    const g = buildGuidance(336, null, 555);
    expect(g.status).toBe('under');
    expect(g.estDistanceCm).toBeNull();
    expect(g.message).toMatch(/raise intensity or lower the fixture/i);
  });
});
