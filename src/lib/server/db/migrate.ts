// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * The house SQLite migration convention, shared by every database in the app.
 *
 * Migration lists are ordered and append-only: an entry's index +1 is the schema version
 * stored in `PRAGMA user_version`, so editing an existing entry silently skips it on any
 * database that already ran it.
 */

/** Apply every migration past the database's current `user_version`, one transaction each. */
export function migrate(db: DatabaseSync, migrations: readonly string[]): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  const current = row?.user_version ?? 0;

  for (let version = current; version < migrations.length; version++) {
    db.exec('BEGIN');
    try {
      db.exec(migrations[version]);
      // user_version can't be parameterised; version is a loop integer, not input.
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

/** Open (or create) a database at `path` with the house pragmas and `migrations` applied. */
export function openMigratedDb(path: string, migrations: readonly string[]): DatabaseSync {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db, migrations);
  return db;
}
