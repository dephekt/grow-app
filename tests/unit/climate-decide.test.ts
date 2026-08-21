// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { describe, expect, it } from 'vitest';
import {
  decideClimate,
  type ActuatorState,
  type ClimateDecisionInput
} from '../../src/lib/climate/decide';
import { ventedAirVpdKpa } from '../../src/lib/climate/psychro';
import {
  AIR_VPD_HARD_MAX,
  AIR_VPD_HARD_MIN,
  DEFAULT_CLIMATE_CONFIG,
  controlBand,
  type ClimateConfig
} from '../../src/lib/climate/model';

const NOW = Date.UTC(2026, 7, 14, 12, 0, 0);
const BAND = controlBand(1.0, 0.1);

/** A room that is much drier than any tent state under test, so the predictive gate passes
 *  unless a case deliberately makes it fail. */
const DRY_ROOM = { tempC: 24.5, rhPct: 50 };

const actuator = (over: Partial<ActuatorState> = {}): ActuatorState => ({
  present: true,
  on: false,
  lastChangeMs: null,
  ...over
});

function input(over: {
  config?: Partial<ClimateConfig>;
  airVpd?: number | null;
  /** Defaults to `airVpd`, so a case that does not care about the fast/slow split reads as it
   *  did before the split existed. */
  airVpdFast?: number | null;
  tentTempC?: number | null;
  room?: { tempC: number; rhPct: number } | null;
  exhaust?: Partial<ActuatorState>;
  humidifier?: Partial<ActuatorState>;
  armsOn?: string[];
  nowMs?: number;
  lightsOn?: boolean;
  warmingUp?: boolean;
}): ClimateDecisionInput {
  const tentTempC = over.tentTempC === undefined ? 27 : over.tentTempC;
  const room = over.room === undefined ? DRY_ROOM : over.room;
  const lightsOn = over.lightsOn ?? true;
  return {
    nowMs: over.nowMs ?? NOW,
    // Armed by default: the guards under test are the interesting part, not the arming gate.
    config: { ...DEFAULT_CLIMATE_CONFIG, mode: 'active', exhaustSource: 'loop', ...over.config },
    band: BAND,
    reading: {
      tent: tentTempC === null ? null : { tempC: tentTempC, rhPct: 65 },
      room,
      airVpd: over.airVpd === undefined ? 1.0 : over.airVpd,
      airVpdFast:
        over.airVpdFast === undefined
          ? over.airVpd === undefined
            ? 1.0
            : over.airVpd
          : over.airVpdFast,
      // Derived from `room` exactly as the loop derives it, so the gate cases stay meaningful.
      ventedAirVpd: room === null ? null : ventedAirVpdKpa(room, lightsOn),
      leafVpd: null,
      lightsOn,
      warmingUp: over.warmingUp ?? false
    },
    exhaust: actuator(over.exhaust),
    humidifier: actuator({ present: false, ...over.humidifier }),
    armsOn: over.armsOn ?? []
  };
}

describe('decideClimate — mode gate', () => {
  it('holds when the loop is off', () => {
    const d = decideClimate(input({ config: { mode: 'off' }, airVpd: 0.5, armsOn: ['fan_cycle'] }));
    expect(d).toEqual({ kind: 'hold', reason: 'loop is off' });
  });

  it('still decides in observe mode — publishing is the caller’s gate, not the law’s', () => {
    const d = decideClimate(input({ config: { mode: 'observe' }, airVpd: 0.5 }));
    expect(d).toMatchObject({ kind: 'exhaust', on: true });
  });
});

describe('decideClimate — fail-safe', () => {
  it('holds when air VPD cannot be read', () => {
    const d = decideClimate(input({ airVpd: null }));
    expect(d.kind).toBe('hold');
    expect(d.reason).toContain('failing safe');
  });

  it('leaves the fan to its firmware when blind', () => {
    const d = decideClimate(input({ airVpd: null, armsOn: ['fan_cycle', 'fan_schedule'] }));
    expect(d).toEqual({ kind: 'hold', reason: 'no tent air reading — failing safe' });
  });

  it('reports an actuator it does not own as DELEGATED even when the plug is absent', () => {
    // The shipped default: RH external with no humidifier plug. Reporting that as `blocked`
    // painted the normal state red and contradicted the page's own copy.
    const d = decideClimate(
      input({ airVpd: 1.3, config: { rhSource: 'external' }, humidifier: { present: false } })
    );
    expect(d).toMatchObject({ kind: 'delegated', want: 'humidify', on: true });
  });

  it('reports an undiscovered plug it DOES own as blocked, in both directions', () => {
    // Wanting to act and being unable to is a block, not a hold — and an offline plug still
    // reports its last retained relay position, so the release leg needs the guard too.
    const start = decideClimate(input({ airVpd: 0.5, exhaust: { present: false } }));
    expect(start).toMatchObject({ kind: 'blocked', want: 'exhaust', on: true });
    expect(start.reason).toContain('not discovered');

    const stop = decideClimate(input({ airVpd: 1.15, exhaust: { present: false, on: true } }));
    expect(stop).toMatchObject({ kind: 'blocked', want: 'exhaust', on: false });
  });
});

describe('decideClimate — reason text', () => {
  it('distinguishes above-band from in-band when the fan is already off', () => {
    // With the fan off, "not below the floor" covers both; collapsing them would have the log
    // and the /climate verdict row claim the tent is in band while it sits over the ceiling.
    expect(decideClimate(input({ airVpd: 1.0 })).reason).toContain('inside the');
    expect(decideClimate(input({ airVpd: 1.19 })).reason).toContain('above the 1.10 top of band');
    expect(decideClimate(input({ airVpd: 0.85, room: null })).reason).toContain(
      'below the 0.90 floor'
    );
  });
});

describe('decideClimate — hysteresis', () => {
  it('starts venting below the floor of band', () => {
    expect(decideClimate(input({ airVpd: 0.89 }))).toMatchObject({ kind: 'exhaust', on: true });
  });

  it('holds off inside the band when it is already off', () => {
    expect(decideClimate(input({ airVpd: 1.0 })).kind).toBe('hold');
  });

  it('holds ON inside the band when it is already on — the band is the debounce', () => {
    const d = decideClimate(input({ airVpd: 1.0, exhaust: { on: true } }));
    expect(d.kind).toBe('hold');
    expect(d.reason).toContain('still below');
  });

  it('stops venting once it clears the top of band', () => {
    const d = decideClimate(input({ airVpd: 1.11, exhaust: { on: true } }));
    expect(d).toMatchObject({ kind: 'exhaust', on: false });
  });

  it('cannot short-cycle: crossing the floor upward while running does not stop it', () => {
    // The whole band must be traversed before the fan can reverse, which is what makes a
    // backoff timer unnecessary.
    for (const vpd of [0.89, 0.95, 1.05, 1.09]) {
      expect(decideClimate(input({ airVpd: vpd, exhaust: { on: true } })).kind).toBe('hold');
    }
  });

  it('releases AT the top of band, not above it', () => {
    // From grow week 6 band.high clamps to exactly AIR_VPD_HARD_MAX; holding at that reading
    // would park the fan on the rail ceilingBreach treats as a breach.
    expect(decideClimate(input({ airVpd: 1.1, exhaust: { on: true } }))).toMatchObject({
      kind: 'exhaust',
      on: false
    });
  });

  it('cannot short-cycle: falling back through the top of band does not restart it', () => {
    for (const vpd of [1.09, 1.0, 0.91, 0.9]) {
      expect(decideClimate(input({ airVpd: vpd, exhaust: { on: false } })).kind).toBe('hold');
    }
  });
});

describe('decideClimate — asymmetric smoothing', () => {
  // Live run 2026-08-15: a daylight vent crossed the band in 3.5 min, so the 5 min median
  // released the fan at 1.14 while the tent was already at 1.42, spending 8.7% of the day
  // past the 1.20 rail. The stop edge has to read the short window.
  it('stops on the fast reading, not the lagging median', () => {
    const d = decideClimate(input({ airVpd: 1.02, airVpdFast: 1.14, exhaust: { on: true } }));
    expect(d).toMatchObject({ kind: 'exhaust', on: false });
    expect(d.reason).toContain('1.14');
  });

  it('keeps venting while the fast reading is still inside the band', () => {
    const d = decideClimate(input({ airVpd: 0.95, airVpdFast: 1.04, exhaust: { on: true } }));
    expect(d.kind).toBe('hold');
    expect(d.reason).toContain('still below');
  });

  // The other edge keeps the long window: the tent re-humidifies ~0.02 kPa/min, so lag costs
  // nothing there, while a single dropout would otherwise start the fan on noise.
  it('starts on the median, ignoring a fast reading that dips below the floor', () => {
    expect(decideClimate(input({ airVpd: 0.95, airVpdFast: 0.8 })).kind).toBe('hold');
  });

  // The state right after a fast-triggered stop: the tent is hot but the 5 min median is still
  // dominated by pre-run samples. Starting on the median alone re-vents one tick after
  // stopping, which is the short-cycle the band is supposed to make impossible.
  it('refuses to re-start while the fast reading is still high, though the median is under the floor', () => {
    const d = decideClimate(input({ airVpd: 0.88, airVpdFast: 1.05 }));
    expect(d.kind).toBe('hold');
    // And says so, rather than claiming 0.88 is inside a band that starts at 0.90.
    expect(d.reason).toContain('below the 0.90 floor');
    expect(d.reason).toContain('1.05');
  });

  it('starts once the median itself falls below the floor', () => {
    expect(decideClimate(input({ airVpd: 0.89, airVpdFast: 0.89 }))).toMatchObject({
      kind: 'exhaust',
      on: true
    });
  });

  it('falls back to the median when there is no fast window yet', () => {
    const d = decideClimate(input({ airVpd: 1.11, airVpdFast: null, exhaust: { on: true } }));
    expect(d).toMatchObject({ kind: 'exhaust', on: false });
  });

  it('breaches the hard ceiling urgently on the fast reading, voiding the minimum on', () => {
    const d = decideClimate(
      input({
        airVpd: 1.05,
        airVpdFast: 1.24,
        exhaust: { on: true, lastChangeMs: NOW - 10_000 },
        config: { minOnSeconds: 600 }
      })
    );
    expect(d).toMatchObject({ kind: 'exhaust', on: false });
  });
});

describe('decideClimate — minimum on/off', () => {
  it('waits out the minimum off before restarting', () => {
    const d = decideClimate(input({ airVpd: 0.5, exhaust: { lastChangeMs: NOW - 60_000 } }));
    expect(d.kind).toBe('hold');
    expect(d.reason).toContain('minimum off');
  });

  it('restarts once the minimum off has elapsed', () => {
    const d = decideClimate(input({ airVpd: 0.5, exhaust: { lastChangeMs: NOW - 301_000 } }));
    expect(d).toMatchObject({ kind: 'exhaust', on: true });
  });

  // Reversed deliberately. The minimum on used to defer a band-top stop, which was survivable
  // only while the stop read the 5 min median and therefore always arrived after the timer had
  // expired. Reading the top of band promptly puts the stop inside the minimum: at the daylight
  // 0.25 kPa/min a run started at the 0.90 floor crosses to 1.10 in ~48s, and holding it to 120s
  // releases the fan at 1.23 — past the rail the short window exists to defend.
  it('does not hold out the minimum on before stopping at the top of band', () => {
    const d = decideClimate(
      input({ airVpd: 1.15, exhaust: { on: true, lastChangeMs: NOW - 30_000 } })
    );
    expect(d).toMatchObject({ kind: 'exhaust', on: false });
  });

  it('still serves the minimum on for a stop that is not defending the rail', () => {
    // The futility stop: the room has gone humid mid-run, so venting no longer helps. Nothing
    // is breached by running on a little longer, so the timer keeps its say.
    const d = decideClimate(
      input({
        airVpd: 0.95,
        exhaust: { on: true, lastChangeMs: NOW - 30_000 },
        room: { tempC: 24, rhPct: 95 }
      })
    );
    expect(d.kind).toBe('hold');
    expect(d.reason).toContain('minimum on');
  });

  it('lets the hard ceiling override the minimum on', () => {
    const d = decideClimate(
      input({ airVpd: AIR_VPD_HARD_MAX, exhaust: { on: true, lastChangeMs: NOW - 30_000 } })
    );
    expect(d).toMatchObject({ kind: 'exhaust', on: false });
    expect(d.reason).toContain('override beats the minimum');
  });

  it('does not serve a minimum it never observed the start of', () => {
    // Cold start: lastChangeMs null must not stall the first decision.
    const d = decideClimate(input({ airVpd: 0.5, exhaust: { lastChangeMs: null } }));
    expect(d).toMatchObject({ kind: 'exhaust', on: true });
  });
});

describe('decideClimate — guards that must work in both directions', () => {
  const loopRh = { rhSource: 'loop' as const };

  it('an offline humidifier stuck retained-ON cannot block venting forever', () => {
    // The mutual-exclusion branch fires before the exhaust is even considered, so without a
    // presence check it returns "release the humidifier" every tick, publishes into the void,
    // and the tent is never vented at all.
    const d = decideClimate(
      input({ airVpd: 0.5, config: loopRh, humidifier: { present: false, on: true } })
    );
    expect(d).toMatchObject({ kind: 'exhaust', on: true });
  });

  it('stops a running fan once the room turns humid and venting stops helping', () => {
    // Tent VPD never climbs to the top of band in this state, so the ordinary release never
    // fires; without a stop leg on the gate the fan runs indefinitely at zero benefit.
    const d = decideClimate(
      input({ airVpd: 0.95, exhaust: { on: true }, room: { tempC: 24, rhPct: 95 } })
    );
    expect(d).toMatchObject({ kind: 'exhaust', on: false });
    expect(d.reason).toContain('no longer helping');
  });

  it('keeps venting while the room is still drier, with a dead zone against chatter', () => {
    // Start needs +minGain, stop needs −minGain, so the two cannot trade an edge.
    const d = decideClimate(input({ airVpd: 0.95, exhaust: { on: true } }));
    expect(d.kind).toBe('hold');
  });

  it('does not futility-stop merely because the tent has converged on the prediction', () => {
    // A room whose vented equilibrium lands inside the band, so nothing else forces a stop and
    // only the gate is under test. Converging is the goal, not futility.
    const room = { tempC: 24, rhPct: 79.8 };
    const vented = ventedAirVpdKpa(room, true);
    expect(vented).toBeGreaterThan(BAND.low);
    expect(vented).toBeLessThan(BAND.high);
    expect(decideClimate(input({ airVpd: vented, exhaust: { on: true }, room })).kind).toBe('hold');
  });

  it('skips both halves of the gate with no room reference', () => {
    expect(decideClimate(input({ airVpd: 0.95, exhaust: { on: true }, room: null })).kind).toBe(
      'hold'
    );
  });
});

describe('decideClimate — permission is applied once, for every leg', () => {
  const week6 = controlBand(1.1, 0.1);

  // The old worry here was that weeks 6-10 clamp band.high to exactly 1.20, so keying urgency
  // off `vpd >= HARD_MAX` voided the minimum on for half the grow. It is now voided for a
  // band-top stop in every week by design, so the question becomes whether that permits a
  // one-tick run — and it does not: starting needs BOTH windows under band.low, which cannot
  // be true on the tick before one reads band.high.
  it('releases at the top of band in the weeks where the band reaches the rail', () => {
    expect(week6.high).toBe(AIR_VPD_HARD_MAX);
    const d = decideClimate({
      ...input({ airVpd: 1.2, exhaust: { on: true, lastChangeMs: NOW - 30_000 } }),
      band: week6
    });
    expect(d).toMatchObject({ kind: 'exhaust', on: false });
  });

  it('cannot start and stop within one tick, which is what the minimum on protected', () => {
    // A start demands both windows below 0.90 and a stop demands the fast one at or above the
    // band top, so no single reading can satisfy both and no pair of adjacent ticks can either
    // without the tent crossing the whole band in one tick.
    const started = decideClimate(
      input({ airVpd: 0.89, airVpdFast: 0.89, exhaust: { on: false } })
    );
    expect(started).toMatchObject({ kind: 'exhaust', on: true });
    const next = decideClimate(
      input({ airVpd: 0.89, airVpdFast: 0.89, exhaust: { on: true, lastChangeMs: NOW } })
    );
    expect(next.kind).toBe('hold');
  });

  it('still overrides the minimum once VPD is past the band top as well', () => {
    const d = decideClimate({
      ...input({ airVpd: 1.25, exhaust: { on: true, lastChangeMs: NOW - 30_000 } }),
      band: week6
    });
    expect(d).toMatchObject({ kind: 'exhaust', on: false });
  });

  it('delegates a humidifier RELEASE, not just an engage', () => {
    // The release leg used to be gated on ownership and emit nothing, so over-humidification
    // was invisible in the very dry run meant to surface it.
    const d = decideClimate(
      input({
        airVpd: 0.95,
        config: { rhSource: 'external' },
        humidifier: { present: true, on: true }
      })
    );
    expect(d).toMatchObject({ kind: 'delegated', want: 'humidify', on: false });
  });

  it('reports ownership ahead of a minimum it could never have served', () => {
    // firmware flips the relay, so noteRelays stamps a transition; the loop must still say it
    // wanted the fan off rather than hiding behind a min-on that does not apply to it.
    const d = decideClimate(
      input({
        airVpd: 1.15,
        exhaust: { on: true, lastChangeMs: NOW - 30_000 },
        config: { exhaustSource: 'firmware' }
      })
    );
    expect(d).toMatchObject({ kind: 'delegated', want: 'exhaust', on: false });
  });

  it('reports ownership ahead of the minimum off on the start leg too', () => {
    const d = decideClimate(
      input({
        airVpd: 0.5,
        exhaust: { lastChangeMs: NOW - 30_000 },
        config: { exhaustSource: 'firmware' }
      })
    );
    expect(d).toMatchObject({ kind: 'delegated', want: 'exhaust', on: true });
  });
});

describe('decideClimate — predictive gate', () => {
  it('refuses to start when venting predicts no meaningful gain', () => {
    // A room barely drier than the tent: the fan would achieve nothing.
    const d = decideClimate(input({ airVpd: 0.85, room: { tempC: 22, rhPct: 92 } }));
    expect(d).toMatchObject({ kind: 'blocked', want: 'exhaust' });
    expect(d.reason).toContain('venting predicts');
  });

  it('starts when venting predicts a real gain', () => {
    const d = decideClimate(input({ airVpd: 0.85, room: { tempC: 24, rhPct: 45 } }));
    expect(d).toMatchObject({ kind: 'exhaust', on: true });
  });

  it('SKIPS the gate rather than blocking when the room reference is missing', () => {
    // The feather going offline must degrade to unguarded venting, never to paralysis.
    const d = decideClimate(input({ airVpd: 0.5, room: null }));
    expect(d).toMatchObject({ kind: 'exhaust', on: true });
  });

  it('bypasses the gate on a heat override', () => {
    // A humid room cannot veto venting a 33 °C tent: that decision is about temperature.
    const d = decideClimate(input({ airVpd: 1.0, tentTempC: 33, room: { tempC: 30, rhPct: 95 } }));
    expect(d).toMatchObject({ kind: 'exhaust', on: true });
    expect(d.reason).toContain('vent limit');
  });

  it('still stops that heat vent if it drags VPD down to the hard floor', () => {
    // The gate the heat leg skips is about the band; the rails are not skippable.
    const d = decideClimate(
      input({
        airVpd: AIR_VPD_HARD_MIN,
        tentTempC: 33,
        room: { tempC: 30, rhPct: 95 },
        exhaust: { on: true }
      })
    );
    expect(d).toMatchObject({ kind: 'exhaust', on: false });
    expect(d.reason).toContain('hard floor');
  });

  it('does not restart that vent into the same room once the minimum off expires', () => {
    // The stop above is urgent and `<= band.target` is true of every value under the floor, so
    // without a floor on the start leg the two make a limit cycle at the minimum off's cadence,
    // each run pushing VPD further under the rail. Below the floor the predictive gate decides.
    const d = decideClimate(
      input({
        airVpd: AIR_VPD_HARD_MIN,
        tentTempC: 33,
        room: { tempC: 20, rhPct: 99 },
        exhaust: { lastChangeMs: NOW - 400_000 }
      })
    );
    expect(d).toMatchObject({ kind: 'blocked', want: 'exhaust' });
  });

  it('still starts a hot tent below the floor into a room that would actually raise VPD', () => {
    const d = decideClimate(
      input({ airVpd: 0.75, tentTempC: 33, exhaust: { lastChangeMs: NOW - 400_000 } })
    );
    expect(d).toMatchObject({ kind: 'exhaust', on: true });
  });
});

describe('decideClimate — temperature limits', () => {
  it('vents on temperature even with VPD inside the band', () => {
    const d = decideClimate(input({ airVpd: 1.0, tentTempC: 31.5 }));
    expect(d).toMatchObject({ kind: 'exhaust', on: true });
  });

  // The reason the heat limit stopped being an override: this tent sits at 31 °C under the lamp
  // and the room is drier in absolute terms, so an unconditional vent walked VPD to 1.5 and held
  // it there. Cooling that cannot be won is now conceded instead.
  it('STOPS a heat vent at the hard ceiling rather than venting on', () => {
    const d = decideClimate(
      input({ airVpd: AIR_VPD_HARD_MAX, tentTempC: 31, exhaust: { on: true } })
    );
    expect(d).toMatchObject({ kind: 'exhaust', on: false });
    expect(d.reason).toContain('hard ceiling');
  });

  it('keeps a heat vent running while VPD is still under the ceiling', () => {
    // The band's top no longer stops it: heat is worth the soft band, just not the rail.
    const d = decideClimate(input({ airVpd: 1.15, tentTempC: 31, exhaust: { on: true } }));
    expect(d.kind).toBe('hold');
    expect(d.reason).toContain('hard ceiling');
  });

  it('refuses to START a heat vent with VPD already above the week target', () => {
    const d = decideClimate(input({ airVpd: 1.1, tentTempC: 31 }));
    expect(d.kind).toBe('hold');
    expect(d.reason).toContain('trade VPD for °C');
  });

  it('starts a heat vent once VPD has fallen back to the target', () => {
    const d = decideClimate(input({ airVpd: BAND.target, tentTempC: 31 }));
    expect(d).toMatchObject({ kind: 'exhaust', on: true });
    expect(d.reason).toContain('vent limit');
  });

  it('takes both windows before starting a heat vent, like every other start', () => {
    const d = decideClimate(input({ airVpd: 0.95, airVpdFast: 1.15, tentTempC: 31 }));
    expect(d.kind).toBe('hold');
  });

  it('hands a hot tent at the ceiling to the humidifier instead of the fan', () => {
    // The corrective actuator for VPD above the rail was unreachable while the fan held the
    // override: decideClimate only considers the humidifier when the fan is idle.
    const d = decideClimate(
      input({
        airVpd: AIR_VPD_HARD_MAX,
        tentTempC: 31,
        config: { rhSource: 'loop' },
        humidifier: { present: true }
      })
    );
    expect(d).toMatchObject({ kind: 'humidify', on: true });
  });

  it('blocks venting below the cold floor', () => {
    const d = decideClimate(input({ airVpd: 0.5, tentTempC: 19 }));
    expect(d).toMatchObject({ kind: 'blocked', want: 'exhaust' });
    expect(d.reason).toContain('°C floor');
  });

  // The cold branch takes both windows for the same reason the mainline start does: on the tick
  // after a vent stop the median is under the floor while the short window is not, and a start
  // that would never be attempted must not be reported as blocked.
  it('raises no cold block for a start the fast window would have refused anyway', () => {
    const d = decideClimate(input({ airVpd: 0.88, airVpdFast: 1.05, tentTempC: 19 }));
    expect(d.kind).toBe('hold');
  });

  it('STOPS a running fan once the tent falls below the cold floor', () => {
    // Cold protection needs a stop leg: on a cold wet night humid room air never carries tent
    // VPD past the top of band, so the ordinary release condition never fires.
    const d = decideClimate(input({ airVpd: 0.5, tentTempC: 19, exhaust: { on: true } }));
    expect(d).toMatchObject({ kind: 'exhaust', on: false });
    expect(d.reason).toContain('regardless of VPD');
  });

  it('reports a cold-stop it cannot perform as delegated rather than acting', () => {
    const d = decideClimate(
      input({
        airVpd: 0.5,
        tentTempC: 19,
        exhaust: { on: true },
        config: { exhaustSource: 'firmware' }
      })
    );
    expect(d).toMatchObject({ kind: 'delegated', want: 'exhaust', on: false });
  });

  it('serves the minimum off before restarting a heat vent', () => {
    // Not the mirror of the hard-ceiling stop, deliberately. A heat vent now ENDS on a VPD rail,
    // so an urgent restart would put the fan straight back on the rail it just came off; the
    // minimum off is what bounds that, and the tent is over the limit either way.
    const d = decideClimate(
      input({ airVpd: 1.0, tentTempC: 33, exhaust: { lastChangeMs: NOW - 30_000 } })
    );
    expect(d.kind).toBe('hold');
    expect(d.reason).toContain('minimum off');
  });

  it('still serves the minimum off for an ordinary VPD-driven start', () => {
    const d = decideClimate(input({ airVpd: 0.5, exhaust: { lastChangeMs: NOW - 30_000 } }));
    expect(d.kind).toBe('hold');
    expect(d.reason).toContain('minimum off');
  });

  it('tolerates a missing tent temperature without tripping either limit', () => {
    // airVpd can still be present from a prior smoothed sample; neither limit may fire blind.
    const d = decideClimate(input({ airVpd: 0.5, tentTempC: null }));
    expect(d).toMatchObject({ kind: 'exhaust', on: true });
  });
});

describe('decideClimate — ownership', () => {
  it('reports a wanted start as delegated when firmware owns the fan', () => {
    const d = decideClimate(input({ airVpd: 0.5, config: { exhaustSource: 'firmware' } }));
    expect(d).toMatchObject({ kind: 'delegated', want: 'exhaust' });
    expect(d.reason).toContain('owned by firmware');
  });

  it('delegates a wanted STOP with its direction — the over-venting case a dry run exists for', () => {
    // Reporting this as a plain hold rendered the one failure the loop was built to observe in
    // the muted style, indistinguishable from an ordinary in-band tick.
    const d = decideClimate(
      input({ airVpd: 1.15, exhaust: { on: true }, config: { exhaustSource: 'firmware' } })
    );
    expect(d).toMatchObject({ kind: 'delegated', want: 'exhaust', on: false });
    expect(d.reason).toContain('owned by firmware');
  });

  it('cannot own the relay while a firmware arm still drives it', () => {
    // The loop refuses rather than disarming: it cannot restore persistent device state it did
    // not set, and every path that stops it running would leave the tent unsupervised.
    const d = decideClimate(input({ airVpd: 0.5, armsOn: ['fan_cycle'] }));
    expect(d).toMatchObject({ kind: 'blocked', want: 'exhaust', on: true });
    expect(d.reason).toContain('fan_cycle still drives the relay');
  });

  it('names every arm that is contending', () => {
    const d = decideClimate(input({ airVpd: 0.5, armsOn: ['fan_cycle', 'fan_schedule'] }));
    expect(d.reason).toContain('fan_cycle and fan_schedule');
  });

  it('reports contention only when it would otherwise have acted', () => {
    // Inside the band there is no transition, so an armed cycle is not news.
    expect(decideClimate(input({ airVpd: 1.0, armsOn: ['fan_cycle'] })).kind).toBe('hold');
  });

  it('says delegated, not blocked, when firmware legitimately owns the fan', () => {
    const d = decideClimate(
      input({ airVpd: 0.5, armsOn: ['fan_cycle'], config: { exhaustSource: 'firmware' } })
    );
    expect(d).toMatchObject({ kind: 'delegated', want: 'exhaust', on: true });
  });
});

describe('decideClimate — humidifier', () => {
  const loopRh = { rhSource: 'loop' as const };

  it('does not engage inside the band or merely above it', () => {
    for (const vpd of [1.0, 1.15, 1.19]) {
      const d = decideClimate(
        input({ airVpd: vpd, config: loopRh, humidifier: { present: true } })
      );
      expect(d.kind).not.toBe('humidify');
    }
  });

  it('engages at the hard ceiling', () => {
    const d = decideClimate(input({ airVpd: 1.2, config: loopRh, humidifier: { present: true } }));
    expect(d).toMatchObject({ kind: 'humidify', on: true });
  });

  // Starting is the committing move, so it takes both windows — the fast one catching up after
  // a vent stop is precisely the transient the median is there to reject, and engaging on it
  // would set the humidifier against the exhaust.
  it('does not engage on the post-vent transient alone', () => {
    const d = decideClimate(
      input({ airVpd: 1.08, airVpdFast: 1.25, config: loopRh, humidifier: { present: true } })
    );
    expect(d.kind).toBe('hold');
  });

  it('releases on the fast reading, so it does not overshoot the target downward', () => {
    const d = decideClimate(
      input({
        airVpd: 1.15,
        airVpdFast: 0.99,
        config: loopRh,
        humidifier: { present: true, on: true }
      })
    );
    expect(d).toMatchObject({ kind: 'humidify', on: false });
  });

  it('releases back at the target, not at the floor — no shared edge with the exhaust', () => {
    const on = { present: true, on: true };
    expect(decideClimate(input({ airVpd: 1.05, config: loopRh, humidifier: on })).kind).toBe(
      'hold'
    );
    expect(decideClimate(input({ airVpd: 1.0, config: loopRh, humidifier: on }))).toMatchObject({
      kind: 'humidify',
      on: false
    });
  });

  it('keeps engage and release apart even when the band clamps to the hard ceiling', () => {
    // Grow weeks 6-10: target 1.10/1.15 with a 0.10 deadband puts band.high at exactly 1.20.
    // Releasing there would put both thresholds on one reading and cycle a mains humidifier
    // every tick, so the release point is the target.
    const week6 = controlBand(1.1, 0.1);
    expect(week6.high).toBe(AIR_VPD_HARD_MAX);

    const at = (airVpd: number, on: boolean) =>
      decideClimate({
        ...input({ airVpd, config: loopRh, humidifier: { present: true, on } }),
        band: week6
      });

    expect(at(1.2, false)).toMatchObject({ kind: 'humidify', on: true });
    expect(at(1.2, true).kind).toBe('hold');
    expect(at(1.15, true).kind).toBe('hold');
    expect(at(1.1, true)).toMatchObject({ kind: 'humidify', on: false });
  });

  it('keeps engage and release apart even when an override sits ON the hard ceiling', () => {
    // controlBand clamps any target to the ceiling, so band.target can equal AIR_VPD_HARD_MAX
    // and collapse onto the engage point.
    const atCeiling = controlBand(AIR_VPD_HARD_MAX, 0.1);
    expect(atCeiling.target).toBe(AIR_VPD_HARD_MAX);

    const at = (airVpd: number, on: boolean) =>
      decideClimate({
        ...input({ airVpd, config: loopRh, humidifier: { present: true, on } }),
        band: atCeiling
      });

    expect(at(1.2, false)).toMatchObject({ kind: 'humidify', on: true });
    // Still on at the engage point, so the two thresholds are genuinely separated.
    expect(at(1.2, true).kind).toBe('hold');
    expect(at(1.15, true)).toMatchObject({ kind: 'humidify', on: false });
  });

  it('serves min-off before re-engaging and min-on before releasing', () => {
    const engage = decideClimate(
      input({
        airVpd: 1.3,
        config: loopRh,
        humidifier: { present: true, lastChangeMs: NOW - 60_000 }
      })
    );
    expect(engage.kind).toBe('hold');
    expect(engage.reason).toContain('minimum off');

    const release = decideClimate(
      input({
        airVpd: 0.95,
        config: loopRh,
        humidifier: { present: true, on: true, lastChangeMs: NOW - 30_000 }
      })
    );
    expect(release.kind).toBe('hold');
    expect(release.reason).toContain('minimum on');
  });

  it('releases a running humidifier before venting, so the two never fight', () => {
    // Unreachable in sequential operation, but a restart or a hand-flipped plug lands here,
    // and neither band would escape a state where both are running against each other.
    const d = decideClimate(
      input({ airVpd: 0.5, config: loopRh, humidifier: { present: true, on: true } })
    );
    expect(d).toMatchObject({ kind: 'humidify', on: false });
    expect(d.reason).toContain('releasing the humidifier');
  });

  it('leaves an externally-owned humidifier alone rather than reaching for a relay it lacks', () => {
    const d = decideClimate(input({ airVpd: 0.5, humidifier: { present: true, on: true } }));
    expect(d).toMatchObject({ kind: 'exhaust', on: true });
  });

  it('still releases the humidifier when the exhaust plug is missing entirely', () => {
    const d = decideClimate(
      input({
        airVpd: 0.5,
        config: loopRh,
        exhaust: { present: false },
        humidifier: { present: true, on: true }
      })
    );
    expect(d).toMatchObject({ kind: 'humidify', on: false });
  });

  it('will not command OFF a humidifier plug that is not discovered', () => {
    const d = decideClimate(
      input({ airVpd: 0.95, config: loopRh, humidifier: { present: false, on: true } })
    );
    expect(d).toMatchObject({ kind: 'blocked', want: 'humidify', on: false });
  });

  it('delegates when a humidistat owns RH', () => {
    const d = decideClimate(
      input({ airVpd: 1.3, config: { rhSource: 'external' }, humidifier: { present: true } })
    );
    expect(d).toMatchObject({ kind: 'delegated', want: 'humidify' });
  });

  it('blocks when the loop owns RH but no plug exists', () => {
    const d = decideClimate(input({ airVpd: 1.3, config: loopRh, humidifier: { present: false } }));
    expect(d).toMatchObject({ kind: 'blocked', want: 'humidify', on: true });
    expect(d.reason).toContain('humidifier plug is not discovered');
  });
});

describe('controlBand', () => {
  it('clamps into the book’s hard rails', () => {
    // The fade weeks sit at 1.15, so the upper half of a 0.10 deadband would exceed 1.2.
    expect(controlBand(1.15, 0.1)).toEqual({ target: 1.15, low: 1.05, high: AIR_VPD_HARD_MAX });
    expect(controlBand(0.85, 0.1)).toEqual({ target: 0.85, low: AIR_VPD_HARD_MIN, high: 0.95 });
  });

  it('leaves an interior target alone', () => {
    expect(controlBand(1.0, 0.1)).toEqual({ target: 1.0, low: 0.9, high: 1.1 });
  });

  it('clamps the TARGET, so an out-of-rail override cannot invert the band', () => {
    // Clamping only the edges gives low 1.4 / high 1.2 for a 1.5 target, and `vpd < low` is
    // then true at every reachable reading — the fan would be demanded on and never released.
    const band = controlBand(1.5, 0.1);
    expect(band.low).toBeLessThanOrEqual(band.high);
    expect(band).toEqual({ target: AIR_VPD_HARD_MAX, low: 1.1, high: AIR_VPD_HARD_MAX });

    const low = controlBand(0.2, 0.1);
    expect(low.low).toBeLessThanOrEqual(low.high);
    expect(low).toEqual({ target: AIR_VPD_HARD_MIN, low: AIR_VPD_HARD_MIN, high: 0.9 });
  });

  it('never inverts across the whole permitted override range', () => {
    for (let target = 0.4; target <= 2.0001; target += 0.05) {
      for (const deadband of [0.01, 0.1, 0.4]) {
        const band = controlBand(target, deadband);
        expect(band.low).toBeLessThanOrEqual(band.high);
      }
    }
  });
});
