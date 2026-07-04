import { describe, expect, it } from 'vitest';
import {
  clampSeconds,
  mlToSeconds,
  percentToMl,
  resolveShotSeconds,
  zoneFlowMlPerMin
} from '../../src/lib/server/opensprinkler/shots';
import type { Zone } from '../../src/lib/server/opensprinkler/zones';

function zone(overrides: Partial<Zone> = {}): Zone {
  return {
    id: 'z1',
    name: 'Tent 1',
    stationSid: 0,
    substrateType: 'Rockwool',
    substrateVolumeMl: 4000,
    drippers: 2,
    emitterLph: 2, // L/hr (canonical)
    maxRunSeconds: 300,
    vwcEntityId: null,
    pwecEntityId: null,
    enabled: true,
    createdAt: '2026-07-04T00:00:00.000Z',
    updatedAt: '2026-07-04T00:00:00.000Z',
    ...overrides
  };
}

describe('shot math', () => {
  it('computes total emitter flow (2 drippers × 2 L/hr ≈ 66.7 mL/min)', () => {
    expect(zoneFlowMlPerMin(zone())).toBeCloseTo(66.67, 1);
    expect(zoneFlowMlPerMin(zone({ drippers: null }))).toBeNull();
    expect(zoneFlowMlPerMin(zone({ emitterLph: null }))).toBeNull();
  });

  it('converts a percent shot to mL of the substrate volume', () => {
    expect(percentToMl(3, zone())).toBeCloseTo(120, 6); // 3% of 4000 mL
    expect(percentToMl(3, zone({ substrateVolumeMl: null }))).toBeNull();
  });

  it('converts mL to seconds via the flow rate', () => {
    // one minute's worth of flow → 60 s
    expect(mlToSeconds(66.6667, zone())).toBeCloseTo(60, 1);
    expect(mlToSeconds(100, zone({ drippers: null }))).toBeNull();
  });

  it('resolves a raw seconds request as authoritative', () => {
    expect(resolveShotSeconds({ seconds: 42 }, zone())).toBe(42);
    expect(resolveShotSeconds({ seconds: 42.6 }, zone())).toBe(43);
  });

  it('resolves a percent shot through the emitter/substrate spec', () => {
    // 3% of 4000 mL = 120 mL ÷ 66.67 mL/min × 60 ≈ 108 s
    expect(resolveShotSeconds({ percent: 3 }, zone())).toBe(108);
  });

  it('resolves an mL shot through the emitter spec', () => {
    expect(resolveShotSeconds({ ml: 120 }, zone())).toBe(108);
  });

  it('rejects non-positive and unspecified inputs', () => {
    expect(() => resolveShotSeconds({}, zone())).toThrow(/one of/);
    expect(() => resolveShotSeconds({ seconds: 0 }, zone())).toThrow(/positive/);
    expect(() => resolveShotSeconds({ percent: -1 }, zone())).toThrow(/positive/);
  });

  it('rejects a sub-half-second run that would round to 0 (no t=0 command)', () => {
    expect(() => resolveShotSeconds({ seconds: 0.4 }, zone())).toThrow(/rounds to 0/);
  });

  it('rejects volumetric shots when the zone lacks the spec', () => {
    expect(() => resolveShotSeconds({ percent: 3 }, zone({ substrateVolumeMl: null }))).toThrow(/substrate volume/);
    expect(() => resolveShotSeconds({ ml: 100 }, zone({ drippers: null }))).toThrow(/emitter flow/);
  });

  it('clamps a run to the zone max-run cap', () => {
    expect(clampSeconds(60, 300)).toBe(60);
    expect(clampSeconds(600, 300)).toBe(300);
  });
});
