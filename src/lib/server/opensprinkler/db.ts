import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { env } from '$lib/server/env';

// Ordered, append-only migrations. The index +1 is the schema version stored in
// `PRAGMA user_version`. Never edit an existing entry — add a new one. Mirrors the
// auth DB pattern (src/lib/server/auth/db.ts). Kept in a separate DB file from auth:
// different lifecycle, no cross-table FKs, and the read-only recorder never opens it.
const MIGRATIONS: string[] = [
  // 1 — irrigation zones + a manual-run audit log
  `
  CREATE TABLE zones (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    station_sid INTEGER NOT NULL UNIQUE,
    substrate_type TEXT,
    substrate_volume_ml REAL,
    drippers INTEGER,
    emitter_gph REAL,
    max_run_seconds INTEGER NOT NULL DEFAULT 300,
    vwc_entity_id TEXT,
    pwec_entity_id TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE irrigation_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zone_id TEXT,
    station_sid INTEGER,
    source TEXT NOT NULL DEFAULT 'manual',
    requested_percent REAL,
    requested_ml REAL,
    seconds INTEGER,
    actor TEXT,
    ts TEXT NOT NULL
  );
  CREATE INDEX irrigation_events_ts ON irrigation_events(ts);
  `,
  // 2 — canonical metric emitter flow. Rename emitter_gph -> emitter_l_per_hr and
  // convert any existing rows (they were entered as GPH under migration 1). Volume
  // is already metric (mL); the UI now offers unit selectors that convert to these.
  `
  ALTER TABLE zones RENAME COLUMN emitter_gph TO emitter_l_per_hr;
  UPDATE zones SET emitter_l_per_hr = ROUND(emitter_l_per_hr * 3.785411784, 2) WHERE emitter_l_per_hr IS NOT NULL;
  `,
  // 3 — per-zone time-based schedules. Many schedules per zone; the FK cascades so
  // deleting a zone reaps its schedules (foreign_keys is ON). `mode` is a discriminator
  // seam so 'cycles'/'sensor' can be added later without a schema change. `times` holds
  // canonical minutes-past-local-midnight ints as a JSON array (HH:MM lives only at the
  // UI/validator edge, mirroring the metric-canonical precedent). Exactly one of the
  // three shot columns is non-null — resolved to seconds at fire time so a later zone
  // spec change is honored. `last_fired_at` is the ISO of the fired window instant (the
  // due slot), the single dedup + skip-missed anchor. `schedule_id` on the audit log
  // links a scheduled run back to its schedule (null for manual runs).
  `
  CREATE TABLE schedules (
    id TEXT PRIMARY KEY,
    zone_id TEXT NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
    name TEXT,
    mode TEXT NOT NULL DEFAULT 'time',
    times TEXT NOT NULL DEFAULT '[]',
    shot_percent REAL,
    shot_ml REAL,
    shot_seconds INTEGER,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_fired_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK ((shot_percent IS NOT NULL) + (shot_ml IS NOT NULL) + (shot_seconds IS NOT NULL) = 1)
  );
  CREATE INDEX schedules_zone ON schedules(zone_id);

  ALTER TABLE irrigation_events ADD COLUMN schedule_id TEXT;
  `
];

function migrate(db: DatabaseSync): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  const current = row?.user_version ?? 0;

  for (let version = current; version < MIGRATIONS.length; version++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[version]);
      // user_version can't be parameterised; version is a loop integer, not input.
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

/**
 * Open (or create) the irrigation database at `path`, apply pragmas + migrations,
 * and return it. Exposed for tests, which pass `:memory:` or a temp file.
 */
export function openIrrigationDb(path: string): DatabaseSync {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  return db;
}

export function getIrrigationDbPath(): string {
  return env('GROW_IRRIGATION_DB') ?? './data/irrigation.db';
}

let singleton: DatabaseSync | null = null;

/** Process-wide irrigation DB, opened once. Web-app only — never the recorder. */
export function getIrrigationDb(): DatabaseSync {
  if (!singleton) singleton = openIrrigationDb(getIrrigationDbPath());
  return singleton;
}
