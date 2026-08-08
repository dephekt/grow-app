// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import type { ZoneCreate, ZonePatch } from './zones';
import type { ScheduleCreate, SchedulePatch } from './schedules';
import type { SubstrateProbePatch } from './probes';

/**
 * Pure request-body validation for zone create/update; throws a caller-friendly
 * Error (→ HTTP 400) on bad input.
 */

function requireName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('name is required');
  return value.trim();
}

function requireStationSid(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error('stationSid must be a non-negative integer');
  return n;
}

function optString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') throw new Error('expected a string');
  return value.trim() || null;
}

function optPositiveNumber(value: unknown, field: string): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${field} must be a positive number`);
  return n;
}

/** A threshold bound: a finite number inside `[lo, hi]`, or null for an open side. */
function optBound(value: unknown, field: string, lo: number, hi: number): number | null {
  if (value == null) return null;
  // A bound may legitimately be 0, so this cannot lean on `n <= 0` to reject the values
  // Number() coerces to it — '', '  ', [] and false are all 0 and all finite.
  if (typeof value === 'string' && value.trim() === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') throw new Error(`${field} must be a number`);
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${field} must be a number`);
  if (n < lo || n > hi) throw new Error(`${field} must be between ${lo} and ${hi}`);
  return n;
}

function optPositiveInt(value: unknown, field: string): number | null {
  const n = optPositiveNumber(value, field);
  if (n != null && !Number.isInteger(n)) throw new Error(`${field} must be a positive integer`);
  return n;
}

function requirePositiveInt(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${field} must be a positive integer`);
  return n;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${field} must be a boolean`);
  return value;
}

/** The three substrate threshold bands and the range each bound must fall inside. */
const THRESHOLD_BANDS = [
  { min: 'vwcMinPct', max: 'vwcMaxPct', label: 'VWC', lo: 0, hi: 100 },
  { min: 'substrateTempMinC', max: 'substrateTempMaxC', label: 'Substrate temperature', lo: -40, hi: 60 },
  { min: 'pwecMin', max: 'pwecMax', label: 'Pore EC', lo: 0, hi: 50 }
] as const;

/** Tied to ZoneCreate, so renaming a bound on either side fails to compile. */
type ThresholdKey = (typeof THRESHOLD_BANDS)[number]['min' | 'max'] & keyof ZoneCreate;

type Thresholds = Partial<Record<ThresholdKey, number | null>>;

/** The bounds `body` carries, each validated on its own. */
function zoneThresholds(body: Record<string, unknown>, onlyPresent: boolean): Thresholds {
  const out: Thresholds = {};
  for (const band of THRESHOLD_BANDS) {
    for (const key of [band.min, band.max] as const) {
      if (onlyPresent && !(key in body)) continue;
      out[key] = optBound(body[key], key, band.lo, band.hi);
    }
  }
  return out;
}

/** Rejects a band whose ends cross — no reading could satisfy it. */
export function assertZoneBands(zone: Thresholds): void {
  for (const band of THRESHOLD_BANDS) {
    const min = zone[band.min];
    const max = zone[band.max];
    if (min != null && max != null && min > max) {
      throw new Error(`${band.label} minimum (${min}) must not exceed its maximum (${max})`);
    }
  }
}

export function parseZoneCreate(body: Record<string, unknown>): ZoneCreate {
  const zone: ZoneCreate = {
    name: requireName(body.name),
    stationSid: requireStationSid(body.stationSid),
    substrateType: optString(body.substrateType),
    substrateVolumeMl: optPositiveNumber(body.substrateVolumeMl, 'substrateVolumeMl'),
    drippers: optPositiveInt(body.drippers, 'drippers'),
    emitterLph: optPositiveNumber(body.emitterLph, 'emitterLph'),
    maxRunSeconds: body.maxRunSeconds == null ? 300 : requirePositiveInt(body.maxRunSeconds, 'maxRunSeconds'),
    ...zoneThresholds(body, false),
    enabled: body.enabled == null ? true : requireBoolean(body.enabled, 'enabled'),
    schedulesPaused: body.schedulesPaused == null ? false : requireBoolean(body.schedulesPaused, 'schedulesPaused')
  };
  assertZoneBands(zone);
  return zone;
}

export function parseZonePatch(body: Record<string, unknown>): ZonePatch {
  const patch: ZonePatch = {};
  if ('name' in body) patch.name = requireName(body.name);
  if ('stationSid' in body) patch.stationSid = requireStationSid(body.stationSid);
  if ('substrateType' in body) patch.substrateType = optString(body.substrateType);
  if ('substrateVolumeMl' in body) patch.substrateVolumeMl = optPositiveNumber(body.substrateVolumeMl, 'substrateVolumeMl');
  if ('drippers' in body) patch.drippers = optPositiveInt(body.drippers, 'drippers');
  if ('emitterLph' in body) patch.emitterLph = optPositiveNumber(body.emitterLph, 'emitterLph');
  if ('maxRunSeconds' in body) patch.maxRunSeconds = requirePositiveInt(body.maxRunSeconds, 'maxRunSeconds');
  Object.assign(patch, zoneThresholds(body, true));
  if ('enabled' in body) patch.enabled = requireBoolean(body.enabled, 'enabled');
  if ('schedulesPaused' in body) patch.schedulesPaused = requireBoolean(body.schedulesPaused, 'schedulesPaused');
  return patch;
}

/** A probe binding patch: an absent field is left alone, an explicit null clears it. */
export function parseProbePatch(body: Record<string, unknown>): SubstrateProbePatch {
  const patch: SubstrateProbePatch = {};
  if ('zoneId' in body) patch.zoneId = optString(body.zoneId);
  if ('name' in body) patch.name = optString(body.name);
  return patch;
}

function requireId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

/** Parse a single "HH:MM" wall time to canonical minutes-past-local-midnight (0..1439). */
export function parseHhMm(value: unknown): number {
  if (typeof value !== 'string') throw new Error('time must be an "HH:MM" string');
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) throw new Error(`invalid time "${value}" (expected HH:MM)`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error(`invalid time "${value}" (out of range)`);
  return hours * 60 + minutes;
}

/** A non-empty array of "HH:MM" strings → deduped, sorted canonical minutes. */
function parseTimes(value: unknown): number[] {
  if (!Array.isArray(value)) throw new Error('times must be an array of "HH:MM" strings');
  const unique = [...new Set(value.map(parseHhMm))].sort((a, b) => a - b);
  if (unique.length === 0) throw new Error('at least one time is required');
  return unique;
}

/** Exactly one of shotPercent / shotMl / shotSeconds must be a positive value — the
 *  same invariant the DB CHECK enforces. */
function parseShot(body: Record<string, unknown>): Pick<ScheduleCreate, 'shotPercent' | 'shotMl' | 'shotSeconds'> {
  const shotPercent = optPositiveNumber(body.shotPercent, 'shotPercent');
  const shotMl = optPositiveNumber(body.shotMl, 'shotMl');
  const shotSeconds = optPositiveInt(body.shotSeconds, 'shotSeconds');
  const set = [shotPercent, shotMl, shotSeconds].filter((v) => v != null).length;
  if (set !== 1) throw new Error('provide exactly one of shotPercent, shotMl, or shotSeconds');
  return { shotPercent, shotMl, shotSeconds };
}

export function parseScheduleCreate(body: Record<string, unknown>): ScheduleCreate {
  return {
    zoneId: requireId(body.zoneId, 'zoneId'),
    name: optString(body.name),
    times: parseTimes(body.times),
    ...parseShot(body),
    enabled: body.enabled == null ? true : requireBoolean(body.enabled, 'enabled')
  };
}

export function parseSchedulePatch(body: Record<string, unknown>): SchedulePatch {
  const patch: SchedulePatch = {};
  if ('name' in body) patch.name = optString(body.name);
  if ('times' in body) patch.times = parseTimes(body.times);
  if ('enabled' in body) patch.enabled = requireBoolean(body.enabled, 'enabled');
  // The shot moves as a set: any shot key present re-validates all three (exactly one).
  if ('shotPercent' in body || 'shotMl' in body || 'shotSeconds' in body) {
    const shot = parseShot(body);
    patch.shotPercent = shot.shotPercent;
    patch.shotMl = shot.shotMl;
    patch.shotSeconds = shot.shotSeconds;
  }
  return patch;
}
