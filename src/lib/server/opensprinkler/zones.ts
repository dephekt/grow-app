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
  emitterGph: number | null;
  maxRunSeconds: number;
  vwcEntityId: string | null;
  pwecEntityId: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ZoneCreate {
  name: string;
  stationSid: number;
  substrateType?: string | null;
  substrateVolumeMl?: number | null;
  drippers?: number | null;
  emitterGph?: number | null;
  maxRunSeconds?: number;
  vwcEntityId?: string | null;
  pwecEntityId?: string | null;
  enabled?: boolean;
}

export type ZonePatch = Partial<ZoneCreate>;

interface ZoneRow {
  id: string;
  name: string;
  station_sid: number;
  substrate_type: string | null;
  substrate_volume_ml: number | null;
  drippers: number | null;
  emitter_gph: number | null;
  max_run_seconds: number;
  vwc_entity_id: string | null;
  pwec_entity_id: string | null;
  enabled: number;
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
    emitterGph: row.emitter_gph,
    maxRunSeconds: row.max_run_seconds,
    vwcEntityId: row.vwc_entity_id,
    pwecEntityId: row.pwec_entity_id,
    enabled: Boolean(row.enabled),
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
       emitter_gph, max_run_seconds, vwc_entity_id, pwec_entity_id, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.name,
    input.stationSid,
    input.substrateType ?? null,
    input.substrateVolumeMl ?? null,
    input.drippers ?? null,
    input.emitterGph ?? null,
    input.maxRunSeconds ?? 300,
    input.vwcEntityId ?? null,
    input.pwecEntityId ?? null,
    input.enabled === false ? 0 : 1,
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
    ...('emitterGph' in patch ? { emitterGph: patch.emitterGph ?? null } : {}),
    ...('maxRunSeconds' in patch ? { maxRunSeconds: patch.maxRunSeconds ?? existing.maxRunSeconds } : {}),
    ...('vwcEntityId' in patch ? { vwcEntityId: patch.vwcEntityId ?? null } : {}),
    ...('pwecEntityId' in patch ? { pwecEntityId: patch.pwecEntityId ?? null } : {}),
    ...('enabled' in patch ? { enabled: patch.enabled !== false } : {}),
    updatedAt: new Date().toISOString()
  };

  db.prepare(
    `UPDATE zones SET name = ?, station_sid = ?, substrate_type = ?, substrate_volume_ml = ?,
       drippers = ?, emitter_gph = ?, max_run_seconds = ?, vwc_entity_id = ?, pwec_entity_id = ?,
       enabled = ?, updated_at = ? WHERE id = ?`
  ).run(
    merged.name,
    merged.stationSid,
    merged.substrateType,
    merged.substrateVolumeMl,
    merged.drippers,
    merged.emitterGph,
    merged.maxRunSeconds,
    merged.vwcEntityId,
    merged.pwecEntityId,
    merged.enabled ? 1 : 0,
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
}

export function recordEvent(db: DatabaseSync, event: IrrigationEvent): void {
  db.prepare(
    `INSERT INTO irrigation_events (zone_id, station_sid, source, requested_percent, requested_ml, seconds, actor, ts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    event.zoneId,
    event.stationSid,
    event.source ?? 'manual',
    event.requestedPercent ?? null,
    event.requestedMl ?? null,
    event.seconds,
    event.actor ?? null,
    new Date().toISOString()
  );
}
