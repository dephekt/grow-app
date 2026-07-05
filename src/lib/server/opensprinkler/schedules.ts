import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { computeScheduleDue } from './schedule-due';

/** A per-zone time-based irrigation schedule: a set of local wall-clock times and a
 *  shot size (exactly one of %/mL/seconds), fired by the reconciliation tick. `times`
 *  is canonical minutes-past-local-midnight (0..1439); HH:MM lives only at the edge. */
export interface Schedule {
  id: string;
  zoneId: string;
  name: string | null;
  mode: string;
  times: number[];
  shotPercent: number | null;
  shotMl: number | null;
  shotSeconds: number | null;
  enabled: boolean;
  /** ISO of the fired window instant (the due slot) — the dedup + skip-missed anchor. */
  lastFiredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleCreate {
  zoneId: string;
  name?: string | null;
  mode?: string;
  times: number[];
  shotPercent?: number | null;
  shotMl?: number | null;
  shotSeconds?: number | null;
  enabled?: boolean;
}

/** A schedule stays bound to its zone — `zoneId` is not patchable (create a new one
 *  on the other zone instead). The three shot fields move as a set: supplying any one
 *  replaces the whole triplet so the exactly-one-non-null CHECK always holds. */
export type SchedulePatch = Partial<Omit<ScheduleCreate, 'zoneId'>>;

interface ScheduleRow {
  id: string;
  zone_id: string;
  name: string | null;
  mode: string;
  times: string;
  shot_percent: number | null;
  shot_ml: number | null;
  shot_seconds: number | null;
  enabled: number;
  last_fired_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Defensive parse of the JSON times column: keep only integer minutes. The validator
 *  already normalizes on write, so a bad value here means hand-edited / corrupt data. */
function parseTimes(json: string): number[] {
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) ? value.filter((n) => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

function toSchedule(row: ScheduleRow): Schedule {
  return {
    id: row.id,
    zoneId: row.zone_id,
    name: row.name,
    mode: row.mode,
    times: parseTimes(row.times),
    shotPercent: row.shot_percent,
    shotMl: row.shot_ml,
    shotSeconds: row.shot_seconds,
    enabled: Boolean(row.enabled),
    lastFiredAt: row.last_fired_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function minutesToHhMm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export type ScheduleJson = Omit<Schedule, 'times'> & { times: string[]; nextDueAt: string | null };

/** Schedule as the frontend wants it: times back in HH:MM, plus the resolved next
 *  run instant (ISO) so the UI shows "Next run" without re-deriving the tz math. */
export function toScheduleJson(schedule: Schedule, nowMs: number, tz: string): ScheduleJson {
  const lastFiredMs = schedule.lastFiredAt ? Date.parse(schedule.lastFiredAt) : null;
  // nextDueAt is grace-independent, so any grace works here.
  const { nextDueAt } = computeScheduleDue(schedule.times, lastFiredMs, nowMs, tz, 0);
  return {
    ...schedule,
    times: schedule.times.map(minutesToHhMm),
    nextDueAt: nextDueAt !== null ? new Date(nextDueAt).toISOString() : null
  };
}

export function listSchedules(db: DatabaseSync, zoneId?: string): Schedule[] {
  const rows = zoneId
    ? (db.prepare('SELECT * FROM schedules WHERE zone_id = ? ORDER BY created_at').all(zoneId) as unknown as ScheduleRow[])
    : (db.prepare('SELECT * FROM schedules ORDER BY zone_id, created_at').all() as unknown as ScheduleRow[]);
  return rows.map(toSchedule);
}

/** Schedules eligible to fire: the schedule itself enabled AND its zone enabled. The
 *  JOIN drops schedules whose zone is disabled, so the tick never fires a paused zone.
 *  Ordered deterministically so that when two schedules share a station+slot, the same
 *  one wins the per-tick station claim every time (not left to the query planner). */
export function listActiveSchedules(db: DatabaseSync): Schedule[] {
  const rows = db
    .prepare(
      'SELECT s.* FROM schedules s JOIN zones z ON z.id = s.zone_id WHERE s.enabled = 1 AND z.enabled = 1 ORDER BY s.created_at, s.id'
    )
    .all() as unknown as ScheduleRow[];
  return rows.map(toSchedule);
}

export function getSchedule(db: DatabaseSync, id: string): Schedule | undefined {
  const row = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id) as ScheduleRow | undefined;
  return row ? toSchedule(row) : undefined;
}

export function createSchedule(db: DatabaseSync, input: ScheduleCreate): Schedule {
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO schedules (id, zone_id, name, mode, times, shot_percent, shot_ml, shot_seconds, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.zoneId,
    input.name ?? null,
    input.mode ?? 'time',
    JSON.stringify(input.times ?? []),
    input.shotPercent ?? null,
    input.shotMl ?? null,
    input.shotSeconds ?? null,
    input.enabled === false ? 0 : 1,
    now,
    now
  );
  return getSchedule(db, id)!;
}

export function updateSchedule(db: DatabaseSync, id: string, patch: SchedulePatch): Schedule | undefined {
  const existing = getSchedule(db, id);
  if (!existing) return undefined;

  // A shot change replaces the whole triplet (the validator guarantees exactly one is
  // present), so the exactly-one-non-null CHECK holds even when switching shot kinds.
  const shotChanged = 'shotPercent' in patch || 'shotMl' in patch || 'shotSeconds' in patch;

  const merged: Schedule = {
    ...existing,
    ...('name' in patch ? { name: patch.name ?? null } : {}),
    ...('mode' in patch ? { mode: patch.mode! } : {}),
    ...('times' in patch ? { times: patch.times! } : {}),
    ...('enabled' in patch ? { enabled: patch.enabled === true } : {}),
    ...(shotChanged
      ? { shotPercent: patch.shotPercent ?? null, shotMl: patch.shotMl ?? null, shotSeconds: patch.shotSeconds ?? null }
      : {}),
    updatedAt: new Date().toISOString()
  };

  db.prepare(
    `UPDATE schedules SET name = ?, mode = ?, times = ?, shot_percent = ?, shot_ml = ?, shot_seconds = ?,
       enabled = ?, updated_at = ? WHERE id = ?`
  ).run(
    merged.name,
    merged.mode,
    JSON.stringify(merged.times),
    merged.shotPercent,
    merged.shotMl,
    merged.shotSeconds,
    merged.enabled ? 1 : 0,
    merged.updatedAt,
    id
  );
  return getSchedule(db, id);
}

export function deleteSchedule(db: DatabaseSync, id: string): boolean {
  const result = db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
  return Number(result.changes) > 0;
}

/** Set the dedup + skip-missed anchor. `slotIso` is normally the fired slot instant;
 *  it accepts null so the scheduler can revert the anchor (even to a previously-null
 *  value) after a run rejection. Kept minimal — it deliberately does not bump
 *  updated_at (a fire is internal state, not an edit). */
export function markScheduleFired(db: DatabaseSync, id: string, slotIso: string | null): void {
  db.prepare('UPDATE schedules SET last_fired_at = ? WHERE id = ?').run(slotIso, id);
}
