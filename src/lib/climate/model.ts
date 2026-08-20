// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/** Shared climate-loop vocabulary; client-safe so /climate renders the same band the server
 *  acted on. */
import { AIR_VPD_HARD_MAX, AIR_VPD_HARD_MIN } from '$lib/lights/grow-plan';
import { EXHAUST_NODE, HUMIDIFIER_NODE, PLUGS } from '$lib/plugs/model';

/** `observe` decides and logs but never publishes — the dry-run gear. */
export type ClimateMode = 'off' | 'observe' | 'active';

/** Who owns an actuator. `loop` is the only value that lets grow-app publish to it. */
export type ActuatorSource = 'loop' | 'firmware' | 'external' | 'none';

export const CLIMATE_MODES: ClimateMode[] = ['off', 'observe', 'active'];

/** Read off the plug registry, and thrown on rather than defaulted: a fallback would let a
 *  rename leave the loop silently reconciling arms that no longer resolve. */
function relayOf(node: string): string {
  const spec = PLUGS.find((plug) => plug.node === node);
  if (!spec?.relay) throw new Error(`plug registry has no relay for ${node}`);
  return spec.relay;
}

export const EXHAUST_RELAY = relayOf(EXHAUST_NODE);
export const EXHAUST_ARMS: readonly string[] = (
  PLUGS.find((plug) => plug.node === EXHAUST_NODE)?.arms ?? []
).map((arm) => arm.objectId);

export const HUMIDIFIER_RELAY = relayOf(HUMIDIFIER_NODE);

export { EXHAUST_NODE, HUMIDIFIER_NODE };

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

/** Defaults describe the system as it is today, so arming stays a deliberate act rather than
 *  a side effect of deploying. */
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

/** The week's band, clamped into the book's hard rails. The band is the whole debounce: VPD
 *  must traverse it in full to reverse the fan, so short-cycling is structurally impossible. */
export function controlBand(target: number, deadbandKpa: number): ControlBand {
  // Rounded because binary subtraction leaves 1.15 − 0.10 at 1.0499999999999998, which would
  // be written to the log and drawn on the page in that form.
  const round = (n: number) => Math.round(n * 1000) / 1000;
  // Clamp the TARGET, not only its edges: edge-only clamping inverts the band for a target
  // outside the rails.
  const clamped = Math.min(AIR_VPD_HARD_MAX, Math.max(AIR_VPD_HARD_MIN, target));
  return {
    target: round(clamped),
    low: round(Math.max(AIR_VPD_HARD_MIN, clamped - deadbandKpa)),
    high: round(Math.min(AIR_VPD_HARD_MAX, clamped + deadbandKpa))
  };
}

export { AIR_VPD_HARD_MAX, AIR_VPD_HARD_MIN };
