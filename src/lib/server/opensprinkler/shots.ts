// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { numericScalar } from './coerce';
import type { Zone } from './zones';

/**
 * Shot-size math (CCI Black Book, p.55): emitter flow is canonical L/hr, so mL/min = L/hr × 1000 / 60.
 */
export const ML_PER_MIN_PER_LPH = 1000 / 60; // ≈ 16.6667

type EmitterZone = Pick<Zone, 'drippers' | 'emitterLph'>;
type VolumeZone = Pick<Zone, 'substrateVolumeMl'>;

/** Total delivery rate across the zone's drippers, or null if unspecified. */
export function zoneFlowMlPerMin(zone: EmitterZone): number | null {
  if (!zone.drippers || !zone.emitterLph) return null;
  return zone.drippers * zone.emitterLph * ML_PER_MIN_PER_LPH;
}

export function percentToMl(percent: number, zone: VolumeZone): number | null {
  if (!zone.substrateVolumeMl) return null;
  return (percent / 100) * zone.substrateVolumeMl;
}

export function mlToSeconds(ml: number, zone: EmitterZone): number | null {
  const flow = zoneFlowMlPerMin(zone);
  if (!flow) return null;
  return (ml / flow) * 60;
}

/** Unvalidated on purpose: the run route hands `request.json()` straight to resolveShotSeconds,
 *  so declaring these `number` would claim the checking below has already happened. */
export interface ShotInput {
  seconds?: unknown;
  ml?: unknown;
  percent?: unknown;
}

/** Shares numericScalar with the schedule and zone parsers, so a shot arriving through the run
 *  route and the same shot arriving through a schedule are held to one definition of a number. */
function positiveNumber(value: unknown, field: string): number {
  const n = numericScalar(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${field} must be a positive number`);
  return n;
}

/**
 * Resolve a shot request to an integer number of seconds — `seconds` is authoritative when given,
 * otherwise `ml`/`percent` compile via the zone's emitter/substrate spec.
 */
export function resolveShotSeconds(input: ShotInput, zone: Zone): number {
  if (input.seconds != null) {
    const rounded = Math.round(positiveNumber(input.seconds, 'seconds'));
    if (rounded <= 0) throw new Error('run time rounds to 0 seconds');
    return rounded;
  }

  let ml: number;
  if (input.ml != null) {
    ml = positiveNumber(input.ml, 'ml');
  } else if (input.percent != null) {
    const compiled = percentToMl(positiveNumber(input.percent, 'percent'), zone);
    if (compiled == null) throw new Error('zone has no substrate volume; set it or use seconds');
    ml = compiled;
  } else {
    throw new Error('provide one of seconds, ml, or percent');
  }

  const seconds = mlToSeconds(ml, zone);
  if (seconds == null)
    throw new Error('zone has no emitter flow; set drippers + emitter flow or use seconds');
  const rounded = Math.round(seconds);
  if (rounded <= 0) throw new Error('computed run time rounds to 0 seconds');
  return rounded;
}

/** Bound the run to the zone's safety cap (the max-run watchdog). */
export function clampSeconds(seconds: number, maxRunSeconds: number): number {
  return Math.min(seconds, maxRunSeconds);
}
