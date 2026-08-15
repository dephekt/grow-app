// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/** The control law: `desire*` says what each actuator should be doing, `applyTransition` is the
 *  only place permission is checked — so a guard cannot be added to one leg and not the other. */
import { AIR_VPD_HARD_MAX, type ActuatorSource, type ClimateConfig, type ControlBand } from './model';
import type { AirState } from './psychro';

export interface ClimateReading {
  tent: AirState | null;
  room: AirState | null;
  /** Smoothed air VPD, the control input; null whenever the tent sensor cannot be trusted. */
  airVpd: number | null;
  /** Smoothed prediction of where venting would settle it; null with no room reference. */
  ventedAirVpd: number | null;
  /** Recorded beside every decision, never an input to one. */
  leafVpd: number | null;
  lightsOn: boolean;
  /** True until the smoothing window can reject an outlier instead of being one. */
  warmingUp: boolean;
}

export interface ActuatorState {
  /** Discovered and not offline; an absent relay can be neither commanded nor believed. */
  present: boolean;
  on: boolean;
  /** Null on a cold start, which lets the first action through. */
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
  /** Wanted, but someone else owns the actuator. Carries direction, so a dry run separates
   *  "wants to start venting" from "wants to stop" — over-venting is the case worth seeing. */
  | { kind: 'delegated'; want: ClimateActuator; on: boolean; reason: string }
  | { kind: 'blocked'; want: ClimateActuator; on: boolean; reason: string };

export interface ClimateDecision {
  action: ClimateAction;
  /** Firmware arm objectIds to publish OFF this tick. */
  reconcileArms: string[];
}

/** Minimum gap between the humidifier's engage and release points, whatever band and override
 *  produce; below it the hysteresis stops existing. */
export const HUMIDIFIER_MIN_SEPARATION_KPA = 0.05;

/** Display names, since 'humidify' is the action but 'humidifier' is the thing. */
const ACTUATOR_LABEL: Record<ClimateActuator, string> = { exhaust: 'exhaust', humidify: 'humidifier' };

const kpa = (n: number) => n.toFixed(2);
const degC = (n: number) => n.toFixed(1);

/** What an actuator should be doing, before anyone asks whether the loop may do it. */
interface Desire {
  on: boolean;
  why: string;
  /** Overrides the minimum timers: heat, and the book's hard ceiling. */
  urgent?: boolean;
  /** The desire cannot be honoured for a physical reason, as opposed to an ownership one. */
  blocked?: string;
}

function elapsedSince(lastChangeMs: number | null, nowMs: number): number | null {
  return lastChangeMs === null ? null : Math.max(0, nowMs - lastChangeMs);
}

function ownedByLoop(source: ActuatorSource): boolean {
  return source === 'loop';
}

/** A desire becomes an action here or nowhere; the order — presence, block, ownership, timers —
 *  puts ownership ahead of a minimum the loop could never have served. */
function applyTransition(
  actuator: ClimateActuator,
  state: ActuatorState,
  desire: Desire,
  source: ActuatorSource,
  minOnSeconds: number,
  minOffSeconds: number,
  nowMs: number
): ClimateAction | null {
  if (desire.on === state.on) return null;

  // Ownership first: whether a relay we do not own is present changes nothing about the
  // verdict, and reporting its absence as `blocked` paints the shipped default red.
  if (!ownedByLoop(source)) {
    return { kind: 'delegated', want: actuator, on: desire.on, reason: `${desire.why}; ${ACTUATOR_LABEL[actuator]} is owned by ${source}` };
  }
  if (desire.blocked) return { kind: 'blocked', want: actuator, on: desire.on, reason: desire.blocked };
  if (!state.present) {
    return { kind: 'blocked', want: actuator, on: desire.on, reason: `${desire.why}, but the ${ACTUATOR_LABEL[actuator]} plug is not discovered` };
  }

  const elapsed = elapsedSince(state.lastChangeMs, nowMs);
  const minimumSeconds = desire.on ? minOffSeconds : minOnSeconds;
  const withinMinimum = elapsed !== null && elapsed < minimumSeconds * 1000;
  if (withinMinimum && !desire.urgent) {
    const label = desire.on ? 'minimum off' : 'minimum on';
    return { kind: 'hold', reason: `${desire.why}, waiting out the ${minimumSeconds}s ${label}` };
  }

  const suffix = withinMinimum ? ' — override beats the minimum' : '';
  return actuator === 'exhaust'
    ? { kind: 'exhaust', on: desire.on, reason: `${desire.why}${suffix}` }
    : { kind: 'humidify', on: desire.on, reason: `${desire.why}${suffix}` };
}

/** Hysteresis plus the overrides, as a single desired fan state. */
function desireExhaust(input: ClimateDecisionInput, vpd: number, tentC: number | null): Desire {
  const { config, band, reading, exhaust } = input;
  const tooHot = tentC !== null && tentC >= config.ventAlwaysAboveC;
  const tooCold = tentC !== null && tentC <= config.ventNeverBelowC;
  const vented = reading.ventedAirVpd;

  if (tooHot) {
    return { on: true, urgent: true, why: `tent ${degC(tentC!)} °C at or above the ${degC(config.ventAlwaysAboveC)} °C vent limit` };
  }
  if (tooCold) {
    const why = `tent ${degC(tentC!)} °C at or below the ${degC(config.ventNeverBelowC)} °C floor`;
    if (exhaust.on) return { on: false, urgent: true, why: `${why} — stopping regardless of VPD` };
    // Still wants ON, because a block reporting `on: false` is no transition and says nothing.
    return vpd < band.low
      ? { on: true, why, blocked: `air VPD ${kpa(vpd)} below the ${kpa(band.low)} floor of band, but ${why}` }
      : { on: false, why };
  }

  if (exhaust.on) {
    // `>= high`: from grow week 6 band.high clamps to the rail, and holding there parks the
    // fan on it.
    if (vpd >= band.high) {
      return {
        on: false,
        // Urgent only PAST the band's top, or the minimum on is void for weeks 6 to 10.
        urgent: vpd > band.high && vpd >= AIR_VPD_HARD_MAX,
        why: `air VPD ${kpa(vpd)} reached the ${kpa(band.high)} top of band`
      };
    }
    // Futility's stop half: a room that turns humid mid-run never lets VPD reach the top.
    if (vented !== null && vented < vpd - config.minGainKpa) {
      return { on: false, why: `venting now predicts ${kpa(vented)} against the current ${kpa(vpd)} — no longer helping` };
    }
    return { on: true, why: `air VPD ${kpa(vpd)} still below the ${kpa(band.high)} top of band` };
  }

  if (vpd < band.low) {
    const why = `air VPD ${kpa(vpd)} below the ${kpa(band.low)} floor of band`;
    // Futility's start half; a missing room reference skips it rather than blocking.
    if (vented !== null && vented < vpd + config.minGainKpa) {
      return { on: true, why, blocked: `${why}, but venting predicts only ${kpa(vented)} against the ${kpa(vpd + config.minGainKpa)} needed` };
    }
    return { on: true, why };
  }
  const why =
    vpd > band.high
      ? `air VPD ${kpa(vpd)} above the ${kpa(band.high)} top of band`
      : `air VPD ${kpa(vpd)} inside the ${kpa(band.low)}–${kpa(band.high)} band`;
  return { on: false, why };
}

/** Engages at the hard ceiling, releases at the target, with a separation floor for the case
 *  an override sits ON the ceiling. */
function desireHumidifier(band: ControlBand, vpd: number, on: boolean): Desire {
  const release = Math.min(band.target, AIR_VPD_HARD_MAX - HUMIDIFIER_MIN_SEPARATION_KPA);
  if (on) {
    return vpd > release
      ? { on: true, why: `air VPD ${kpa(vpd)} still above the ${kpa(release)} release point` }
      : { on: false, why: `air VPD ${kpa(vpd)} back below the ${kpa(release)} release point` };
  }
  return vpd >= AIR_VPD_HARD_MAX
    ? { on: true, why: `air VPD ${kpa(vpd)} at or above the ${kpa(AIR_VPD_HARD_MAX)} hard ceiling` }
    : { on: false, why: `air VPD ${kpa(vpd)} below the ${kpa(AIR_VPD_HARD_MAX)} hard ceiling` };
}

export function decideClimate(input: ClimateDecisionInput): ClimateDecision {
  const { nowMs, config, band, reading, exhaust, humidifier, armsOn } = input;

  const reconcileArms = ownedByLoop(config.exhaustSource) && config.mode === 'active' ? [...armsOn] : [];
  const decide = (action: ClimateAction): ClimateDecision => ({ action, reconcileArms });

  if (config.mode === 'off') return { action: { kind: 'hold', reason: 'loop is off' }, reconcileArms: [] };
  // Blind: hand the fan back to its firmware rather than disarming it and commanding nothing.
  if (reading.airVpd === null) {
    return { action: { kind: 'hold', reason: 'no tent air reading — failing safe' }, reconcileArms: [] };
  }
  // After a restart the median is one sample and every relay timer is null, so a single glitch
  // would reach an urgent override with nothing damping it.
  if (reading.warmingUp) return decide({ kind: 'hold', reason: 'smoothing window still filling' });

  const vpd = reading.airVpd;
  const fan = desireExhaust(input, vpd, reading.tent?.tempC ?? null);

  // Never both: neither hysteresis band escapes two opposed actuators fighting each other.
  if (fan.on && humidifier.present && humidifier.on && ownedByLoop(config.rhSource)) {
    return decide({ kind: 'humidify', on: false, reason: `${fan.why}; releasing the humidifier first` });
  }

  const fanAction = applyTransition(
    'exhaust',
    exhaust,
    fan,
    config.exhaustSource,
    config.minOnSeconds,
    config.minOffSeconds,
    nowMs
  );
  if (fanAction) return decide(fanAction);

  // Only while the fan is idle, so the two can never be commanded together.
  if (!fan.on) {
    const rh = desireHumidifier(band, vpd, humidifier.on);
    const rhAction = applyTransition(
      'humidify',
      humidifier,
      rh,
      config.rhSource,
      config.minOnSeconds,
      config.minOffSeconds,
      nowMs
    );
    if (rhAction) return decide(rhAction);
  }

  return decide({ kind: 'hold', reason: fan.why });
}
