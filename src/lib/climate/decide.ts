// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/**
 * The control law. Pure and fully injected — no clock, no snapshot, no I/O.
 *
 * Every guard is stated twice on purpose: once as a condition for starting an actuator and
 * once as a condition for stopping it. Three review rounds each found a guard that only had
 * the start half, and each of those was an indefinite-wrong-state bug rather than a wrong tick.
 */
import { AIR_VPD_HARD_MAX, type ActuatorSource, type ClimateConfig, type ControlBand } from './model';
import type { AirState } from './psychro';

export interface ClimateReading {
  tent: AirState | null;
  room: AirState | null;
  /** Smoothed air VPD, the control input. Null whenever the tent sensor cannot be trusted. */
  airVpd: number | null;
  /** Smoothed prediction of where venting would settle it; null with no room reference, which
   *  skips both halves of the futility guard rather than blocking. */
  ventedAirVpd: number | null;
  /** Recorded beside every decision, never an input to one. */
  leafVpd: number | null;
  lightsOn: boolean;
}

export interface ActuatorState {
  /** Discovered and not offline; an absent relay can be neither commanded nor believed. */
  present: boolean;
  on: boolean;
  /** When the relay was last seen to change. Null on a cold start, which lets the first action
   *  through rather than serving a minimum the loop never observed the start of. */
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

export type ClimateActuator = 'exhaust' | 'humidify';

export type ClimateAction =
  | { kind: 'hold'; reason: string }
  | { kind: 'exhaust'; on: boolean; reason: string }
  | { kind: 'humidify'; on: boolean; reason: string }
  /** Wanted, but someone else owns the actuator. Carries direction so a dry run distinguishes
   *  "wants to start venting" from "wants to stop" — over-venting is the case worth seeing. */
  | { kind: 'delegated'; want: ClimateActuator; on: boolean; reason: string }
  | { kind: 'blocked'; want: ClimateActuator; on: boolean; reason: string };

export interface ClimateDecision {
  action: ClimateAction;
  /** Firmware arm objectIds to publish OFF this tick. */
  reconcileArms: string[];
}

/** Minimum gap between the humidifier's engage and release points, whatever the band and
 *  override produce; below it the hysteresis stops existing. */
export const HUMIDIFIER_MIN_SEPARATION_KPA = 0.05;

const kpa = (n: number) => n.toFixed(2);
const degC = (n: number) => n.toFixed(1);

function elapsedSince(lastChangeMs: number | null, nowMs: number): number | null {
  return lastChangeMs === null ? null : Math.max(0, nowMs - lastChangeMs);
}

function ownedByLoop(source: ActuatorSource): boolean {
  return source === 'loop';
}

export function decideClimate(input: ClimateDecisionInput): ClimateDecision {
  const { nowMs, config, band, reading, exhaust, humidifier, armsOn } = input;

  const reconcileArms = ownedByLoop(config.exhaustSource) && config.mode === 'active' ? [...armsOn] : [];
  const decide = (action: ClimateAction): ClimateDecision => ({ action, reconcileArms });
  const hold = (reason: string) => decide({ kind: 'hold', reason });

  if (config.mode === 'off') return { action: { kind: 'hold', reason: 'loop is off' }, reconcileArms: [] };
  // Blind: hand the fan back to its firmware rather than disarming it and commanding nothing.
  if (reading.airVpd === null) {
    return { action: { kind: 'hold', reason: 'no tent air reading — failing safe' }, reconcileArms: [] };
  }

  const vpd = reading.airVpd;
  const tentC = reading.tent?.tempC ?? null;
  const tooHot = tentC !== null && tentC >= config.ventAlwaysAboveC;
  const tooCold = tentC !== null && tentC <= config.ventNeverBelowC;
  const vented = reading.ventedAirVpd;

  // Cold protection's stop half: humid room air never carries tent VPD past the top of band, so
  // on a cold wet night the ordinary release never fires.
  if (tooCold && exhaust.on) {
    const reason = `tent ${degC(tentC!)} °C at or below the ${degC(config.ventNeverBelowC)} °C floor — stopping regardless of VPD`;
    if (!exhaust.present) return hold(`${reason}, but the exhaust plug is not discovered`);
    if (!ownedByLoop(config.exhaustSource)) {
      return decide({ kind: 'delegated', want: 'exhaust', on: false, reason });
    }
    return decide({ kind: 'exhaust', on: false, reason });
  }

  let wantExhaust: boolean;
  let why: string;
  if (exhaust.on) {
    // Futility's stop half: if the room turns humid mid-run, tent VPD never climbs to the top
    // of band, so without this the fan runs forever at no benefit.
    const futile = vented !== null && vented < vpd - config.minGainKpa;
    // `< high`, not `<= high`: from grow week 6 band.high clamps to exactly AIR_VPD_HARD_MAX,
    // and holding at that reading would park the fan on the rail ceilingBreach calls a breach.
    wantExhaust = vpd < band.high && !futile;
    if (futile) why = `venting now predicts ${kpa(vented!)} against the current ${kpa(vpd)} — no longer helping`;
    else if (wantExhaust) why = `air VPD ${kpa(vpd)} still below the ${kpa(band.high)} top of band`;
    else why = `air VPD ${kpa(vpd)} reached the ${kpa(band.high)} top of band`;
  } else {
    wantExhaust = vpd < band.low;
    // Three cases: with the fan off, "not below the floor" covers both inside the band and
    // above it, and reporting the second as the first is what an operator reads before arming.
    if (wantExhaust) why = `air VPD ${kpa(vpd)} below the ${kpa(band.low)} floor of band`;
    else if (vpd > band.high) why = `air VPD ${kpa(vpd)} above the ${kpa(band.high)} top of band`;
    else why = `air VPD ${kpa(vpd)} inside the ${kpa(band.low)}–${kpa(band.high)} band`;
  }

  if (tooHot) {
    wantExhaust = true;
    why = `tent ${degC(tentC!)} °C at or above the ${degC(config.ventAlwaysAboveC)} °C vent limit`;
  }

  // Never both: a restart or a hand-flipped plug can land here, and two opposed actuators
  // running against each other is a state neither hysteresis band escapes.
  if (wantExhaust && humidifier.present && humidifier.on && ownedByLoop(config.rhSource)) {
    return decide({ kind: 'humidify', on: false, reason: `${why}; releasing the humidifier first` });
  }

  if (wantExhaust !== exhaust.on) {
    // Checked once for both directions: an offline plug still shows its last retained relay
    // position, and commanding it buys a wasted publish and a log row claiming a phantom action.
    if (!exhaust.present) return hold(`${why}, but the exhaust plug is not discovered`);

    if (wantExhaust) {
      if (tooCold) {
        return decide({
          kind: 'blocked',
          want: 'exhaust',
          on: true,
          reason: `${why}, but tent ${degC(tentC!)} °C is at or below the ${degC(config.ventNeverBelowC)} °C floor`
        });
      }

      // Heat outranks the minimum off, as the hard ceiling outranks the minimum on.
      const idleMs = elapsedSince(exhaust.lastChangeMs, nowMs);
      if (!tooHot && idleMs !== null && idleMs < config.minOffSeconds * 1000) {
        return hold(`${why}, waiting out the ${config.minOffSeconds}s minimum off`);
      }

      // Futility's start half. A heat override is about temperature, so it bypasses this; a
      // missing room reference skips it, degrading to unguarded venting rather than paralysis.
      if (!tooHot && vented !== null && vented < vpd + config.minGainKpa) {
        return decide({
          kind: 'blocked',
          want: 'exhaust',
          on: true,
          reason: `${why}, but venting predicts only ${kpa(vented)} against the ${kpa(vpd + config.minGainKpa)} needed`
        });
      }

      if (!ownedByLoop(config.exhaustSource)) {
        return decide({ kind: 'delegated', want: 'exhaust', on: true, reason: `${why}; exhaust is owned by ${config.exhaustSource}` });
      }
      return decide({ kind: 'exhaust', on: true, reason: why });
    }

    const runMs = elapsedSince(exhaust.lastChangeMs, nowMs);
    const withinMinOn = runMs !== null && runMs < config.minOnSeconds * 1000;
    // A stuck-on fan is the failure the minimum was never meant to protect.
    const ceilingBreach = vpd >= AIR_VPD_HARD_MAX;
    if (withinMinOn && !ceilingBreach) {
      return hold(`${why}, holding out the ${config.minOnSeconds}s minimum on`);
    }
    if (!ownedByLoop(config.exhaustSource)) {
      return decide({ kind: 'delegated', want: 'exhaust', on: false, reason: `${why}; exhaust is owned by ${config.exhaustSource}` });
    }
    const suffix = withinMinOn ? ' — hard ceiling overrides the minimum on' : '';
    return decide({ kind: 'exhaust', on: false, reason: `${why}${suffix}` });
  }

  // Humidifier: engages at the hard ceiling, releases at the week's target. The separation floor
  // covers the case the target alone does not — an override may sit ON the ceiling, collapsing
  // both thresholds onto one reading.
  if (!wantExhaust) {
    const release = Math.min(band.target, AIR_VPD_HARD_MAX - HUMIDIFIER_MIN_SEPARATION_KPA);
    const wantHumidify = humidifier.on ? vpd > release : vpd >= AIR_VPD_HARD_MAX;

    if (wantHumidify && !humidifier.on) {
      const reason = `air VPD ${kpa(vpd)} at or above the ${kpa(AIR_VPD_HARD_MAX)} hard ceiling`;
      if (!ownedByLoop(config.rhSource)) {
        return decide({ kind: 'delegated', want: 'humidify', on: true, reason: `${reason}; RH is owned by ${config.rhSource}` });
      }
      if (!humidifier.present) {
        return decide({ kind: 'blocked', want: 'humidify', on: true, reason: `${reason}, but no humidifier plug is discovered` });
      }
      const idleMs = elapsedSince(humidifier.lastChangeMs, nowMs);
      if (idleMs !== null && idleMs < config.minOffSeconds * 1000) {
        return hold(`${reason}, waiting out the ${config.minOffSeconds}s minimum off`);
      }
      return decide({ kind: 'humidify', on: true, reason });
    }

    if (!wantHumidify && humidifier.on && ownedByLoop(config.rhSource)) {
      const reason = `air VPD ${kpa(vpd)} back below the ${kpa(release)} release point`;
      if (!humidifier.present) return hold(`${reason}, but the humidifier plug is not discovered`);
      const runMs = elapsedSince(humidifier.lastChangeMs, nowMs);
      if (runMs !== null && runMs < config.minOnSeconds * 1000) {
        return hold(`${reason}, holding out the ${config.minOnSeconds}s minimum on`);
      }
      return decide({ kind: 'humidify', on: false, reason });
    }
  }

  return hold(why);
}
