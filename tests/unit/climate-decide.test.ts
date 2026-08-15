// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { describe, expect, it } from 'vitest';
import { decideClimate, type ActuatorState, type ClimateDecisionInput } from '../../src/lib/climate/decide';
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
  tentTempC?: number | null;
  room?: { tempC: number; rhPct: number } | null;
  exhaust?: Partial<ActuatorState>;
  humidifier?: Partial<ActuatorState>;
  armsOn?: string[];
  nowMs?: number;
  lightsOn?: boolean;
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
      // Derived from `room` exactly as the loop derives it, so the gate cases stay meaningful.
      ventedAirVpd: room === null ? null : ventedAirVpdKpa(room, lightsOn),
      leafVpd: null,
      lightsOn
    },
    exhaust: actuator(over.exhaust),
    humidifier: actuator({ present: false, ...over.humidifier }),
    armsOn: over.armsOn ?? []
  };
}

describe('decideClimate — mode gate', () => {
  it('holds and reconciles nothing when the loop is off', () => {
    const d = decideClimate(input({ config: { mode: 'off' }, airVpd: 0.5, armsOn: ['fan_cycle'] }));
    expect(d.action).toEqual({ kind: 'hold', reason: 'loop is off' });
    expect(d.reconcileArms).toEqual([]);
  });

  it('still decides in observe mode — publishing is the caller’s gate, not the law’s', () => {
    const d = decideClimate(input({ config: { mode: 'observe' }, airVpd: 0.5 }));
    expect(d.action).toMatchObject({ kind: 'exhaust', on: true });
  });

  it('does not reconcile firmware arms while only observing', () => {
    const d = decideClimate(input({ config: { mode: 'observe' }, armsOn: ['fan_cycle'] }));
    expect(d.reconcileArms).toEqual([]);
  });
});

describe('decideClimate — fail-safe', () => {
  it('holds when air VPD cannot be read', () => {
    const d = decideClimate(input({ airVpd: null }));
    expect(d.action.kind).toBe('hold');
    expect(d.action.reason).toContain('failing safe');
  });

  it('hands the fan back to its firmware when blind, rather than disarming it', () => {
    // Otherwise a dead air sensor disarms the plug's own cycle while the loop refuses to
    // command anything, and the tent gets no ventilation at all.
    const d = decideClimate(input({ airVpd: null, armsOn: ['fan_cycle', 'fan_schedule'] }));
    expect(d.reconcileArms).toEqual([]);
  });

  it('holds when the exhaust plug is not discovered', () => {
    const d = decideClimate(input({ airVpd: 0.5, exhaust: { present: false } }));
    expect(d.action.kind).toBe('hold');
    expect(d.action.reason).toContain('not discovered');
  });

  it('will not command OFF a plug it has judged uncommandable either', () => {
    // An offline plug still reports its last retained relay position, so the release leg needs
    // the same presence guard the start leg has.
    const d = decideClimate(input({ airVpd: 1.15, exhaust: { present: false, on: true } }));
    expect(d.action.kind).toBe('hold');
    expect(d.action.reason).toContain('not discovered');
  });
});

describe('decideClimate — reason text', () => {
  it('distinguishes above-band from in-band when the fan is already off', () => {
    // With the fan off, "not below the floor" covers both; collapsing them would have the log
    // and the /climate verdict row claim the tent is in band while it sits over the ceiling.
    expect(decideClimate(input({ airVpd: 1.0 })).action.reason).toContain('inside the');
    expect(decideClimate(input({ airVpd: 1.19 })).action.reason).toContain('above the 1.10 top of band');
    expect(decideClimate(input({ airVpd: 0.85, room: null })).action.reason).toContain('below the 0.90 floor');
  });
});

describe('decideClimate — hysteresis', () => {
  it('starts venting below the floor of band', () => {
    expect(decideClimate(input({ airVpd: 0.89 })).action).toMatchObject({ kind: 'exhaust', on: true });
  });

  it('holds off inside the band when it is already off', () => {
    expect(decideClimate(input({ airVpd: 1.0 })).action.kind).toBe('hold');
  });

  it('holds ON inside the band when it is already on — the band is the debounce', () => {
    const d = decideClimate(input({ airVpd: 1.0, exhaust: { on: true } }));
    expect(d.action.kind).toBe('hold');
    expect(d.action.reason).toContain('still below');
  });

  it('stops venting once it clears the top of band', () => {
    const d = decideClimate(input({ airVpd: 1.11, exhaust: { on: true } }));
    expect(d.action).toMatchObject({ kind: 'exhaust', on: false });
  });

  it('cannot short-cycle: crossing the floor upward while running does not stop it', () => {
    // The whole band must be traversed before the fan can reverse, which is what makes a
    // backoff timer unnecessary.
    for (const vpd of [0.89, 0.95, 1.05, 1.09]) {
      expect(decideClimate(input({ airVpd: vpd, exhaust: { on: true } })).action.kind).toBe('hold');
    }
  });

  it('releases AT the top of band, not above it', () => {
    // From grow week 6 band.high clamps to exactly AIR_VPD_HARD_MAX; holding at that reading
    // would park the fan on the rail ceilingBreach treats as a breach.
    expect(decideClimate(input({ airVpd: 1.1, exhaust: { on: true } })).action).toMatchObject({
      kind: 'exhaust',
      on: false
    });
  });

  it('cannot short-cycle: falling back through the top of band does not restart it', () => {
    for (const vpd of [1.09, 1.0, 0.91, 0.9]) {
      expect(decideClimate(input({ airVpd: vpd, exhaust: { on: false } })).action.kind).toBe('hold');
    }
  });
});

describe('decideClimate — minimum on/off', () => {
  it('waits out the minimum off before restarting', () => {
    const d = decideClimate(input({ airVpd: 0.5, exhaust: { lastChangeMs: NOW - 60_000 } }));
    expect(d.action.kind).toBe('hold');
    expect(d.action.reason).toContain('minimum off');
  });

  it('restarts once the minimum off has elapsed', () => {
    const d = decideClimate(input({ airVpd: 0.5, exhaust: { lastChangeMs: NOW - 301_000 } }));
    expect(d.action).toMatchObject({ kind: 'exhaust', on: true });
  });

  it('holds out the minimum on before stopping', () => {
    const d = decideClimate(input({ airVpd: 1.15, exhaust: { on: true, lastChangeMs: NOW - 30_000 } }));
    expect(d.action.kind).toBe('hold');
    expect(d.action.reason).toContain('minimum on');
  });

  it('lets the hard ceiling override the minimum on', () => {
    const d = decideClimate(input({ airVpd: AIR_VPD_HARD_MAX, exhaust: { on: true, lastChangeMs: NOW - 30_000 } }));
    expect(d.action).toMatchObject({ kind: 'exhaust', on: false });
    expect(d.action.reason).toContain('hard ceiling overrides');
  });

  it('does not serve a minimum it never observed the start of', () => {
    // Cold start: lastChangeMs null must not stall the first decision.
    const d = decideClimate(input({ airVpd: 0.5, exhaust: { lastChangeMs: null } }));
    expect(d.action).toMatchObject({ kind: 'exhaust', on: true });
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
    expect(d.action).toMatchObject({ kind: 'exhaust', on: true });
  });

  it('stops a running fan once the room turns humid and venting stops helping', () => {
    // Tent VPD never climbs to the top of band in this state, so the ordinary release never
    // fires; without a stop leg on the gate the fan runs indefinitely at zero benefit.
    const d = decideClimate(input({ airVpd: 0.95, exhaust: { on: true }, room: { tempC: 24, rhPct: 95 } }));
    expect(d.action).toMatchObject({ kind: 'exhaust', on: false });
    expect(d.action.reason).toContain('no longer helping');
  });

  it('keeps venting while the room is still drier, with a dead zone against chatter', () => {
    // Start needs +minGain, stop needs −minGain, so the two cannot trade an edge.
    const d = decideClimate(input({ airVpd: 0.95, exhaust: { on: true } }));
    expect(d.action.kind).toBe('hold');
  });

  it('does not futility-stop merely because the tent has converged on the prediction', () => {
    // A room whose vented equilibrium lands inside the band, so nothing else forces a stop and
    // only the gate is under test. Converging is the goal, not futility.
    const room = { tempC: 24, rhPct: 79.8 };
    const vented = ventedAirVpdKpa(room, true);
    expect(vented).toBeGreaterThan(BAND.low);
    expect(vented).toBeLessThan(BAND.high);
    expect(decideClimate(input({ airVpd: vented, exhaust: { on: true }, room })).action.kind).toBe('hold');
  });

  it('skips both halves of the gate with no room reference', () => {
    expect(decideClimate(input({ airVpd: 0.95, exhaust: { on: true }, room: null })).action.kind).toBe('hold');
  });
});

describe('decideClimate — predictive gate', () => {
  it('refuses to start when venting predicts no meaningful gain', () => {
    // A room barely drier than the tent: the fan would achieve nothing.
    const d = decideClimate(input({ airVpd: 0.85, room: { tempC: 22, rhPct: 92 } }));
    expect(d.action).toMatchObject({ kind: 'blocked', want: 'exhaust' });
    expect(d.action.reason).toContain('venting predicts');
  });

  it('starts when venting predicts a real gain', () => {
    const d = decideClimate(input({ airVpd: 0.85, room: { tempC: 24, rhPct: 45 } }));
    expect(d.action).toMatchObject({ kind: 'exhaust', on: true });
  });

  it('SKIPS the gate rather than blocking when the room reference is missing', () => {
    // The feather going offline must degrade to unguarded venting, never to paralysis.
    const d = decideClimate(input({ airVpd: 0.5, room: null }));
    expect(d.action).toMatchObject({ kind: 'exhaust', on: true });
  });

  it('bypasses the gate on a heat override', () => {
    // A humid room cannot veto venting a 33 °C tent: that decision is about temperature.
    const d = decideClimate(input({ airVpd: 1.0, tentTempC: 33, room: { tempC: 30, rhPct: 95 } }));
    expect(d.action).toMatchObject({ kind: 'exhaust', on: true });
    expect(d.action.reason).toContain('vent limit');
  });
});

describe('decideClimate — temperature limits', () => {
  it('vents on temperature even with VPD inside the band', () => {
    const d = decideClimate(input({ airVpd: 1.0, tentTempC: 31.5 }));
    expect(d.action).toMatchObject({ kind: 'exhaust', on: true });
  });

  it('blocks venting below the cold floor', () => {
    const d = decideClimate(input({ airVpd: 0.5, tentTempC: 19 }));
    expect(d.action).toMatchObject({ kind: 'blocked', want: 'exhaust' });
    expect(d.action.reason).toContain('°C floor');
  });

  it('STOPS a running fan once the tent falls below the cold floor', () => {
    // Cold protection needs a stop leg: on a cold wet night humid room air never carries tent
    // VPD past the top of band, so the ordinary release condition never fires.
    const d = decideClimate(input({ airVpd: 0.5, tentTempC: 19, exhaust: { on: true } }));
    expect(d.action).toMatchObject({ kind: 'exhaust', on: false });
    expect(d.action.reason).toContain('regardless of VPD');
  });

  it('reports a cold-stop it cannot perform as delegated rather than acting', () => {
    const d = decideClimate(
      input({ airVpd: 0.5, tentTempC: 19, exhaust: { on: true }, config: { exhaustSource: 'firmware' } })
    );
    expect(d.action).toMatchObject({ kind: 'delegated', want: 'exhaust', on: false });
  });

  it('lets a heat override bypass the minimum off', () => {
    // The symmetric case to the hard ceiling overriding the minimum on: an over-temperature
    // tent must not sit out an anti-chatter timer.
    const d = decideClimate(input({ airVpd: 1.0, tentTempC: 33, exhaust: { lastChangeMs: NOW - 30_000 } }));
    expect(d.action).toMatchObject({ kind: 'exhaust', on: true });
  });

  it('still serves the minimum off for an ordinary VPD-driven start', () => {
    const d = decideClimate(input({ airVpd: 0.5, exhaust: { lastChangeMs: NOW - 30_000 } }));
    expect(d.action.kind).toBe('hold');
    expect(d.action.reason).toContain('minimum off');
  });

  it('tolerates a missing tent temperature without tripping either limit', () => {
    // airVpd can still be present from a prior smoothed sample; neither limit may fire blind.
    const d = decideClimate(input({ airVpd: 0.5, tentTempC: null }));
    expect(d.action).toMatchObject({ kind: 'exhaust', on: true });
  });
});

describe('decideClimate — ownership', () => {
  it('reports a wanted start as delegated when firmware owns the fan', () => {
    const d = decideClimate(input({ airVpd: 0.5, config: { exhaustSource: 'firmware' } }));
    expect(d.action).toMatchObject({ kind: 'delegated', want: 'exhaust' });
    expect(d.action.reason).toContain('owned by firmware');
  });

  it('delegates a wanted STOP with its direction — the over-venting case a dry run exists for', () => {
    // Reporting this as a plain hold rendered the one failure the loop was built to observe in
    // the muted style, indistinguishable from an ordinary in-band tick.
    const d = decideClimate(
      input({ airVpd: 1.15, exhaust: { on: true }, config: { exhaustSource: 'firmware' } })
    );
    expect(d.action).toMatchObject({ kind: 'delegated', want: 'exhaust', on: false });
    expect(d.action.reason).toContain('owned by firmware');
  });

  it('reconciles firmware arms only when armed and active', () => {
    const armsOn = ['fan_cycle', 'fan_schedule'];
    expect(decideClimate(input({ armsOn })).reconcileArms).toEqual(armsOn);
    expect(decideClimate(input({ armsOn, config: { exhaustSource: 'firmware' } })).reconcileArms).toEqual([]);
  });

  it('reconciles arms even on a hold tick — an armed cycle moves the relay regardless', () => {
    const d = decideClimate(input({ airVpd: 1.0, armsOn: ['fan_cycle'] }));
    expect(d.action.kind).toBe('hold');
    expect(d.reconcileArms).toEqual(['fan_cycle']);
  });
});

describe('decideClimate — humidifier', () => {
  const loopRh = { rhSource: 'loop' as const };

  it('does not engage inside the band or merely above it', () => {
    for (const vpd of [1.0, 1.15, 1.19]) {
      const d = decideClimate(input({ airVpd: vpd, config: loopRh, humidifier: { present: true } }));
      expect(d.action.kind).not.toBe('humidify');
    }
  });

  it('engages at the hard ceiling', () => {
    const d = decideClimate(input({ airVpd: 1.2, config: loopRh, humidifier: { present: true } }));
    expect(d.action).toMatchObject({ kind: 'humidify', on: true });
  });

  it('releases back at the target, not at the floor — no shared edge with the exhaust', () => {
    const on = { present: true, on: true };
    expect(decideClimate(input({ airVpd: 1.05, config: loopRh, humidifier: on })).action.kind).toBe('hold');
    expect(decideClimate(input({ airVpd: 1.0, config: loopRh, humidifier: on })).action).toMatchObject({
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
      }).action;

    expect(at(1.2, false)).toMatchObject({ kind: 'humidify', on: true });
    expect(at(1.2, true).kind).toBe('hold');
    expect(at(1.15, true).kind).toBe('hold');
    expect(at(1.1, true)).toMatchObject({ kind: 'humidify', on: false });
  });

  it('keeps engage and release apart even when an override sits ON the hard ceiling', () => {
    // store.ts permits airVpdOverride up to 2.0 and controlBand clamps it to the ceiling, so
    // band.target can equal AIR_VPD_HARD_MAX and collapse onto the engage point.
    const atCeiling = controlBand(AIR_VPD_HARD_MAX, 0.1);
    expect(atCeiling.target).toBe(AIR_VPD_HARD_MAX);

    const at = (airVpd: number, on: boolean) =>
      decideClimate({
        ...input({ airVpd, config: loopRh, humidifier: { present: true, on } }),
        band: atCeiling
      }).action;

    expect(at(1.2, false)).toMatchObject({ kind: 'humidify', on: true });
    // Still on at the engage point, so the two thresholds are genuinely separated.
    expect(at(1.2, true).kind).toBe('hold');
    expect(at(1.15, true)).toMatchObject({ kind: 'humidify', on: false });
  });

  it('will not command OFF a humidifier plug that is not discovered', () => {
    const d = decideClimate(input({ airVpd: 0.95, config: loopRh, humidifier: { present: false, on: true } }));
    expect(d.action.kind).toBe('hold');
    expect(d.action.reason).toContain('not discovered');
  });

  it('serves min-off before re-engaging and min-on before releasing', () => {
    const engage = decideClimate(
      input({ airVpd: 1.3, config: loopRh, humidifier: { present: true, lastChangeMs: NOW - 60_000 } })
    );
    expect(engage.action.kind).toBe('hold');
    expect(engage.action.reason).toContain('minimum off');

    const release = decideClimate(
      input({ airVpd: 0.95, config: loopRh, humidifier: { present: true, on: true, lastChangeMs: NOW - 30_000 } })
    );
    expect(release.action.kind).toBe('hold');
    expect(release.action.reason).toContain('minimum on');
  });

  it('releases a running humidifier before venting, so the two never fight', () => {
    // Unreachable in sequential operation, but a restart or a hand-flipped plug lands here,
    // and neither band would escape a state where both are running against each other.
    const d = decideClimate(input({ airVpd: 0.5, config: loopRh, humidifier: { present: true, on: true } }));
    expect(d.action).toMatchObject({ kind: 'humidify', on: false });
    expect(d.action.reason).toContain('releasing the humidifier');
  });

  it('leaves an externally-owned humidifier alone rather than reaching for a relay it lacks', () => {
    const d = decideClimate(input({ airVpd: 0.5, humidifier: { present: true, on: true } }));
    expect(d.action).toMatchObject({ kind: 'exhaust', on: true });
  });

  it('still releases the humidifier when the exhaust plug is missing entirely', () => {
    const d = decideClimate(
      input({ airVpd: 0.5, config: loopRh, exhaust: { present: false }, humidifier: { present: true, on: true } })
    );
    expect(d.action).toMatchObject({ kind: 'humidify', on: false });
  });

  it('delegates when a humidistat owns RH', () => {
    const d = decideClimate(input({ airVpd: 1.3, config: { rhSource: 'external' }, humidifier: { present: true } }));
    expect(d.action).toMatchObject({ kind: 'delegated', want: 'humidify' });
  });

  it('blocks when the loop owns RH but no plug exists', () => {
    const d = decideClimate(input({ airVpd: 1.3, config: loopRh, humidifier: { present: false } }));
    expect(d.action).toMatchObject({ kind: 'blocked', want: 'humidify' });
    expect(d.action.reason).toContain('no humidifier plug');
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
