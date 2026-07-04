import type { ZoneCreate, ZonePatch } from './zones';

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
