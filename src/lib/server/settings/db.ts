// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import type { DatabaseSync } from 'node:sqlite';
import { env } from '$lib/server/env';
import { openMigratedDb } from '$lib/server/db/migrate';

// Ordered, append-only migrations whose index +1 is the schema version stored in
// `PRAGMA user_version` — never edit an existing entry, add a new one.
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

/**
 * Open (or create) the settings database at `path`, apply pragmas + migrations, and return it.
 */
export function openSettingsDb(path: string): DatabaseSync {
  return openMigratedDb(path, MIGRATIONS);
}

export function getSettingsDbPath(): string {
  return env('GROW_SETTINGS_DB') ?? './data/settings.db';
}

let singleton: DatabaseSync | null = null;

/** Process-wide settings DB, opened once — web-app only, never the recorder. */
export function getSettingsDb(): DatabaseSync {
  if (!singleton) singleton = openSettingsDb(getSettingsDbPath());
  return singleton;
}
