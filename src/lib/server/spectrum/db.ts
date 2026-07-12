import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { env } from '$lib/server/env';

// Discrete saved spectrum captures. Stores the RAW counts as the single source of
// truth (plus a little frame metadata); every read reprocesses them through
// processSpectrum, so history reflects the CURRENT calibration rather than freezing
// at whatever scalars were computed when saved. That's why no computed columns
// (peak/bands/par/ppfd/calibrated) are stored — they'd be stale the moment
// SPECTRO_CONFIG changes. Mirrors the opensprinkler/auth db pattern (self-migrating
// node:sqlite). Separate DB file — the read-only recorder never opens it.
const MIGRATIONS: string[] = [
  // 1 — one row per saved capture
  `
  CREATE TABLE captures (
    id             TEXT PRIMARY KEY,
    node_id        TEXT NOT NULL,
    captured_at    TEXT NOT NULL,
    seq            INTEGER,
    integration_us INTEGER,
    saturated      INTEGER NOT NULL DEFAULT 0,
    adc_bits       INTEGER,
    fw             TEXT,
    counts         TEXT NOT NULL,          -- JSON number[288]; the single source of truth, reprocessed on read
    label          TEXT,
    note           TEXT
  );
  CREATE INDEX captures_captured_at ON captures(captured_at);
  `
];

function migrate(db: DatabaseSync): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  const current = row?.user_version ?? 0;
  for (let version = current; version < MIGRATIONS.length; version++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[version]);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

/** Open (or create) the spectrum DB at `path`, apply pragmas + migrations. Exposed
 *  for tests, which pass `:memory:` or a temp file. */
export function openSpectrumDb(path: string): DatabaseSync {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  migrate(db);
  return db;
}

export function getSpectrumDbPath(): string {
  return env('GROW_SPECTRUM_DB') ?? './data/spectrum.db';
}

let singleton: DatabaseSync | null = null;

/** Process-wide spectrum DB, opened once. Web-app only — never the recorder. */
export function getSpectrumDb(): DatabaseSync {
  if (!singleton) singleton = openSpectrumDb(getSpectrumDbPath());
  return singleton;
}
