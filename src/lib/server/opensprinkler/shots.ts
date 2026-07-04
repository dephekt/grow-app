import type { Zone } from './zones';

/**
 * Shot-size math (CCI Black Book, p.55). A "shot" can be expressed as a % of the
 * substrate volume, a volume in mL, or a raw duration in seconds; the first two
 * compile to a valve-open duration via the zone's dripper count + emitter flow rate:
 *   shot_mL     = shot% × substrate_volume_mL
 *   duration_s  = shot_mL ÷ (drippers × emitter_mL_per_min) × 60
 * Emitter flow is given in GPH; 1 US gal = 3785.411784 mL, so mL/min ≈ GPH × 63.09.
 */
const ML_PER_US_GALLON = 3785.411784;
export const ML_PER_MIN_PER_GPH = ML_PER_US_GALLON / 60; // ≈ 63.0902

type EmitterZone = Pick<Zone, 'drippers' | 'emitterGph'>;
type VolumeZone = Pick<Zone, 'substrateVolumeMl'>;

/** Total delivery rate across the zone's drippers, or null if unspecified. */
export function zoneFlowMlPerMin(zone: EmitterZone): number | null {
  if (!zone.drippers || !zone.emitterGph) return null;
  return zone.drippers * zone.emitterGph * ML_PER_MIN_PER_GPH;
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

export interface ShotInput {
  seconds?: number;
  ml?: number;
  percent?: number;
}

/**
 * Resolve a shot request to an integer number of seconds. `seconds` is authoritative
 * when given; otherwise `ml`/`percent` are compiled via the zone's emitter/substrate
 * spec. Throws a caller-friendly Error (→ HTTP 400) on missing spec or bad input.
 */
export function resolveShotSeconds(input: ShotInput, zone: Zone): number {
  if (input.seconds != null) {
    const s = Number(input.seconds);
    if (!Number.isFinite(s) || s <= 0) throw new Error('seconds must be a positive number');
    return Math.round(s);
  }

  let ml: number | null;
  if (input.ml != null) {
    ml = Number(input.ml);
    if (!Number.isFinite(ml) || ml <= 0) throw new Error('ml must be a positive number');
  } else if (input.percent != null) {
    const percent = Number(input.percent);
    if (!Number.isFinite(percent) || percent <= 0) throw new Error('percent must be a positive number');
    ml = percentToMl(percent, zone);
    if (ml == null) throw new Error('zone has no substrate volume; set it or use seconds');
  } else {
    throw new Error('provide one of seconds, ml, or percent');
  }

  const seconds = mlToSeconds(ml, zone);
  if (seconds == null) throw new Error('zone has no emitter flow; set drippers + emitter GPH or use seconds');
  const rounded = Math.round(seconds);
  if (rounded <= 0) throw new Error('computed run time rounds to 0 seconds');
  return rounded;
}

/** Bound the run to the zone's safety cap (the max-run watchdog). */
export function clampSeconds(seconds: number, maxRunSeconds: number): number {
  return Math.min(seconds, maxRunSeconds);
}
