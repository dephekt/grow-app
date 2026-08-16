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
import { airVpdKpa, ventedAirVpdKpa } from '../../src/lib/climate/psychro';
import { AIR_VPD_HARD_MAX, DEFAULT_CLIMATE_CONFIG, controlBand } from '../../src/lib/climate/model';
import { RollingMedian } from '../../src/lib/climate/smoothing';
import { MIN_FAST_SAMPLES, fastSmoothingWindowMs } from '../../src/lib/server/climate/loop';

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
    const action = decideClimate({
      nowMs,
      config: CONFIG,
      band: BAND,
      reading: {
        tent: { tempC: s.tempC, rhPct: s.rhPct },
        room: opts.room,
        airVpd,
        // The harness replays recorded samples directly rather than through two windows, so
        // both readings are the same series; the fast/slow split is covered in climate-decide.
        airVpdFast: airVpd,
        ventedAirVpd: opts.room === null ? null : ventedAirVpdKpa(opts.room, opts.lightsOn),
        leafVpd: null,
        lightsOn: opts.lightsOn,
        warmingUp: false
      },
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

/**
 * The 13:05 vent run of 2026-08-15, at the loop's own 30 s cadence, fed through real smoothing
 * windows rather than ideal readings. This is the run that put the tent at 1.42 while the 5 min
 * median still read 1.14, so it is the trace that has to stay covered: the samples below start
 * at air VPD 0.899 (the reading that triggered the start) and peak at 1.42.
 */
const VENT_RUN_08_15: Array<[number, number]> = [
  [29.18, 77.77], [29.21, 77.76], [29.17, 77.82], [29.18, 77.81], [29.19, 77.88], [29.19, 77.82],
  [29.2, 77.81], [29.2, 77.88], [29.19, 77.85], [29.2, 77.89], [29.21, 77.84], [29.2, 77.81],
  [29.2, 77.87], [29.19, 77.66], [29.21, 76.57], [29.17, 75.36], [29.2, 73.51], [29.18, 72.72],
  [29.19, 72.17], [29.17, 70.36], [29.14, 69.52], [29.17, 69.1], [29.13, 67.64], [29.11, 66.99],
  [29.11, 66.62], [29.08, 65.75], [29.05, 65.46], [29.04, 64.74], [29.04, 65.32], [29.01, 65.29],
  [28.98, 63.71], [28.91, 64.33], [28.94, 64.04], [28.88, 64.04], [28.87, 65.51], [28.83, 66.68],
  [28.78, 66.92], [28.77, 67.24], [28.71, 67.46], [28.67, 67.61]
];

/**
 * Sub-samples the 10 s series at `tickSeconds`, then drives the law through real windows with
 * the relay timers carried forward — i.e. the loop, not an idealisation of it.
 */
function replaySmoothed(tickSeconds: number): { peakWhileOn: number; starts: number } {
  const tickMs = tickSeconds * 1000;
  // The production sizing, not a copy of it: a change to fastSmoothingWindowMs has to be felt
  // here, or this test guards a formula that no longer ships.
  const prevTick = process.env.GROW_CLIMATE_TICK_SECONDS;
  process.env.GROW_CLIMATE_TICK_SECONDS = String(tickSeconds);
  const fastMs = fastSmoothingWindowMs();
  if (prevTick === undefined) delete process.env.GROW_CLIMATE_TICK_SECONDS;
  else process.env.GROW_CLIMATE_TICK_SECONDS = prevTick;
  const slowT = new RollingMedian(300_000), slowH = new RollingMedian(300_000);
  const fastT = new RollingMedian(fastMs), fastH = new RollingMedian(fastMs);
  let on = true;
  // The fan is treated as having just started, so the minimum-on timer is LIVE. Left null, the
  // timer never engages and the rail assertions below certify a property they do not exercise —
  // the measured trace happens to sit flat for its first ~130s and outruns the 120s minimum,
  // so it would pass either way.
  let lastChangeMs: number | null = 0;
  let peakWhileOn = 0;
  let starts = 0;

  for (let raw = 0, k = 0; raw < VENT_RUN_08_15.length; raw += tickSeconds / 10, k++) {
    const [tempC, rhPct] = VENT_RUN_08_15[raw];
    const nowMs = k * tickMs;
    for (const m of [slowT, fastT]) m.push(tempC, nowMs);
    for (const m of [slowH, fastH]) m.push(rhPct, nowMs);
    if (on) peakWhileOn = Math.max(peakWhileOn, airVpdKpa(tempC, rhPct));

    const action = decideClimate({
      nowMs,
      config: CONFIG,
      band: BAND,
      reading: {
        tent: { tempC: slowT.value(nowMs)!, rhPct: slowH.value(nowMs)! },
        room: null,
        airVpd: airVpdKpa(slowT.value(nowMs)!, slowH.value(nowMs)!),
        airVpdFast:
          fastT.count(nowMs) < MIN_FAST_SAMPLES
            ? null
            : airVpdKpa(fastT.value(nowMs)!, fastH.value(nowMs)!),
        ventedAirVpd: null,
        leafVpd: null,
        lightsOn: true,
        warmingUp: false
      },
      exhaust: { present: true, on, lastChangeMs },
      humidifier: { present: false, on: false, lastChangeMs: null },
      armsOn: []
    });
    if (action.kind === 'exhaust' && action.on !== on) {
      if (action.on) starts++;
      on = action.on;
      lastChangeMs = nowMs;
    }
  }
  return { peakWhileOn, starts };
}

describe('replay — 08-15 vent run, at the loop tick', () => {
  it('is the trace that breached: left alone it reaches 1.45', () => {
    const peak = Math.max(...VENT_RUN_08_15.map(([t, h]) => airVpdKpa(t, h)));
    expect(peak).toBeGreaterThan(1.4);
  });

  // `peakWhileOn` is the highest reading the tent showed while the fan was still commanded on,
  // i.e. it measures WHEN the loop let go, not where the tent finally settled after it. On this
  // trace the true peak lands within seconds of the stop, so the two are close, but the claim
  // being made here is about the stop, not the coast.
  it('lets go before the tent reaches the 1.20 rail, at the 10 s tick', () => {
    expect(replaySmoothed(10).peakWhileOn).toBeLessThan(AIR_VPD_HARD_MAX);
  });

  // The tick, not the window, is what bounds this: at 0.25 kPa/min the tent crosses from the
  // 1.10 band top to the 1.20 rail in under 25 s, so a 30 s tick cannot see it in time however
  // the smoothing is arranged. Kept as a test so a tick raised for cost reasons fails here
  // rather than silently in the tent.
  it('cannot hold the rail at the old 30 s tick, whatever the window', () => {
    expect(replaySmoothed(30).peakWhileOn).toBeGreaterThan(AIR_VPD_HARD_MAX);
  });

  it('never re-starts the fan inside a single run', () => {
    expect(replaySmoothed(10).starts).toBe(0);
  });
});

/**
 * The measured trace is flat for its first ~130 s, so it clears the 120 s minimum on before it
 * ramps and cannot catch a stop the timer defers. This is the case it misses: a run that starts
 * at the floor and ramps immediately, which is what a daylight vent actually does.
 */
describe('a vent that ramps from the moment it starts', () => {
  function rampFromStart(rateKpaPerMin: number): number {
    const tickMs = 10_000;
    let on = true;
    let lastChangeMs: number | null = 0;
    let peakWhileOn = 0;
    // Held at 29 °C, with RH solved to place air VPD exactly on the ramp.
    const tempC = 29.0;
    const svp = airVpdKpa(tempC, 0);
    for (let k = 0; k * tickMs <= 600_000; k++) {
      const nowMs = k * tickMs;
      const vpd = 0.9 + (rateKpaPerMin / 60) * (nowMs / 1000);
      if (on) peakWhileOn = Math.max(peakWhileOn, vpd);
      const action = decideClimate({
        nowMs,
        config: CONFIG,
        band: BAND,
        reading: {
          tent: { tempC, rhPct: (1 - vpd / svp) * 100 },
          room: null,
          airVpd: vpd,
          airVpdFast: vpd,
          ventedAirVpd: null,
          leafVpd: null,
          lightsOn: true,
          warmingUp: false
        },
        exhaust: { present: true, on, lastChangeMs },
        humidifier: { present: false, on: false, lastChangeMs: null },
        armsOn: []
      });
      if (action.kind === 'exhaust' && action.on !== on) {
        on = action.on;
        lastChangeMs = nowMs;
      }
      if (!on) break;
    }
    return peakWhileOn;
  }

  // 0.25 kPa/min crosses the 0.20-wide band in ~48s, well inside the 120s minimum on, so a
  // deferred stop lands at 1.23 — past the rail the short window exists to defend.
  it('lets go at the top of band rather than waiting out the minimum on', () => {
    expect(rampFromStart(0.25)).toBeLessThan(AIR_VPD_HARD_MAX);
  });

  it('holds the rail at the steeper rates a hot tent reaches', () => {
    expect(rampFromStart(0.4)).toBeLessThan(AIR_VPD_HARD_MAX);
  });
});

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
