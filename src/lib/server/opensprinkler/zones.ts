// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { stationEntityId } from './discovery';

/** An irrigation zone: one OpenSprinkler station plus the substrate/emitter spec
 *  that lets a shot be expressed as % of volume / mL / seconds. */
export interface Zone {
  id: string;
  name: string;
  stationSid: number;
  substrateType: string | null;
  substrateVolumeMl: number | null;
  drippers: number | null;
  emitterLph: number | null;
  maxRunSeconds: number;
  /** MQTT node id of the TEROS probe in this zone ("substrate-a"), or null if unbound.
   *  Selects the calibration curve applied to its raw counts — see `$lib/substrate`. */
  substrateNodeId: string | null;
  /** Threshold bands for the bound probe's readings. A null end is an open side.
   *  VWC is a PERCENT here, matching every grower-facing surface; the reading it
   *  bounds is m³/m³, so the two differ by 100x. */
  vwcMinPct: number | null;
  vwcMaxPct: number | null;
  substrateTempMinC: number | null;
  substrateTempMaxC: number | null;
  pwecMin: number | null;
  pwecMax: number | null;
  enabled: boolean;
  /** When true, the scheduler skips ALL of this zone's schedules (they stay configured and
   *  resume unchanged when un-paused). Manual runs are unaffected — that's the difference from
   *  `enabled`, which also blocks manual actuation. */
  schedulesPaused: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ZoneCreate {
  name: string;
  stationSid: number;
  substrateType?: string | null;
  substrateVolumeMl?: number | null;
  drippers?: number | null;
  emitterLph?: number | null;
  maxRunSeconds?: number;
  substrateNodeId?: string | null;
  vwcMinPct?: number | null;
  vwcMaxPct?: number | null;
  substrateTempMinC?: number | null;
  substrateTempMaxC?: number | null;
  pwecMin?: number | null;
  pwecMax?: number | null;
  enabled?: boolean;
  schedulesPaused?: boolean;
}

export type ZonePatch = Partial<ZoneCreate>;

interface ZoneRow {
  id: string;
  name: string;
  station_sid: number;
  substrate_type: string | null;
  substrate_volume_ml: number | null;
  drippers: number | null;
  emitter_l_per_hr: number | null;
  max_run_seconds: number;
  substrate_node_id: string | null;
  vwc_min_pct: number | null;
  vwc_max_pct: number | null;
  substrate_temp_min_c: number | null;
  substrate_temp_max_c: number | null;
  pwec_min: number | null;
  pwec_max: number | null;
  enabled: number;
  schedules_paused: number;
  created_at: string;
  updated_at: string;
}

function toZone(row: ZoneRow): Zone {
  return {
    id: row.id,
    name: row.name,
    stationSid: row.station_sid,
    substrateType: row.substrate_type,
    substrateVolumeMl: row.substrate_volume_ml,
    drippers: row.drippers,
    emitterLph: row.emitter_l_per_hr,
    maxRunSeconds: row.max_run_seconds,
    substrateNodeId: row.substrate_node_id,
    vwcMinPct: row.vwc_min_pct,
    vwcMaxPct: row.vwc_max_pct,
    substrateTempMinC: row.substrate_temp_min_c,
    substrateTempMaxC: row.substrate_temp_max_c,
    pwecMin: row.pwec_min,
    pwecMax: row.pwec_max,
    enabled: Boolean(row.enabled),
    schedulesPaused: Boolean(row.schedules_paused),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/** Zone plus the derived entity id the frontend uses to read live station state. */
export function toZoneJson(zone: Zone): Zone & { stationEntityId: string } {
  return { ...zone, stationEntityId: stationEntityId(zone.stationSid) };
}

export function listZones(db: DatabaseSync): Zone[] {
  const rows = db.prepare('SELECT * FROM zones ORDER BY station_sid, name').all() as unknown as ZoneRow[];
  return rows.map(toZone);
}

export function getZone(db: DatabaseSync, id: string): Zone | undefined {
  const row = db.prepare('SELECT * FROM zones WHERE id = ?').get(id) as ZoneRow | undefined;
  return row ? toZone(row) : undefined;
}

export function createZone(db: DatabaseSync, input: ZoneCreate): Zone {
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO zones (id, name, station_sid, substrate_type, substrate_volume_ml, drippers,
       emitter_l_per_hr, max_run_seconds, substrate_node_id,
       vwc_min_pct, vwc_max_pct, substrate_temp_min_c, substrate_temp_max_c, pwec_min, pwec_max,
       enabled, schedules_paused, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.name,
    input.stationSid,
    input.substrateType ?? null,
    input.substrateVolumeMl ?? null,
    input.drippers ?? null,
    input.emitterLph ?? null,
    input.maxRunSeconds ?? 300,
    input.substrateNodeId ?? null,
    input.vwcMinPct ?? null,
    input.vwcMaxPct ?? null,
    input.substrateTempMinC ?? null,
    input.substrateTempMaxC ?? null,
    input.pwecMin ?? null,
    input.pwecMax ?? null,
    input.enabled === false ? 0 : 1,
    input.schedulesPaused === true ? 1 : 0,
    now,
    now
  );
  return getZone(db, id)!;
}

export function updateZone(db: DatabaseSync, id: string, patch: ZonePatch): Zone | undefined {
  const existing = getZone(db, id);
  if (!existing) return undefined;

  const merged: Zone = {
    ...existing,
    ...('name' in patch ? { name: patch.name! } : {}),
    ...('stationSid' in patch ? { stationSid: patch.stationSid! } : {}),
    ...('substrateType' in patch ? { substrateType: patch.substrateType ?? null } : {}),
    ...('substrateVolumeMl' in patch ? { substrateVolumeMl: patch.substrateVolumeMl ?? null } : {}),
    ...('drippers' in patch ? { drippers: patch.drippers ?? null } : {}),
    ...('emitterLph' in patch ? { emitterLph: patch.emitterLph ?? null } : {}),
    ...('maxRunSeconds' in patch ? { maxRunSeconds: patch.maxRunSeconds ?? existing.maxRunSeconds } : {}),
    ...('substrateNodeId' in patch ? { substrateNodeId: patch.substrateNodeId ?? null } : {}),
    ...('vwcMinPct' in patch ? { vwcMinPct: patch.vwcMinPct ?? null } : {}),
    ...('vwcMaxPct' in patch ? { vwcMaxPct: patch.vwcMaxPct ?? null } : {}),
    ...('substrateTempMinC' in patch ? { substrateTempMinC: patch.substrateTempMinC ?? null } : {}),
    ...('substrateTempMaxC' in patch ? { substrateTempMaxC: patch.substrateTempMaxC ?? null } : {}),
    ...('pwecMin' in patch ? { pwecMin: patch.pwecMin ?? null } : {}),
    ...('pwecMax' in patch ? { pwecMax: patch.pwecMax ?? null } : {}),
    ...('enabled' in patch ? { enabled: patch.enabled === true } : {}),
    ...('schedulesPaused' in patch ? { schedulesPaused: patch.schedulesPaused === true } : {}),
    updatedAt: new Date().toISOString()
  };

  db.prepare(
    `UPDATE zones SET name = ?, station_sid = ?, substrate_type = ?, substrate_volume_ml = ?,
       drippers = ?, emitter_l_per_hr = ?, max_run_seconds = ?,
       substrate_node_id = ?, vwc_min_pct = ?, vwc_max_pct = ?, substrate_temp_min_c = ?,
       substrate_temp_max_c = ?, pwec_min = ?, pwec_max = ?,
       enabled = ?, schedules_paused = ?, updated_at = ? WHERE id = ?`
  ).run(
    merged.name,
    merged.stationSid,
    merged.substrateType,
    merged.substrateVolumeMl,
    merged.drippers,
    merged.emitterLph,
    merged.maxRunSeconds,
    merged.substrateNodeId,
    merged.vwcMinPct,
    merged.vwcMaxPct,
    merged.substrateTempMinC,
    merged.substrateTempMaxC,
    merged.pwecMin,
    merged.pwecMax,
    merged.enabled ? 1 : 0,
    merged.schedulesPaused ? 1 : 0,
    merged.updatedAt,
    id
  );
  return getZone(db, id);
}

export function deleteZone(db: DatabaseSync, id: string): boolean {
  const result = db.prepare('DELETE FROM zones WHERE id = ?').run(id);
  return Number(result.changes) > 0;
}

export interface IrrigationEvent {
  zoneId: string;
  stationSid: number;
  source?: string;
  requestedPercent?: number | null;
  requestedMl?: number | null;
  seconds: number;
  actor?: string | null;
  /** Set for scheduler-driven runs; links the audit row back to its schedule. */
  scheduleId?: string | null;
}

export function recordEvent(db: DatabaseSync, event: IrrigationEvent): void {
  db.prepare(
    `INSERT INTO irrigation_events (zone_id, station_sid, source, requested_percent, requested_ml, seconds, actor, schedule_id, ts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    event.zoneId,
    event.stationSid,
    event.source ?? 'manual',
    event.requestedPercent ?? null,
    event.requestedMl ?? null,
    event.seconds,
    event.actor ?? null,
    event.scheduleId ?? null,
    new Date().toISOString()
  );
}
