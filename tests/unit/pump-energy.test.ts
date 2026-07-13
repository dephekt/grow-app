import { describe, expect, it } from 'vitest';
import { integratePower, type PowerSample } from '../../src/lib/server/influx/pump-energy';

describe('integratePower', () => {
  it('is a measured zero for an empty window', () => {
    expect(integratePower([])).toEqual({ energyWh: 0, peakW: 0, sampleCount: 0 });
  });

  it('yields 0 Wh but a real peak for a single sample (no interval to integrate)', () => {
    const r = integratePower([{ tMs: 1000, watts: 55 }]);
    expect(r.energyWh).toBe(0);
    expect(r.peakW).toBe(55);
    expect(r.sampleCount).toBe(1);
  });

  it('trapezoidally integrates a constant series to W·h', () => {
    // 60 W held for 60 s (two samples) → 60 W * (1/60) h = 1 Wh.
    const samples: PowerSample[] = [
      { tMs: 0, watts: 60 },
      { tMs: 60_000, watts: 60 }
    ];
    const r = integratePower(samples);
    expect(r.energyWh).toBeCloseTo(1, 6);
    expect(r.peakW).toBe(60);
  });

  it('averages across a ramp (trapezoid) and tracks the peak', () => {
    // 0 → 100 W over 3600 s → mean 50 W for 1 h = 50 Wh.
    const r = integratePower([
      { tMs: 0, watts: 0 },
      { tMs: 3_600_000, watts: 100 }
    ]);
    expect(r.energyWh).toBeCloseTo(50, 6);
    expect(r.peakW).toBe(100);
  });

  it('sorts unordered samples before integrating', () => {
    const ordered = integratePower([
      { tMs: 0, watts: 40 },
      { tMs: 30_000, watts: 40 }
    ]);
    const shuffled = integratePower([
      { tMs: 30_000, watts: 40 },
      { tMs: 0, watts: 40 }
    ]);
    expect(shuffled.energyWh).toBeCloseTo(ordered.energyWh, 9);
    expect(shuffled.energyWh).toBeGreaterThan(0);
  });
});
