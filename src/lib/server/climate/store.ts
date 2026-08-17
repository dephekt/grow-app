// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import type { DatabaseSync } from 'node:sqlite';
import {
  AIR_VPD_HARD_MAX,
  AIR_VPD_HARD_MIN,
  CLIMATE_MODES,
  DEFAULT_CLIMATE_CONFIG,
  type ActuatorSource,
  type ClimateConfig,
  type ClimateMode
} from '$lib/climate/model';
import type { ClimateAction } from '$lib/climate/decide';

interface ConfigRow {
  mode: string;
  exhaust_source: string;
  rh_source: string;
  deadband_kpa: number;
  min_on_seconds: number;
  min_off_seconds: number;
  min_gain_kpa: number;
  vent_always_above_c: number;
  vent_never_below_c: number;
  air_vpd_override: number | null;
  updated_at: string;
}

const SOURCES: ActuatorSource[] = ['loop', 'firmware', 'external', 'none'];

function asMode(raw: string): ClimateMode {
  return (CLIMATE_MODES as string[]).includes(raw)
    ? (raw as ClimateMode)
    : DEFAULT_CLIMATE_CONFIG.mode;
}

function asSource(raw: string, fallback: ActuatorSource): ActuatorSource {
  return (SOURCES as string[]).includes(raw) ? (raw as ActuatorSource) : fallback;
}

export function getClimateConfig(db: DatabaseSync): ClimateConfig {
  const row = db.prepare('SELECT * FROM climate_config WHERE id = 1').get() as
    ConfigRow | undefined;
  if (!row) return { ...DEFAULT_CLIMATE_CONFIG };
  return {
    mode: asMode(row.mode),
    exhaustSource: asSource(row.exhaust_source, DEFAULT_CLIMATE_CONFIG.exhaustSource),
    rhSource: asSource(row.rh_source, DEFAULT_CLIMATE_CONFIG.rhSource),
    deadbandKpa: clamped('deadbandKpa', row.deadband_kpa),
    minOnSeconds: clamped('minOnSeconds', row.min_on_seconds),
    minOffSeconds: clamped('minOffSeconds', row.min_off_seconds),
    minGainKpa: clamped('minGainKpa', row.min_gain_kpa),
    ventAlwaysAboveC: clamped('ventAlwaysAboveC', row.vent_always_above_c),
    ventNeverBelowC: clamped('ventNeverBelowC', row.vent_never_below_c),
    airVpdOverride:
      row.air_vpd_override === null ? null : clamped('airVpdOverride', row.air_vpd_override)
  };
}

export class ClimateConfigError extends Error {}

type NumericKey =
  | 'deadbandKpa'
  | 'minOnSeconds'
  | 'minOffSeconds'
  | 'minGainKpa'
  | 'ventAlwaysAboveC'
  | 'ventNeverBelowC'
  | 'airVpdOverride';

/** Keyed to the union, so adding a numeric field without its bounds is a compile error rather
 *  than a raw TypeError that escapes the route's ClimateConfigError handler as a 500. */
const NUMERIC_BOUNDS: Record<NumericKey, { min: number; max: number }> = {
  deadbandKpa: { min: 0.01, max: 0.4 },
  minOnSeconds: { min: 0, max: 3600 },
  minOffSeconds: { min: 0, max: 3600 },
  minGainKpa: { min: 0, max: 1 },
  ventAlwaysAboveC: { min: 20, max: 45 },
  ventNeverBelowC: { min: 5, max: 30 },
  // The book's hard rails, because controlBand clamps the target into them anyway: a wider
  // range here would accept 1.50, regulate 1.20, and print "overridden 1.50" on /climate.
  airVpdOverride: { min: AIR_VPD_HARD_MIN, max: AIR_VPD_HARD_MAX }
};

/** The read path distrusts the enum columns already; a row predating NUMERIC_BOUNDS, restored
 *  from an older backup or hand-edited would otherwise hand the loop a 24 h minimum-on. */
function clamped(key: NumericKey, value: number): number {
  const bounds = NUMERIC_BOUNDS[key];
  if (!Number.isFinite(value)) return DEFAULT_CLIMATE_CONFIG[key] ?? bounds.min;
  return Math.min(bounds.max, Math.max(bounds.min, value));
}

function checkNumber(key: NumericKey, value: number): number {
  const bounds = NUMERIC_BOUNDS[key];
  if (!Number.isFinite(value)) throw new ClimateConfigError(`${key} must be a number`);
  if (value < bounds.min || value > bounds.max) {
    throw new ClimateConfigError(`${key} must be between ${bounds.min} and ${bounds.max}`);
  }
  return value;
}

/** Apply a partial config update, validating every field before any of it is written. */
export function updateClimateConfig(
  db: DatabaseSync,
  patch: Partial<ClimateConfig>,
  nowIso: string
): ClimateConfig {
  const current = getClimateConfig(db);
  const next: ClimateConfig = { ...current };

  if (patch.mode !== undefined) {
    if (!(CLIMATE_MODES as string[]).includes(patch.mode))
      throw new ClimateConfigError('unknown mode');
    next.mode = patch.mode;
  }
  for (const key of ['exhaustSource', 'rhSource'] as const) {
    const value = patch[key];
    if (value !== undefined) {
      if (!(SOURCES as string[]).includes(value)) throw new ClimateConfigError(`unknown ${key}`);
      next[key] = value;
    }
  }
  for (const key of [
    'deadbandKpa',
    'minOnSeconds',
    'minOffSeconds',
    'minGainKpa',
    'ventAlwaysAboveC',
    'ventNeverBelowC'
  ] as const) {
    if (patch[key] !== undefined) next[key] = checkNumber(key, patch[key]);
  }
  if (patch.airVpdOverride !== undefined) {
    next.airVpdOverride =
      patch.airVpdOverride === null ? null : checkNumber('airVpdOverride', patch.airVpdOverride);
  }

  // A vent floor at or above the vent ceiling would both force and block the fan every tick.
  if (next.ventNeverBelowC >= next.ventAlwaysAboveC) {
    throw new ClimateConfigError('ventNeverBelowC must be below ventAlwaysAboveC');
  }

  // Upsert, because an UPDATE against a missing singleton row would report success and then be
  // contradicted by the PATCH response re-reading the DB.
  db.prepare(
    `INSERT INTO climate_config
       (id, mode, exhaust_source, rh_source, deadband_kpa, min_on_seconds, min_off_seconds,
        min_gain_kpa, vent_always_above_c, vent_never_below_c, air_vpd_override, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       mode = excluded.mode, exhaust_source = excluded.exhaust_source,
       rh_source = excluded.rh_source, deadband_kpa = excluded.deadband_kpa,
       min_on_seconds = excluded.min_on_seconds, min_off_seconds = excluded.min_off_seconds,
       min_gain_kpa = excluded.min_gain_kpa, vent_always_above_c = excluded.vent_always_above_c,
       vent_never_below_c = excluded.vent_never_below_c,
       air_vpd_override = excluded.air_vpd_override, updated_at = excluded.updated_at`
  ).run(
    next.mode,
    next.exhaustSource,
    next.rhSource,
    next.deadbandKpa,
    next.minOnSeconds,
    next.minOffSeconds,
    next.minGainKpa,
    next.ventAlwaysAboveC,
    next.ventNeverBelowC,
    next.airVpdOverride,
    nowIso
  );
  return next;
}

export interface ClimateEventInput {
  ts: string;
  action: ClimateAction;
  mode: ClimateMode;
  /** False in `observe`, where the loop decides and logs but never publishes. */
  published: boolean;
  airVpd: number | null;
  /** The short-window reading the band edges act on; `airVpd` remains the 5 min median. */
  airVpdFast: number | null;
  leafVpd: number | null;
  target: number;
  bandLow: number;
  bandHigh: number;
  tentTempC: number | null;
  tentRhPct: number | null;
  roomTempC: number | null;
  roomRhPct: number | null;
  lightsOn: boolean;
}

export interface ClimateEventJson extends Omit<ClimateEventInput, 'action'> {
  id: number;
  kind: ClimateAction['kind'];
  actuator: string | null;
  on: boolean | null;
  reason: string;
}

interface EventRow {
  id: number;
  ts: string;
  kind: string;
  actuator: string | null;
  on_state: number | null;
  reason: string;
  mode: string;
  published: number;
  air_vpd: number | null;
  air_vpd_fast: number | null;
  leaf_vpd: number | null;
  target: number | null;
  band_low: number | null;
  band_high: number | null;
  tent_temp_c: number | null;
  tent_rh_pct: number | null;
  room_temp_c: number | null;
  room_rh_pct: number | null;
  lights_on: number | null;
}

/** The actuator an action concerns, and the direction — null for a plain hold. */
function actionTarget(action: ClimateAction): { actuator: string | null; on: boolean | null } {
  switch (action.kind) {
    case 'exhaust':
      return { actuator: 'exhaust', on: action.on };
    case 'humidify':
      return { actuator: 'humidify', on: action.on };
    case 'delegated':
    case 'blocked':
      return { actuator: action.want, on: action.on };
    case 'hold':
      return { actuator: null, on: null };
  }
}

export function recordClimateEvent(db: DatabaseSync, event: ClimateEventInput): void {
  const { actuator, on } = actionTarget(event.action);
  db.prepare(
    `INSERT INTO climate_events
       (ts, kind, actuator, on_state, reason, mode, published, air_vpd, air_vpd_fast, leaf_vpd,
        target, band_low, band_high, tent_temp_c, tent_rh_pct, room_temp_c, room_rh_pct, lights_on)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    event.ts,
    event.action.kind,
    actuator,
    on === null ? null : on ? 1 : 0,
    event.action.reason,
    event.mode,
    event.published ? 1 : 0,
    event.airVpd,
    event.airVpdFast,
    event.leafVpd,
    event.target,
    event.bandLow,
    event.bandHigh,
    event.tentTempC,
    event.tentRhPct,
    event.roomTempC,
    event.roomRhPct,
    event.lightsOn ? 1 : 0
  );
}

function toEventJson(row: EventRow): ClimateEventJson {
  return {
    id: row.id,
    ts: row.ts,
    kind: row.kind as ClimateAction['kind'],
    actuator: row.actuator,
    on: row.on_state === null ? null : row.on_state === 1,
    reason: row.reason,
    mode: row.mode as ClimateMode,
    published: row.published === 1,
    airVpd: row.air_vpd,
    airVpdFast: row.air_vpd_fast,
    leafVpd: row.leaf_vpd,
    target: row.target ?? 0,
    bandLow: row.band_low ?? 0,
    bandHigh: row.band_high ?? 0,
    tentTempC: row.tent_temp_c,
    tentRhPct: row.tent_rh_pct,
    roomTempC: row.room_temp_c,
    roomRhPct: row.room_rh_pct,
    lightsOn: row.lights_on === 1
  };
}

/** Drop decisions older than `days`, returning how many went; `0` disables. Days only, no row
 *  cap — unlike the auth audit log, this table's write rate is bounded by the loop's own tick. */
export function pruneClimateEvents(db: DatabaseSync, nowMs: number, days: number): number {
  if (days <= 0) return 0;
  const cutoff = new Date(nowMs - days * 24 * 60 * 60 * 1000).toISOString();
  return Number(db.prepare('DELETE FROM climate_events WHERE ts < ?').run(cutoff).changes ?? 0);
}

/** Highest inserted event ID — freezes the row set across offset-based page requests. */
export function latestClimateEventId(db: DatabaseSync): number {
  const row = db.prepare('SELECT MAX(id) AS id FROM climate_events').get() as { id: number | null };
  return row.id ?? 0;
}

export function listClimateEvents(
  db: DatabaseSync,
  limit = 100,
  offset = 0,
  anchorId?: number
): ClimateEventJson[] {
  const where = anchorId === undefined ? '' : 'WHERE id <= ?';
  const params = anchorId === undefined ? [limit, offset] : [anchorId, limit, offset];
  const rows = db
    .prepare(`SELECT * FROM climate_events ${where} ORDER BY ts DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...params) as unknown as EventRow[];
  return rows.map(toEventJson);
}

export function countClimateEvents(db: DatabaseSync, anchorId?: number): number {
  const row = (
    anchorId === undefined
      ? db.prepare('SELECT COUNT(*) AS total FROM climate_events').get()
      : db.prepare('SELECT COUNT(*) AS total FROM climate_events WHERE id <= ?').get(anchorId)
  ) as { total: number };
  return row.total;
}
