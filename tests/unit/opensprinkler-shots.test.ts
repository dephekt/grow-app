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
    substrateVolumeMl: 3785,
    drippers: 2,
    emitterGph: 0.5,
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
  it('computes total emitter flow (2 drippers × 0.5 GPH ≈ 63.09 mL/min)', () => {
    expect(zoneFlowMlPerMin(zone())).toBeCloseTo(63.09, 1);
    expect(zoneFlowMlPerMin(zone({ drippers: null }))).toBeNull();
    expect(zoneFlowMlPerMin(zone({ emitterGph: null }))).toBeNull();
  });

  it('converts a percent shot to mL of the substrate volume', () => {
    expect(percentToMl(3, zone())).toBeCloseTo(113.55, 2);
    expect(percentToMl(3, zone({ substrateVolumeMl: null }))).toBeNull();
  });

  it('converts mL to seconds via the flow rate', () => {
    expect(mlToSeconds(63.0902, zone({ drippers: 1, emitterGph: 1 }))).toBeCloseTo(60, 3);
    expect(mlToSeconds(100, zone({ drippers: null }))).toBeNull();
  });

  it('resolves a raw seconds request as authoritative', () => {
    expect(resolveShotSeconds({ seconds: 42 }, zone())).toBe(42);
    expect(resolveShotSeconds({ seconds: 42.6 }, zone())).toBe(43);
  });

  it('resolves a percent shot through the emitter/substrate spec', () => {
    // 3% of 3785 mL = 113.55 mL ÷ 63.09 mL/min × 60 ≈ 108 s
    expect(resolveShotSeconds({ percent: 3 }, zone())).toBe(108);
  });

  it('resolves an mL shot through the emitter spec', () => {
    expect(resolveShotSeconds({ ml: 63.0902 }, zone({ drippers: 1, emitterGph: 1 }))).toBe(60);
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
