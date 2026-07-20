import { describe, it, expect } from 'vitest';
import { selectHydroReadings, ecToMilliSiemens } from '$lib/mixing/hydro';
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
