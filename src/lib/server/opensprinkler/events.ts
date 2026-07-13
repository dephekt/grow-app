import type { DatabaseSync } from 'node:sqlite';
import { IRRIGATION_NODE, RUNOFF_NODE, PUMP_DRAW_MIN_W } from '$lib/irrigation/model';

/**
 * Reader + runoff writer for the irrigation history feed (grow-app #81). The
 * `irrigation_events` table (see db.ts) is the authoritative log; zone runs are written
 * at fire time by recordEvent() (zones.ts), runoff-pump runs by the runoff monitor. This
 * module turns those rows into one mixed, newest-first feed and enriches each row with the
 * pump energy drawn during its run (cached from InfluxDB — the async fill lives in the API
 * route so this stays pure/sync and unit-testable).
 */

export type EventKind = 'irrigation' | 'runoff';

/** Extra seconds past the requested run included in the pump-draw window. The accumulator
 *  tank decouples valve-open from pump-draw, so a short shot's draw often lands as a brief
 *  repressurization pulse just after the valve closes; capturing it keeps the energy honest
 *  and avoids false "no draw" flags on legitimately-served short shots. */
export const ENRICH_POST_GRACE_SECONDS = 30;

/** Additional wait after the window end before a row is eligible for measurement, so the
 *  recorder sidecar has landed the last pump-power samples in InfluxDB. */
export const ENERGY_SETTLE_SECONDS = 20;

export interface IrrigationEventJson {
  id: number;
  kind: EventKind;
  /** ISO of the run start (≈ valve open / pump start). */
  ts: string;
  zoneId: string | null;
  /** Current zone name via join; null for runoff events or a since-deleted zone. */
  zoneName: string | null;
  stationSid: number | null;
  source: string;
  actor: string | null;
  requestedPercent: number | null;
  requestedMl: number | null;
  /** Requested/clamped seconds for a zone run; measured duration for a runoff run. */
  seconds: number | null;
  scheduleId: string | null;
  /** Pump energy drawn over the run window (Wh); null until measured. */
  energyWh: number | null;
  /** Peak pump power over the run window (W); null until measured. */
  peakW: number | null;
  /** Soft warning: the window was measured and the pump never crossed the draw floor.
   *  Irrigation events only — a runoff event only exists because the pump ran. */
  noDraw: boolean;
}

interface EventRow {
  id: number;
  kind: string;
  ts: string;
  zone_id: string | null;
  zone_name: string | null;
  station_sid: number | null;
  source: string;
  actor: string | null;
  requested_percent: number | null;
  requested_ml: number | null;
  seconds: number | null;
  schedule_id: string | null;
  pump_energy_wh: number | null;
  pump_peak_w: number | null;
}

function normalizeKind(kind: string): EventKind {
  return kind === 'runoff' ? 'runoff' : 'irrigation';
}

export function toEventJson(row: EventRow): IrrigationEventJson {
  const kind = normalizeKind(row.kind);
  const measured = row.pump_peak_w !== null;
  return {
    id: row.id,
    kind,
    ts: row.ts,
    zoneId: row.zone_id,
    zoneName: row.zone_name,
    stationSid: row.station_sid,
    source: row.source,
    actor: row.actor,
    requestedPercent: row.requested_percent,
    requestedMl: row.requested_ml,
    seconds: row.seconds,
    scheduleId: row.schedule_id,
    energyWh: row.pump_energy_wh,
    peakW: row.pump_peak_w,
    noDraw: kind === 'irrigation' && measured && (row.pump_peak_w as number) < PUMP_DRAW_MIN_W
  };
}

/** The mixed history feed, newest first. LEFT JOIN zones so each row carries the current
 *  zone name (null once a zone is deleted — the run still happened). */
export function listEvents(db: DatabaseSync, limit = 100): IrrigationEventJson[] {
  const rows = db
    .prepare(
      `SELECT e.id, e.kind, e.ts, e.zone_id, z.name AS zone_name, e.station_sid, e.source, e.actor,
              e.requested_percent, e.requested_ml, e.seconds, e.schedule_id, e.pump_energy_wh, e.pump_peak_w
       FROM irrigation_events e
       LEFT JOIN zones z ON z.id = e.zone_id
       ORDER BY e.ts DESC, e.id DESC
       LIMIT ?`
    )
    .all(limit) as unknown as EventRow[];
  return rows.map(toEventJson);
}

/** Persist a runoff-pump run at its start. Duration is left null — a runoff burst is often a
 *  single power sample, so it can't be measured; the row leads with pump energy instead, filled
 *  in by the same lazy enrichment as zone runs (over a fixed post-start window since seconds is
 *  null). */
export function recordRunoffEvent(db: DatabaseSync, event: { startedAt: string }): void {
  db.prepare(
    `INSERT INTO irrigation_events (kind, source, actor, seconds, ts)
     VALUES ('runoff', 'runoff', 'monitor', NULL, ?)`
  ).run(event.startedAt);
}

/** The Influx tag pair identifying the pump plug for a given event kind. Both tags must be
 *  filtered together: the two plugs publish colliding objectIds (see model.ts). */
export function pumpTagsForKind(kind: EventKind): { node: string; entity: string } {
  return kind === 'runoff'
    ? { node: RUNOFF_NODE, entity: 'runoff_pump_power' }
    : { node: IRRIGATION_NODE, entity: 'pump_power' };
}

/** A run has settled (its full window plus the Influx-lag grace has elapsed) and can be
 *  measured. Guards the lazy enrichment so an in-flight run is never integrated early. */
export function isSettled(ts: string, seconds: number | null, nowMs: number): boolean {
  const startMs = Date.parse(ts);
  if (!Number.isFinite(startMs)) return false;
  const endMs = startMs + ((seconds ?? 0) + ENRICH_POST_GRACE_SECONDS + ENERGY_SETTLE_SECONDS) * 1000;
  return nowMs >= endMs;
}

/** The InfluxDB query window for an event: [ts, ts + seconds + post-grace]. */
export function eventWindow(ts: string, seconds: number | null): { startIso: string; stopIso: string } {
  const startMs = Date.parse(ts);
  const stopMs = startMs + ((seconds ?? 0) + ENRICH_POST_GRACE_SECONDS) * 1000;
  return { startIso: new Date(startMs).toISOString(), stopIso: new Date(stopMs).toISOString() };
}

export interface PendingEnergyRow {
  id: number;
  kind: EventKind;
  ts: string;
  seconds: number | null;
}

/** Stop retrying rows older than this. A row still unmeasured after this long is a permanent
 *  data gap (Influx retention, an offline stretch, or a diagnostic-category sensor the recorder
 *  skips), so it should drop out of the pending set instead of re-querying forever and crowding
 *  out newer rows. */
export const ENERGY_RETRY_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

/** Settled, not-yet-measured rows needing an energy backfill (newest first, bounded). Pure and
 *  sync; the caller runs the async Influx integral and calls markEventEnergy(). Age-bounds in SQL
 *  so ancient unmeasurable rows leave the candidate set, and applies `limit` AFTER the settled
 *  filter so perpetually-pending rows can't starve older settled ones sorted behind them. */
export function listEnergyPending(db: DatabaseSync, nowMs: number, limit = 100): PendingEnergyRow[] {
  const minTs = new Date(nowMs - ENERGY_RETRY_MAX_AGE_MS).toISOString();
  const rows = db
    .prepare(
      `SELECT id, kind, ts, seconds FROM irrigation_events
       WHERE pump_peak_w IS NULL AND ts >= ?
       ORDER BY ts DESC`
    )
    .all(minTs) as Array<{ id: number; kind: string; ts: string; seconds: number | null }>;
  return rows
    .map((r) => ({ id: r.id, kind: normalizeKind(r.kind), ts: r.ts, seconds: r.seconds }))
    .filter((r) => isSettled(r.ts, r.seconds, nowMs))
    .slice(0, limit);
}

/** Cache a measured energy/peak onto a row. Writing a non-null peak (even a below-floor one)
 *  marks the row measured, so it is never re-queried and a below-floor peak becomes noDraw. */
export function markEventEnergy(db: DatabaseSync, id: number, energyWh: number, peakW: number): void {
  db.prepare(`UPDATE irrigation_events SET pump_energy_wh = ?, pump_peak_w = ? WHERE id = ?`).run(energyWh, peakW, id);
}
