// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import type { DatabaseSync } from 'node:sqlite';
import { env } from '$lib/server/env';
import { openMigratedDb } from '$lib/server/db/migrate';

// Append-only: index +1 is the `PRAGMA user_version`, so never edit an existing entry.
// Exported so a test can stand a database up at an older version and drive one migration.
export const MIGRATIONS: string[] = [
  // 1 — single-row loop config, and the audit log of what it decided and why. The config row
  // is seeded here so every read has a row to find and defaults live in exactly one place.
  `
  CREATE TABLE climate_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    mode TEXT NOT NULL DEFAULT 'observe',
    exhaust_source TEXT NOT NULL DEFAULT 'firmware',
    rh_source TEXT NOT NULL DEFAULT 'external',
    deadband_kpa REAL NOT NULL DEFAULT 0.10,
    min_on_seconds INTEGER NOT NULL DEFAULT 120,
    min_off_seconds INTEGER NOT NULL DEFAULT 300,
    min_gain_kpa REAL NOT NULL DEFAULT 0.05,
    vent_always_above_c REAL NOT NULL DEFAULT 31,
    vent_never_below_c REAL NOT NULL DEFAULT 20,
    air_vpd_override REAL,
    updated_at TEXT NOT NULL
  );

  INSERT INTO climate_config (id, updated_at) VALUES (1, '1970-01-01T00:00:00.000Z');

  CREATE TABLE climate_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    kind TEXT NOT NULL,
    actuator TEXT,
    on_state INTEGER,
    reason TEXT NOT NULL,
    mode TEXT NOT NULL,
    published INTEGER NOT NULL DEFAULT 0,
    air_vpd REAL,
    leaf_vpd REAL,
    target REAL,
    band_low REAL,
    band_high REAL,
    tent_temp_c REAL,
    tent_rh_pct REAL,
    room_temp_c REAL,
    room_rh_pct REAL,
    lights_on INTEGER
  );

  CREATE INDEX climate_events_ts ON climate_events(ts);
  `
];

/** Open (or create) the climate database, applying pragmas and migrations. */
export function openClimateDb(path: string): DatabaseSync {
  return openMigratedDb(path, MIGRATIONS);
}

export function getClimateDbPath(): string {
  return env('GROW_CLIMATE_DB') ?? './data/climate.db';
}

let singleton: DatabaseSync | null = null;

/** Process-wide climate DB, opened once. Web-app only — never the recorder. */
export function getClimateDb(): DatabaseSync {
  if (!singleton) singleton = openClimateDb(getClimateDbPath());
  return singleton;
}
