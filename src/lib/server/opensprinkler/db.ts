// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { env } from '$lib/server/env';

// Append-only: index +1 is the `PRAGMA user_version`, so never edit an existing entry.
// Exported so a test can stand a database up at an older version and drive one migration
// across it — the data-moving ones are otherwise unreachable from a fresh database.
export const MIGRATIONS: string[] = [
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
  // 3 — per-zone time-based schedules; `times` holds minutes past local midnight, and
  // `last_fired_at` is the dedup and skip-missed anchor.
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
  `,
  // 4 — irrigation history feed; a NULL pump peak means "not measured", not "no draw".
  `
  ALTER TABLE irrigation_events ADD COLUMN kind TEXT NOT NULL DEFAULT 'irrigation';
  ALTER TABLE irrigation_events ADD COLUMN pump_energy_wh REAL;
  ALTER TABLE irrigation_events ADD COLUMN pump_peak_w REAL;
  `,
  // 5 — per-zone schedule pause; unlike zone `enabled`, a paused zone still runs on demand.
  `
  ALTER TABLE zones ADD COLUMN schedules_paused INTEGER NOT NULL DEFAULT 0;
  `,
  // 6 — bind a zone to its substrate probe by MQTT node id; no FK, since that names a
  // device on the broker.
  `
  ALTER TABLE zones ADD COLUMN substrate_node_id TEXT;
  `,
  // 7 — drop the unused vwc/pwec entity columns; the only destructive migration, so a
  // rollback past it fails zone writes.
  `
  ALTER TABLE zones DROP COLUMN vwc_entity_id;
  ALTER TABLE zones DROP COLUMN pwec_entity_id;
  `,
  // 8 — per-zone substrate threshold bands; VWC is stored as a percent.
  `
  ALTER TABLE zones ADD COLUMN vwc_min_pct REAL;
  ALTER TABLE zones ADD COLUMN vwc_max_pct REAL;
  ALTER TABLE zones ADD COLUMN substrate_temp_min_c REAL;
  ALTER TABLE zones ADD COLUMN substrate_temp_max_c REAL;
  ALTER TABLE zones ADD COLUMN pwec_min REAL;
  ALTER TABLE zones ADD COLUMN pwec_max REAL;
  `,
  // 9 — invert the probe↔zone binding. `zones.substrate_node_id` modelled one probe per
  // zone; a pot holds one probe but a zone holds several, so the reference belongs on the
  // probe, where node_id as PK also makes "in two zones at once" unrepresentable.
  // INSERT OR IGNORE because the old shape allowed exactly that: two zones naming one
  // probe, which `zones.find()` resolved by taking the first — so does this.
  `
  CREATE TABLE substrate_probes (
    node_id TEXT PRIMARY KEY,
    zone_id TEXT REFERENCES zones(id) ON DELETE SET NULL,
    name TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX substrate_probes_zone ON substrate_probes(zone_id);

  INSERT OR IGNORE INTO substrate_probes (node_id, zone_id, created_at, updated_at)
    SELECT substrate_node_id, id,
           strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      FROM zones
     WHERE substrate_node_id IS NOT NULL AND trim(substrate_node_id) <> '';

  ALTER TABLE zones DROP COLUMN substrate_node_id;
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

/** Open (or create) the irrigation database, applying pragmas and migrations. */
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
