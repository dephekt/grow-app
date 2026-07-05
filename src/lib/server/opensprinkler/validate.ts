import type { ZoneCreate, ZonePatch } from './zones';
import type { ScheduleCreate, SchedulePatch } from './schedules';

/**
 * Pure request-body validation for zone create/update. Throws a caller-friendly
 * Error (→ HTTP 400) on bad input. Kept separate from the store + endpoints so it
 * unit-tests as plain functions.
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

export function parseZoneCreate(body: Record<string, unknown>): ZoneCreate {
  return {
    name: requireName(body.name),
    stationSid: requireStationSid(body.stationSid),
    substrateType: optString(body.substrateType),
    substrateVolumeMl: optPositiveNumber(body.substrateVolumeMl, 'substrateVolumeMl'),
    drippers: optPositiveInt(body.drippers, 'drippers'),
    emitterLph: optPositiveNumber(body.emitterLph, 'emitterLph'),
    maxRunSeconds: body.maxRunSeconds == null ? 300 : requirePositiveInt(body.maxRunSeconds, 'maxRunSeconds'),
    vwcEntityId: optString(body.vwcEntityId),
    pwecEntityId: optString(body.pwecEntityId),
    enabled: body.enabled == null ? true : requireBoolean(body.enabled, 'enabled')
  };
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
  if ('vwcEntityId' in body) patch.vwcEntityId = optString(body.vwcEntityId);
  if ('pwecEntityId' in body) patch.pwecEntityId = optString(body.pwecEntityId);
  if ('enabled' in body) patch.enabled = requireBoolean(body.enabled, 'enabled');
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
 *  same invariant the DB CHECK enforces, surfaced here as a 400 instead of a 500. */
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
