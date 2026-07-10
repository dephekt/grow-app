import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { env } from '$lib/server/env';

// Ordered, append-only migrations. The index +1 is the schema version stored in
// `PRAGMA user_version`. Never edit an existing entry — add a new one. Mirrors the
// auth/irrigation DB pattern (src/lib/server/auth/db.ts, opensprinkler/db.ts). Kept
// in its own DB file: different lifecycle, no cross-table FKs, and the read-only
// recorder never opens it.
const MIGRATIONS: string[] = [
  // 1 — generic app settings key/value store
  `
  CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
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
 * Open (or create) the settings database at `path`, apply pragmas + migrations,
 * and return it. Exposed for tests, which pass `:memory:` or a temp file.
 */
export function openSettingsDb(path: string): DatabaseSync {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  return db;
}

export function getSettingsDbPath(): string {
  return env('GROW_SETTINGS_DB') ?? './data/settings.db';
}

let singleton: DatabaseSync | null = null;

/** Process-wide settings DB, opened once. Web-app only — never the recorder. */
export function getSettingsDb(): DatabaseSync {
  if (!singleton) singleton = openSettingsDb(getSettingsDbPath());
  return singleton;
}
