// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/**
 * The control law. Pure and fully injected — no clock, no snapshot, no I/O — so every guard
 * and every `mode × exhaustSource × rhSource` combination is directly testable, and the
 * /climate page can render the same verdict the loop acted on.
 */
import { ventedAirVpdKpa, type AirState } from './psychro';
import {
  AIR_VPD_HARD_MAX,
  type ActuatorSource,
  type ClimateConfig,
  type ControlBand
} from './model';

export interface ClimateReading {
  tent: AirState | null;
  room: AirState | null;
  /** Smoothed air VPD, the control input. Null whenever the tent sensor cannot be trusted. */
  airVpd: number | null;
  /** Leaf VPD — recorded beside every decision, never an input to one. */
  leafVpd: number | null;
  lightsOn: boolean;
}

export interface ActuatorState {
  /** Whether the plug is discovered at all; an undiscovered relay cannot be commanded. */
  present: boolean;
  on: boolean;
  /** When the relay was last seen to change, for the min-on/min-off timers. Null on a cold
   *  start, which deliberately lets the first action through rather than stalling a tick. */
  lastChangeMs: number | null;
}

export interface ClimateDecisionInput {
  nowMs: number;
  config: ClimateConfig;
  band: ControlBand;
  reading: ClimateReading;
  exhaust: ActuatorState;
  humidifier: ActuatorState;
  /** Firmware arms currently on that would re-assert the relay under the loop. */
  armsOn: string[];
}

export type ClimateAction =
  | { kind: 'hold'; reason: string }
  | { kind: 'exhaust'; on: boolean; reason: string }
  | { kind: 'humidify'; on: boolean; reason: string }
  | { kind: 'delegated'; want: 'exhaust' | 'humidify'; reason: string }
  | { kind: 'blocked'; want: 'exhaust' | 'humidify'; reason: string };

export interface ClimateDecision {
  action: ClimateAction;
  /** Firmware arm objectIds to publish OFF this tick. */
  reconcileArms: string[];
}

const kpa = (n: number) => n.toFixed(2);
const degC = (n: number) => n.toFixed(1);

/** Minimum gap the humidifier's release point keeps below its engage point, whatever the band
 *  and override conspire to produce. Below this the two collapse onto one reading and the
 *  hysteresis stops existing. */
export const HUMIDIFIER_MIN_SEPARATION_KPA = 0.05;

/** Milliseconds since the relay last moved, or null when that has never been observed. */
function elapsedSince(lastChangeMs: number | null, nowMs: number): number | null {
  return lastChangeMs === null ? null : Math.max(0, nowMs - lastChangeMs);
}

function ownedByLoop(source: ActuatorSource): boolean {
  return source === 'loop';
}

export function decideClimate(input: ClimateDecisionInput): ClimateDecision {
  const { nowMs, config, band, reading, exhaust, humidifier, armsOn } = input;

  // Reconciled on every tick the loop owns the relay, including 'hold' ticks — an armed
  // firmware cycle moves the relay whether or not the loop wanted anything this pass.
  const reconcileArms = ownedByLoop(config.exhaustSource) && config.mode === 'active' ? [...armsOn] : [];
  const decide = (action: ClimateAction): ClimateDecision => ({ action, reconcileArms });
  const hold = (reason: string) => decide({ kind: 'hold', reason });

  if (config.mode === 'off') return { action: { kind: 'hold', reason: 'loop is off' }, reconcileArms: [] };
  // Blind, so hand the fan BACK to its firmware rather than holding a relay we cannot judge.
  // Reconciling the arms here would disarm the plug's own cycle while the loop itself refuses
  // to command anything, leaving a tent with a dead air sensor unventilated all night.
  if (reading.airVpd === null) {
    return { action: { kind: 'hold', reason: 'no tent air reading — failing safe' }, reconcileArms: [] };
  }

  const vpd = reading.airVpd;
  const tentC = reading.tent?.tempC ?? null;
  const tooHot = tentC !== null && tentC >= config.ventAlwaysAboveC;
  const tooCold = tentC !== null && tentC <= config.ventNeverBelowC;

  // Cold protection needs a stop leg, not just a start block: humid room air never carries tent
  // VPD past the top of band, so on a cold wet night the ordinary release condition never fires
  // and a running fan would track the tent down past the floor unopposed.
  if (tooCold && exhaust.on) {
    const reason = `tent ${degC(tentC!)} °C at or below the ${degC(config.ventNeverBelowC)} °C floor — stopping regardless of VPD`;
    if (!ownedByLoop(config.exhaustSource)) return hold(`${reason}; exhaust is owned by ${config.exhaustSource}`);
    return decide({ kind: 'exhaust', on: false, reason });
  }

  // Hysteresis: on below the floor, off above the ceiling, hold everywhere in between. The
  // asymmetry is what makes the band self-debouncing.
  let wantExhaust: boolean;
  let why: string;
  if (tooHot) {
    wantExhaust = true;
    why = `tent ${degC(tentC!)} °C at or above the ${degC(config.ventAlwaysAboveC)} °C vent limit`;
  } else if (exhaust.on) {
    wantExhaust = vpd <= band.high;
    why = wantExhaust
      ? `air VPD ${kpa(vpd)} still below the ${kpa(band.high)} top of band`
      : `air VPD ${kpa(vpd)} cleared the ${kpa(band.high)} top of band`;
  } else {
    wantExhaust = vpd < band.low;
    // Three cases, not two: with the fan already off, "not below the floor" covers both inside
    // the band and above it. Collapsing them would have the log and the /climate verdict row
    // assert the tent is in band while it sits over the ceiling.
    if (wantExhaust) why = `air VPD ${kpa(vpd)} below the ${kpa(band.low)} floor of band`;
    else if (vpd > band.high) why = `air VPD ${kpa(vpd)} above the ${kpa(band.high)} top of band`;
    else why = `air VPD ${kpa(vpd)} inside the ${kpa(band.low)}–${kpa(band.high)} band`;
  }

  // Mutual exclusion, checked before anything else. Sequential operation cannot reach this —
  // VPD has to fall past the humidifier's release point to reach the exhaust's start point —
  // but a restart or a hand-flipped plug can, and two opposed actuators running against each
  // other is the one state neither hysteresis band would ever escape.
  if (wantExhaust && humidifier.on && ownedByLoop(config.rhSource)) {
    return decide({ kind: 'humidify', on: false, reason: `${why}; releasing the humidifier first` });
  }

  if (wantExhaust && !exhaust.on) {
    if (!exhaust.present) return hold(`${why}, but the exhaust plug is not discovered`);

    if (tooCold) {
      return decide({
        kind: 'blocked',
        want: 'exhaust',
        reason: `${why}, but tent ${degC(tentC!)} °C is at or below the ${degC(config.ventNeverBelowC)} °C floor`
      });
    }

    // Heat outranks the minimum off for the same reason the hard VPD ceiling outranks the
    // minimum on: an over-temperature tent must not sit and wait out an anti-chatter timer.
    const idleMs = elapsedSince(exhaust.lastChangeMs, nowMs);
    if (!tooHot && idleMs !== null && idleMs < config.minOffSeconds * 1000) {
      return hold(`${why}, waiting out the ${config.minOffSeconds}s minimum off`);
    }

    // Predictive gate, start-only: a heat override is about temperature, not humidity, so it
    // bypasses this. A missing room reference SKIPS the gate rather than blocking — the loop
    // must degrade to unguarded venting, not to paralysis.
    if (!tooHot && reading.room) {
      const predicted = ventedAirVpdKpa(reading.room, reading.lightsOn);
      if (predicted < vpd + config.minGainKpa) {
        return decide({
          kind: 'blocked',
          want: 'exhaust',
          reason: `${why}, but venting predicts only ${kpa(predicted)} against the ${kpa(vpd + config.minGainKpa)} needed`
        });
      }
    }

    if (!ownedByLoop(config.exhaustSource)) {
      return decide({ kind: 'delegated', want: 'exhaust', reason: `${why}; exhaust is owned by ${config.exhaustSource}` });
    }
    return decide({ kind: 'exhaust', on: true, reason: why });
  }

  if (!wantExhaust && exhaust.on) {
    // Guarded like the start leg: a plug that published its offline LWT still shows its last
    // retained relay position, and commanding one we have already judged uncommandable buys a
    // wasted publish and a log row claiming an action that never left the broker.
    if (!exhaust.present) return hold(`${why}, but the exhaust plug is not discovered`);
    const runMs = elapsedSince(exhaust.lastChangeMs, nowMs);
    const withinMinOn = runMs !== null && runMs < config.minOnSeconds * 1000;
    // The book's hard ceiling outranks the minimum on-time; a stuck-on fan is the failure the
    // minimum was never meant to protect.
    const ceilingBreach = vpd >= AIR_VPD_HARD_MAX;
    if (withinMinOn && !ceilingBreach) {
      return hold(`${why}, holding out the ${config.minOnSeconds}s minimum on`);
    }
    if (!ownedByLoop(config.exhaustSource)) {
      return hold(`${why}; exhaust is owned by ${config.exhaustSource}`);
    }
    const suffix = withinMinOn ? ' — hard ceiling overrides the minimum on' : '';
    return decide({ kind: 'exhaust', on: false, reason: `${why}${suffix}` });
  }

  // Humidifier: on at the hard ceiling, off back at the week's target. Releasing at the top of
  // band would not work — from grow week 6 on `band.high` clamps to exactly AIR_VPD_HARD_MAX,
  // putting both thresholds on one reading and cycling a mains humidifier every tick. The
  // separation floor covers the remaining case the target alone does not: `airVpdOverride` is
  // free to sit AT the ceiling, which collapses `band.target` onto it too.
  if (!wantExhaust) {
    const release = Math.min(band.target, AIR_VPD_HARD_MAX - HUMIDIFIER_MIN_SEPARATION_KPA);
    const wantHumidify = humidifier.on ? vpd > release : vpd >= AIR_VPD_HARD_MAX;

    if (wantHumidify && !humidifier.on) {
      const reason = `air VPD ${kpa(vpd)} at or above the ${kpa(AIR_VPD_HARD_MAX)} hard ceiling`;
      if (!ownedByLoop(config.rhSource)) {
        return decide({ kind: 'delegated', want: 'humidify', reason: `${reason}; RH is owned by ${config.rhSource}` });
      }
      if (!humidifier.present) {
        return decide({ kind: 'blocked', want: 'humidify', reason: `${reason}, but no humidifier plug is discovered` });
      }
      const idleMs = elapsedSince(humidifier.lastChangeMs, nowMs);
      if (idleMs !== null && idleMs < config.minOffSeconds * 1000) {
        return hold(`${reason}, waiting out the ${config.minOffSeconds}s minimum off`);
      }
      return decide({ kind: 'humidify', on: true, reason });
    }

    if (!wantHumidify && humidifier.on && ownedByLoop(config.rhSource)) {
      if (!humidifier.present) return hold(`air VPD ${kpa(vpd)} back below ${kpa(release)}, but the humidifier plug is not discovered`);
      const reason = `air VPD ${kpa(vpd)} back below the ${kpa(release)} release point`;
      const runMs = elapsedSince(humidifier.lastChangeMs, nowMs);
      if (runMs !== null && runMs < config.minOnSeconds * 1000) {
        return hold(`${reason}, holding out the ${config.minOnSeconds}s minimum on`);
      }
      return decide({ kind: 'humidify', on: false, reason });
    }
  }

  return hold(why);
}
