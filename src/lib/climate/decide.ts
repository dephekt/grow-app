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
  /** The same quantity over a far shorter window, for the edges that must not lag. Venting
   *  moves air VPD ~0.15 kPa/min in daylight, so the 5 min median trails a vent run by more
   *  than the band is wide. Null falls back to `airVpd`. */
  airVpdFast: number | null;
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

/**
 * A desire becomes an action here or nowhere.
 *
 * Order: world, then actuator. `desire.blocked` is a fact about the tent and holds whoever owns
 * the relay, so it comes first; ownership, contention and presence are facts about the actuator
 * and are only worth reporting once the loop would otherwise have acted.
 */
function applyTransition(
  actuator: ClimateActuator,
  state: ActuatorState,
  desire: Desire,
  source: ActuatorSource,
  config: ClimateConfig,
  nowMs: number,
  contendedBy: readonly string[] = []
): ClimateAction | null {
  if (desire.on === state.on) return null;

  if (desire.blocked) return { kind: 'blocked', want: actuator, on: desire.on, reason: desire.blocked };
  if (!ownedByLoop(source)) {
    return { kind: 'delegated', want: actuator, on: desire.on, reason: `${desire.why}; ${ACTUATOR_LABEL[actuator]} is owned by ${source}` };
  }
  // The plug's own arms re-assert this relay every ~10 s, so the loop cannot hold it while one
  // is on — and it will not disarm them, because it cannot restore persistent device state it
  // did not set and would strand the tent unsupervised on any path that stops it running.
  if (contendedBy.length > 0) {
    return {
      kind: 'blocked',
      want: actuator,
      on: desire.on,
      reason: `${desire.why}, but ${contendedBy.join(' and ')} still drives the relay — disarm it in device settings`
    };
  }
  if (!state.present) {
    return { kind: 'blocked', want: actuator, on: desire.on, reason: `${desire.why}, but the ${ACTUATOR_LABEL[actuator]} plug is not discovered` };
  }

  const elapsed = elapsedSince(state.lastChangeMs, nowMs);
  const minimumSeconds = desire.on ? config.minOffSeconds : config.minOnSeconds;
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

/** Hysteresis plus the overrides, as a single desired fan state.
 *
 *  `vpd` is the 5 min median and `fast` a ~25 s one, and the rule for choosing between them is
 *  shared with the humidifier: STARTING needs both to agree, STOPPING acts on the short one.
 *
 *  The asymmetry is in the consequences, not the physics. A late stop breaches a hard agronomic
 *  rail, while an early one merely ends a vent run short and self-corrects. A spurious start is
 *  the expensive mistake — it is what short-cycles a relay, and what can set two opposed
 *  actuators against each other — so it takes both windows to authorise one.
 *
 *  Requiring both to start costs nothing in latency: on the falling leg the short window crosses
 *  the floor FIRST, so the median remains the gate, exactly as it was before this split. */
function desireExhaust(
  input: ClimateDecisionInput,
  vpd: number,
  fast: number,
  tentC: number | null
): Desire {
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
    // Both windows, same as the mainline start: on the tick after a vent stop the median is
    // under the floor while the short window is not, and testing the median alone would raise
    // a red `blocked · exhaust ON` for a start that would not have been attempted.
    return vpd < band.low && fast < band.low
      ? { on: true, why, blocked: `air VPD ${kpa(vpd)} below the ${kpa(band.low)} floor of band, but ${why}` }
      : { on: false, why };
  }

  if (exhaust.on) {
    // `>= high`: from grow week 6 band.high clamps to the rail, and holding there parks the
    // fan on it.
    if (fast >= band.high) {
      return {
        on: false,
        // Always urgent, so the minimum on can never defer a stop. It used to apply until the
        // hard rail, which was survivable only because the median stop was so late the timer had
        // always expired. Reading the top of band promptly puts the stop INSIDE the minimum: a
        // run starting at the 0.90 floor reaches 1.10 in ~48s at the daylight 0.25 kPa/min, so
        // the timer would hold the fan through the band and release it at 1.23, past the rail
        // the short window exists to defend.
        //
        // Nothing is lost. The minimum on is anti-chatter, and chatter is already impossible by
        // construction: restarting needs BOTH windows under the floor, which at the ~0.02
        // kPa/min a tent re-humidifies at is ten minutes away. It still governs the futility
        // stop below, where running on a little longer costs nothing.
        urgent: true,
        why: `air VPD ${kpa(fast)} reached the ${kpa(band.high)} top of band`
      };
    }
    // Futility's stop half: a room that turns humid mid-run never lets VPD reach the top.
    if (vented !== null && vented < fast - config.minGainKpa) {
      return { on: false, why: `venting now predicts ${kpa(vented)} against the current ${kpa(fast)} — no longer helping` };
    }
    return { on: true, why: `air VPD ${kpa(fast)} still below the ${kpa(band.high)} top of band` };
  }

  if (vpd < band.low && fast < band.low) {
    const why = `air VPD ${kpa(vpd)} below the ${kpa(band.low)} floor of band`;
    // Futility's start half; a missing room reference skips it rather than blocking.
    if (vented !== null && vented < vpd + config.minGainKpa) {
      return { on: true, why, blocked: `${why}, but venting predicts only ${kpa(vented)} against the ${kpa(vpd + config.minGainKpa)} needed` };
    }
    return { on: true, why };
  }
  // Below the floor on the median but not on the short window: the state the AND-gate above
  // exists to create, and the one immediately following every vent stop. Said plainly, because
  // falling through to the "inside the band" wording below would print a sentence contradicting
  // its own number, on exactly the row an operator reads to understand the stop.
  if (vpd < band.low) {
    return {
      on: false,
      why: `air VPD ${kpa(vpd)} below the ${kpa(band.low)} floor of band, but the short window still reads ${kpa(fast)}`
    };
  }
  const why =
    vpd > band.high
      ? `air VPD ${kpa(vpd)} above the ${kpa(band.high)} top of band`
      : `air VPD ${kpa(vpd)} inside the ${kpa(band.low)}–${kpa(band.high)} band`;
  return { on: false, why };
}

/** Engages at the hard ceiling, releases at the target, with a separation floor for the case
 *  an override sits ON the ceiling.
 *
 *  Follows the same rule as the exhaust, which is about commitment rather than direction:
 *  STARTING an actuator needs both windows to agree, STOPPING acts on the short one. Starting
 *  is the committing move — two opposed actuators, or a mains humidifier short-cycling — while
 *  stopping is always safe, and a late stop is what breaches a rail.
 *
 *  So engaging requires the median to reach the ceiling too. The approach to the ceiling is
 *  driven by the EXHAUST, and the post-vent transient is exactly what the median is there to
 *  reject: without this, the fast window catching up after a vent stop could engage the
 *  humidifier at a ceiling the tent never really held, which then runs to the release point and
 *  pushes VPD back under the floor for another vent — a short cycle between opposed actuators. */
function desireHumidifier(band: ControlBand, vpd: number, fast: number, on: boolean): Desire {
  const release = Math.min(band.target, AIR_VPD_HARD_MAX - HUMIDIFIER_MIN_SEPARATION_KPA);
  if (on) {
    return fast > release
      ? { on: true, why: `air VPD ${kpa(fast)} still above the ${kpa(release)} release point` }
      : { on: false, why: `air VPD ${kpa(fast)} back below the ${kpa(release)} release point` };
  }
  if (fast >= AIR_VPD_HARD_MAX && vpd >= AIR_VPD_HARD_MAX) {
    return { on: true, why: `air VPD ${kpa(fast)} at or above the ${kpa(AIR_VPD_HARD_MAX)} hard ceiling` };
  }
  return fast >= AIR_VPD_HARD_MAX
    ? {
        on: false,
        why: `short window reads ${kpa(fast)} at the ${kpa(AIR_VPD_HARD_MAX)} hard ceiling, but the median is still ${kpa(vpd)}`
      }
    : { on: false, why: `air VPD ${kpa(fast)} below the ${kpa(AIR_VPD_HARD_MAX)} hard ceiling` };
}

export function decideClimate(input: ClimateDecisionInput): ClimateAction {
  const { nowMs, config, band, reading, exhaust, humidifier, armsOn } = input;

  if (config.mode === 'off') return { kind: 'hold', reason: 'loop is off' };
  if (reading.airVpd === null) return { kind: 'hold', reason: 'no tent air reading — failing safe' };
  // After a restart the median is one sample and every relay timer is null, so a single glitch
  // would reach an urgent override with nothing damping it.
  if (reading.warmingUp) return { kind: 'hold', reason: 'smoothing window still filling' };

  const vpd = reading.airVpd;
  // A tent that has only just appeared has no fast window yet; the median is the safe stand-in
  // because it is the slower of the two, never the more eager.
  const fast = reading.airVpdFast ?? vpd;
  const fan = desireExhaust(input, vpd, fast, reading.tent?.tempC ?? null);

  // Never both: neither hysteresis band escapes two opposed actuators fighting each other.
  // Urgent, because that state is worse than an early humidifier stop — and it is unreachable
  // in sequence anyway, since VPD cannot fall from the ceiling to the band floor without
  // passing the release point. Stated as urgency rather than as a bypass so the guard holds.
  if (fan.on && humidifier.present && humidifier.on && ownedByLoop(config.rhSource)) {
    const release: Desire = { on: false, urgent: true, why: `${fan.why}; releasing the humidifier first` };
    const action = applyTransition('humidify', humidifier, release, config.rhSource, config, nowMs);
    if (action) return action;
  }

  const fanAction = applyTransition('exhaust', exhaust, fan, config.exhaustSource, config, nowMs, armsOn);
  if (fanAction) return fanAction;

  // Only while the fan is idle, so the two can never be commanded together.
  if (!fan.on) {
    const rh = desireHumidifier(band, vpd, fast, humidifier.on);
    const rhAction = applyTransition('humidify', humidifier, rh, config.rhSource, config, nowMs);
    if (rhAction) return rhAction;
  }

  return { kind: 'hold', reason: fan.why };
}
