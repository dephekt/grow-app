// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/**
 * Shared climate-loop vocabulary: config shape, the control band, and the actuator registry.
 *
 * Client-safe, so /climate renders the same band and the same decision the server acted on.
 */
import { AIR_VPD_HARD_MAX, AIR_VPD_HARD_MIN } from '$lib/lights/grow-plan';

/** `observe` decides and logs but never publishes — the dry-run gear. */
export type ClimateMode = 'off' | 'observe' | 'active';

/** Who owns an actuator. `loop` is the only value that lets grow-app publish to it. */
export type ActuatorSource = 'loop' | 'firmware' | 'external' | 'none';

export const CLIMATE_MODES: ClimateMode[] = ['off', 'observe', 'active'];

/** The exhaust plug, and the arms baked into its firmware that would otherwise fight the loop. */
export const EXHAUST_NODE = 'exhaust-fan';
export const EXHAUST_RELAY = 'exhaust_fan';
export const EXHAUST_ARMS = ['fan_cycle', 'fan_schedule'] as const;

/** Not yet built — all four Athom plugs are in use and the humidifier needs a fifth. Resolving
 *  it optionally means arming RH control later is config, not code. */
export const HUMIDIFIER_NODE = 'humidifier';
export const HUMIDIFIER_RELAY = 'humidifier';

export interface ClimateConfig {
  mode: ClimateMode;
  exhaustSource: ActuatorSource;
  rhSource: ActuatorSource;
  /** Half-width of the control band around the week's target, kPa. */
  deadbandKpa: number;
  minOnSeconds: number;
  minOffSeconds: number;
  /** A start is refused unless venting predicts at least this much improvement, kPa. */
  minGainKpa: number;
  /** Above this tent temperature the fan runs regardless of VPD. */
  ventAlwaysAboveC: number;
  /** Below this tent temperature the fan is blocked regardless of VPD. */
  ventNeverBelowC: number;
  /** Overrides the week's cited target when set; null follows WEEKLY_PLAN. */
  airVpdOverride: number | null;
}

/**
 * Defaults describe the system as it is today — firmware owns the fan, a humidistat owns RH,
 * and the loop only watches. Arming is a deliberate act, never a side effect of deploying.
 */
export const DEFAULT_CLIMATE_CONFIG: ClimateConfig = {
  mode: 'observe',
  exhaustSource: 'firmware',
  rhSource: 'external',
  deadbandKpa: 0.1,
  // Anti-chatter only, NOT a run-length policy: venting moves air VPD ~0.11 kPa/min at a large
  // gradient, so a long minimum would overshoot the band by more than a whole kPa every cycle.
  minOnSeconds: 120,
  minOffSeconds: 300,
  minGainKpa: 0.05,
  ventAlwaysAboveC: 31,
  ventNeverBelowC: 20,
  airVpdOverride: null
};

export interface ControlBand {
  target: number;
  low: number;
  high: number;
}

/**
 * The week's band, clamped into the book's hard rails.
 *
 * The band is the whole debounce: once the fan starts it must carry VPD all the way to `high`
 * before it can stop, and VPD must fall all the way back to `low` before it can restart — so
 * short-cycling is structurally impossible and no backoff timer is needed.
 */
export function controlBand(target: number, deadbandKpa: number): ControlBand {
  // Rounded because binary subtraction leaves 1.15 − 0.10 at 1.0499999999999998, which would
  // be written to the log and drawn on the page in that form.
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return {
    target,
    low: round(Math.max(AIR_VPD_HARD_MIN, target - deadbandKpa)),
    high: round(Math.min(AIR_VPD_HARD_MAX, target + deadbandKpa))
  };
}

export { AIR_VPD_HARD_MAX, AIR_VPD_HARD_MIN };
