import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  getAuthAuditMaxRows,
  getAuthAuditRetentionDays,
  getAuthDbPath
} from '$lib/server/auth/config';

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

/** Delete `auth_audit` rows older than `retentionDays`. A non-positive value is
 *  a no-op (retain indefinitely). Uses the `auth_audit_at` index; `at` is an
 *  ISO-8601 string so the lexical `<=` compare matches chronological order.
 *  Returns rows removed. */
export function purgeOldAuditEntries(db: DatabaseSync, retentionDays: number): number {
  if (retentionDays <= 0) return 0;
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  // A window so large the cutoff predates the representable Date range (min
  // -8.64e15 ms) means no row can be that old, so delete nothing — and skipping
  // the compute avoids the RangeError that `new Date(...).toISOString()` throws
  // for an out-of-range value (e.g. GROW_AUTH_AUDIT_RETENTION_DAYS=1e9).
  if (cutoffMs < -8_640_000_000_000_000) return 0;
  const cutoff = new Date(cutoffMs).toISOString();
  const result = db.prepare('DELETE FROM auth_audit WHERE at <= ?').run(cutoff);
  return Number(result.changes);
}

/** Keep only the newest `maxRows` `auth_audit` rows (ordered by autoincrement
 *  `id`), dropping the rest. A non-positive value is a no-op (uncapped). This
 *  bounds the table even if an unauthenticated flood writes rows faster than the
 *  age prune reclaims them. Returns rows removed. */
export function capAuditRows(db: DatabaseSync, maxRows: number): number {
  if (maxRows <= 0) return 0;
  // The id of the first row beyond the newest `maxRows` (undefined if the table
  // holds `maxRows` or fewer). A single-row PK lookup + PK range delete — cheap,
  // and gap-safe because it does not assume ids are contiguous.
  const boundary = db
    .prepare('SELECT id FROM auth_audit ORDER BY id DESC LIMIT 1 OFFSET ?')
    .get(maxRows) as { id: number } | undefined;
  if (!boundary) return 0;
  const result = db.prepare('DELETE FROM auth_audit WHERE id <= ?').run(boundary.id);
  return Number(result.changes);
}

/** Run every periodic auth-DB purge: expired sessions, then aged-out and
 *  overflowing audit rows. Called at open and from the daily timer. */
function runAuthMaintenance(db: DatabaseSync): void {
  purgeExpiredSessions(db);
  purgeOldAuditEntries(db, getAuthAuditRetentionDays());
  capAuditRows(db, getAuthAuditMaxRows());
}

/** Best-effort wrapper: housekeeping must never prevent the auth DB from being
 *  used, so a purge failure (e.g. a wildly out-of-range tunable) is logged and
 *  swallowed — at open just as it already was on the daily timer. */
function tryRunAuthMaintenance(db: DatabaseSync): void {
  try {
    runAuthMaintenance(db);
  } catch (error) {
    console.error('[auth] maintenance purge failed', error);
  }
}

let singleton: DatabaseSync | null = null;

/** Process-wide auth DB, opened once at the configured path. Runs maintenance
 *  (session + audit purge) at open and daily thereafter (timer unref'd so it
 *  never holds the process open). */
export function getAuthDb(): DatabaseSync {
  if (singleton) return singleton;
  singleton = openAuthDb(getAuthDbPath());

  tryRunAuthMaintenance(singleton);
  const daily = setInterval(() => tryRunAuthMaintenance(singleton!), 24 * 60 * 60 * 1000);
  daily.unref?.();

  return singleton;
}
