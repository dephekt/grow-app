import { describe, it, expect } from 'vitest';
import { selectHydroReadings, ecToMilliSiemens, formatBatchEc } from '$lib/mixing/hydro';
import type { Snapshot } from '$lib/server/mqtt/types';

const ecEnt = { id: 'ec1', component: 'sensor', deviceClass: 'conductivity', unit: 'µS/cm', name: 'Water EC' };
const phEnt = { id: 'ph1', component: 'sensor', deviceClass: 'ph', unit: 'pH', name: 'Water pH' };

function snap(entities: unknown[], states: Record<string, { value: string | null; updatedAt: string | null }>): Snapshot {
  return { entities, states } as unknown as Snapshot;
}

describe('ecToMilliSiemens', () => {
  it('converts µS/cm to mS/cm and passes mS/cm through', () => {
    expect(ecToMilliSiemens(1200, 'µS/cm')).toBeCloseTo(1.2, 5);
    expect(ecToMilliSiemens(3000, 'uS/cm')).toBeCloseTo(3.0, 5);
    expect(ecToMilliSiemens(3.0, 'mS/cm')).toBe(3.0);
    expect(ecToMilliSiemens(2.4, '')).toBe(2.4); // unknown unit assumed mS/cm
  });
});

describe('selectHydroReadings', () => {
  it('reads EC (normalized to mS/cm) and pH from the hydro kit sensors', () => {
    const s = snap([ecEnt, phEnt], {
      ec1: { value: '1200', updatedAt: '2026-07-20T00:00:00Z' },
      ph1: { value: '6.2', updatedAt: '2026-07-20T00:00:01Z' }
    });
    const r = selectHydroReadings(s);
    expect(r.ec).toMatchObject({ value: 1200, unit: 'µS/cm', mScm: 1.2 });
    expect(r.ph).toMatchObject({ value: 6.2, unit: 'pH' });
  });

  it('returns null for absent sensors', () => {
    const r = selectHydroReadings(snap([], {}));
    expect(r.ec).toBeNull();
    expect(r.ph).toBeNull();
  });

  it('returns null for a present entity with no / non-numeric state', () => {
    const s = snap([ecEnt, phEnt], {
      ec1: { value: null, updatedAt: null },
      ph1: { value: 'nan', updatedAt: null }
    });
    const r = selectHydroReadings(s);
    expect(r.ec).toBeNull();
    expect(r.ph).toBeNull();
  });

  it('passes an mS/cm-native EC reading through unscaled', () => {
    const s = snap([{ ...ecEnt, unit: 'mS/cm' }], { ec1: { value: '3.05', updatedAt: null } });
    expect(selectHydroReadings(s).ec?.mScm).toBeCloseTo(3.05, 5);
  });
});

describe('formatBatchEc', () => {
  it('shows a fresh-water reading in its native µS/cm, not a collapsed 0.00 mS/cm', () => {
    // The bug: 2.89 µS/cm → 0.00289 mS/cm → "0.00 mS/cm" looked like a dead sensor.
    expect(formatBatchEc({ value: 2.89, unit: 'µS/cm', mScm: 0.00289, updatedAt: null })).toEqual({
      value: '2.89',
      unit: 'µS/cm'
    });
  });

  it('shows nutrient-strength EC in mS/cm to match the target', () => {
    expect(formatBatchEc({ value: 1500, unit: 'µS/cm', mScm: 1.5, updatedAt: null })).toEqual({
      value: '1.50',
      unit: 'mS/cm'
    });
  });

  it('keeps a legible mS/cm reading in mS/cm (0.1 threshold)', () => {
    expect(formatBatchEc({ value: 0.5, unit: 'mS/cm', mScm: 0.5, updatedAt: null })).toEqual({
      value: '0.50',
      unit: 'mS/cm'
    });
  });
});
