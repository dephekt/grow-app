// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { describe, expect, it } from 'vitest';
import { decideClimate, type ActuatorState, type ClimateDecisionInput } from '../../src/lib/climate/decide';
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
  return {
    nowMs: over.nowMs ?? NOW,
    // Armed by default: the guards under test are the interesting part, not the arming gate.
    config: { ...DEFAULT_CLIMATE_CONFIG, mode: 'active', exhaustSource: 'loop', ...over.config },
    band: BAND,
    reading: {
      tent: tentTempC === null ? null : { tempC: tentTempC, rhPct: 65 },
      room: over.room === undefined ? DRY_ROOM : over.room,
      airVpd: over.airVpd === undefined ? 1.0 : over.airVpd,
      leafVpd: null,
      lightsOn: over.lightsOn ?? true
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

  it('holds when the exhaust plug is not discovered', () => {
    const d = decideClimate(input({ airVpd: 0.5, exhaust: { present: false } }));
    expect(d.action.kind).toBe('hold');
    expect(d.action.reason).toContain('not discovered');
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
    // 0.89 -> 0.95 -> 1.05 all hold ON; only 1.11 releases. That traversal requirement is
    // what makes a backoff timer unnecessary.
    for (const vpd of [0.89, 0.95, 1.05, 1.1]) {
      expect(decideClimate(input({ airVpd: vpd, exhaust: { on: true } })).action.kind).toBe('hold');
    }
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

  it('holds rather than delegating a wanted stop — turning off what it does not own is a no-op', () => {
    const d = decideClimate(
      input({ airVpd: 1.15, exhaust: { on: true }, config: { exhaustSource: 'firmware' } })
    );
    expect(d.action.kind).toBe('hold');
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

  it('releases back at the top of band, not at the floor — no shared edge with the exhaust', () => {
    const on = { present: true, on: true };
    expect(decideClimate(input({ airVpd: 1.15, config: loopRh, humidifier: on })).action.kind).toBe('hold');
    expect(decideClimate(input({ airVpd: 1.1, config: loopRh, humidifier: on })).action).toMatchObject({
      kind: 'humidify',
      on: false
    });
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
});
