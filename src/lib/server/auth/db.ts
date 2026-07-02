import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getAuthDbPath } from '$lib/server/auth/config';

// Ordered, append-only migrations. The index in this array +1 is the schema
// version stored in `PRAGMA user_version`. Never edit an existing entry — add a
// new one. Each is applied in its own transaction (see migrate()).
const MIGRATIONS: string[] = [
  // 1 — initial auth schema
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT,
    is_admin INTEGER NOT NULL DEFAULT 0,
    disabled INTEGER NOT NULL DEFAULT 0,
    password_hash TEXT,
    password_updated_at TEXT,
    oidc_issuer TEXT,
    oidc_sub TEXT,
    created_at TEXT NOT NULL,
    last_login_at TEXT,
    UNIQUE (oidc_issuer, oidc_sub)
  );

  CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    login_method TEXT NOT NULL CHECK (login_method IN ('local', 'oidc')),
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    user_agent TEXT,
    ip TEXT
  );
  CREATE INDEX sessions_user_id ON sessions(user_id);
  CREATE INDEX sessions_expires_at ON sessions(expires_at);

  CREATE TABLE auth_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    event TEXT NOT NULL,
    username TEXT,
    user_id INTEGER,
    ip TEXT,
    detail TEXT
  );
  CREATE INDEX auth_audit_at ON auth_audit(at);
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
 * Open (or create) an auth database at `path`, apply pragmas + migrations, and
 * return it. Exposed for tests, which pass `:memory:` or a temp file. `path`
 * other than `:memory:` has its parent directory created.
 */
export function openAuthDb(path: string): DatabaseSync {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  return db;
}

/** Delete sessions whose rolling expiry has passed. Returns rows removed. */
export function purgeExpiredSessions(db: DatabaseSync): number {
  const result = db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
  return Number(result.changes);
}

let singleton: DatabaseSync | null = null;

/** Process-wide auth DB, opened once at the configured path. Purges expired
 *  sessions at open and daily thereafter (timer unref'd so it never holds the
 *  process open). */
export function getAuthDb(): DatabaseSync {
  if (singleton) return singleton;
  singleton = openAuthDb(getAuthDbPath());

  purgeExpiredSessions(singleton);
  const daily = setInterval(() => {
    try {
      purgeExpiredSessions(singleton!);
    } catch (error) {
      console.error('[auth] session purge failed', error);
    }
  }, 24 * 60 * 60 * 1000);
  daily.unref?.();

  return singleton;
}
