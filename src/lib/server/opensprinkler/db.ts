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
    station_sid INTEGER NOT NULL,
    substrate_type TEXT,
    substrate_volume_ml INTEGER,
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
