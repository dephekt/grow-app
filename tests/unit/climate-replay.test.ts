// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/**
 * Replay of real recorded tent traces through the control law.
 *
 * This is the main regression net: the unit tests above prove each guard in isolation, but
 * only measured data proves the loop behaves sensibly on the two failure modes it was built
 * to replace — the 5 min/hour firmware pulse (08-12) and being left on continuously (08-14).
 *
 * Every sample is a 10-minute mean pulled from InfluxDB (`daniel-home`, node
 * `atoms3u-sensor-rig` for tent air, `feather-air-monitor` for room air). Times are CDT.
 */
import { describe, expect, it } from 'vitest';
import { decideClimate, type ClimateAction } from '../../src/lib/climate/decide';
import { airVpdKpa } from '../../src/lib/climate/psychro';
import { DEFAULT_CLIMATE_CONFIG, controlBand } from '../../src/lib/climate/model';

interface Sample {
  at: string;
  tempC: number;
  rhPct: number;
}

/** Veg week 1: CCI Black Book p.57 gives air VPD 1.0, so the band is 0.90–1.10. */
const BAND = controlBand(1.0, 0.1);

const CONFIG = { ...DEFAULT_CLIMATE_CONFIG, mode: 'active' as const, exhaustSource: 'loop' as const };

/** Step a trace through the law, carrying the relay state forward exactly as the loop would. */
function replay(
  samples: Sample[],
  opts: { startOn: boolean; room: { tempC: number; rhPct: number } | null; lightsOn: boolean }
): Array<{ at: string; airVpd: number; on: boolean; action: ClimateAction }> {
  let on = opts.startOn;
  // Ten minutes per sample, well past both minimums, so the timers never mask the law itself.
  let nowMs = Date.UTC(2026, 7, 14, 0, 0, 0);
  let lastChangeMs: number | null = null;

  return samples.map((s) => {
    const airVpd = airVpdKpa(s.tempC, s.rhPct);
    const { action } = decideClimate({
      nowMs,
      config: CONFIG,
      band: BAND,
      reading: { tent: { tempC: s.tempC, rhPct: s.rhPct }, room: opts.room, airVpd, leafVpd: null, lightsOn: opts.lightsOn },
      exhaust: { present: true, on, lastChangeMs },
      humidifier: { present: false, on: false, lastChangeMs: null },
      armsOn: []
    });
    if (action.kind === 'exhaust') {
      on = action.on;
      lastChangeMs = nowMs;
    }
    nowMs += 10 * 60 * 1000;
    return { at: s.at, airVpd, on, action };
  });
}

describe('replay — 08-14 daytime, fan running continuously', () => {
  const room = { tempC: 25.02, rhPct: 61.4 };

  it('stops the fan: the tent is over-vented for veg week 1', () => {
    // Air VPD 1.32 is past the book's 1.2 hard ceiling, never mind the 1.10 top of band.
    const [step] = replay([{ at: '12:07', tempC: 27.18, rhPct: 63.5 }], { startOn: true, room, lightsOn: true });
    expect(step.airVpd).toBeCloseTo(1.32, 2);
    expect(step.action).toMatchObject({ kind: 'exhaust', on: false });
  });

  it('and does not immediately restart it', () => {
    const steps = replay(
      [
        { at: '12:07', tempC: 27.18, rhPct: 63.5 },
        { at: '12:17', tempC: 27.13, rhPct: 63.4 },
        { at: '12:27', tempC: 27.11, rhPct: 63.3 }
      ],
      { startOn: true, room, lightsOn: true }
    );
    expect(steps.map((s) => s.on)).toEqual([false, false, false]);
  });
});

describe('replay — 08-14 night', () => {
  const room = { tempC: 24.45, rhPct: 56 };

  it('vents the parked, unvented tent', () => {
    // 03:10, never vented since lights-off: 92 % RH and air VPD 0.24.
    const [step] = replay([{ at: '03:10', tempC: 24.23, rhPct: 92.0 }], { startOn: false, room, lightsOn: false });
    expect(step.airVpd).toBeCloseTo(0.24, 2);
    expect(step.action).toMatchObject({ kind: 'exhaust', on: true });
  });

  it('holds the fan on through the vented steady state, matching what actually ran', () => {
    // 03:30-06:00 with the fan running: air VPD sat at 0.93-0.96, inside the band. The loop
    // agrees with the night that was actually run, which is the point of the comparison.
    const steps = replay(
      [
        { at: '03:30', tempC: 23.74, rhPct: 68.2 },
        { at: '03:40', tempC: 23.72, rhPct: 67.5 },
        { at: '04:00', tempC: 23.72, rhPct: 67.2 },
        { at: '05:00', tempC: 23.68, rhPct: 67.5 },
        { at: '06:00', tempC: 23.66, rhPct: 68.0 }
      ],
      { startOn: true, room, lightsOn: false }
    );
    for (const step of steps) {
      expect(step.airVpd).toBeGreaterThan(BAND.low);
      expect(step.airVpd).toBeLessThan(BAND.high);
      expect(step.on).toBe(true);
      expect(step.action.kind).toBe('hold');
    }
  });
});

describe('replay — 08-12 sealed decay, the off half of the duty cycle', () => {
  const room = { tempC: 25, rhPct: 55 };

  it('leaves the fan off for the whole measured descent from the top of band', () => {
    // Recorded WITH the humidistat running, so this is the realistic re-humidification rate.
    // 40 minutes of measured decay and not one restart: the tent humidifies itself back down
    // with no venting pressure on the humidifier, which is the behaviour the design wants.
    const steps = replay(
      [
        { at: '13:20', tempC: 29.08, rhPct: 69.7 },
        { at: '13:30', tempC: 29.5, rhPct: 72.5 },
        { at: '13:40', tempC: 29.69, rhPct: 74.5 },
        { at: '13:50', tempC: 29.81, rhPct: 76.0 },
        { at: '14:00', tempC: 29.88, rhPct: 77.0 }
      ],
      { startOn: false, room, lightsOn: true }
    );
    expect(steps.map((s) => s.on)).toEqual([false, false, false, false, false]);
    // Decelerating, not linear — the reason the off leg lasts nearly an hour.
    const deltas = steps.slice(1).map((s, i) => steps[i].airVpd - s.airVpd);
    expect(deltas.every((d, i) => i === 0 || d <= deltas[i - 1] + 1e-9)).toBe(true);
  });

  it('restarts the fan once the decay carries VPD under the floor of band', () => {
    // 12:10 the same day, deeper into a sealed stretch: 79.1 % RH, air VPD 0.86.
    const [step] = replay([{ at: '12:10', tempC: 29.48, rhPct: 79.1 }], { startOn: false, room, lightsOn: true });
    expect(step.airVpd).toBeLessThan(BAND.low);
    expect(step.action).toMatchObject({ kind: 'exhaust', on: true });
  });
});
