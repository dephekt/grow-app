// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

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
  `,
  // 4 — irrigation history feed. `kind` discriminates zone runs ('irrigation', the
  // default so existing rows and every recordEvent() insert stay unchanged) from
  // runoff-pump runs ('runoff') persisted by the runoff monitor, so the page renders one
  // mixed newest-first feed. `pump_energy_wh` / `pump_peak_w` cache the per-event pump
  // draw, integrated from InfluxDB over the run's [ts, ts+seconds] window; both stay NULL
  // until measured (lazily, once the run has settled). A NULL peak means "not measured"
  // and never warns; a measured peak below the draw floor is the soft "no pump activity"
  // flag surfaced on the row.
  `
  ALTER TABLE irrigation_events ADD COLUMN kind TEXT NOT NULL DEFAULT 'irrigation';
  ALTER TABLE irrigation_events ADD COLUMN pump_energy_wh REAL;
  ALTER TABLE irrigation_events ADD COLUMN pump_peak_w REAL;
  `,
  // 5 — per-zone schedule pause. A single switch to disarm ALL of a zone's schedules at
  // once (the scheduler skips a paused zone) without deleting them or toggling each one's
  // `enabled`, so the individual schedule configs are preserved and resume unchanged.
  // Distinct from zone `enabled`, which also blocks manual runs; a paused zone still runs
  // on demand. Default 0 so existing zones keep firing.
  `
  ALTER TABLE zones ADD COLUMN schedules_paused INTEGER NOT NULL DEFAULT 0;
  `,
  // 6 — bind a zone to the substrate probe sitting in it. Holds the probe's MQTT node
  // id ("substrate-a"), not an entity id: a TEROS publishes four entities and the
  // dashboard needs all of them together, so the device is the unit of binding.
  //
  // Nullable and unconstrained on purpose. A probe is routinely in a test pot or a
  // fresh bag before it belongs to any zone, and it must still read — an unbound probe
  // falls back to the soilless curve. This is also why there is no FK: the node id
  // names a device on the broker, which this database knows nothing about.
  //
  // NOT a rename of the older vwc_entity_id / pwec_entity_id columns. Those predate the
  // decision to derive water content here rather than read it from firmware; migration 7
  // drops them.
  `
  ALTER TABLE zones ADD COLUMN substrate_node_id TEXT;
  `,
  // 7 — drop vwc_entity_id / pwec_entity_id. They date from migration 1, when the plan
  // was for a probe to publish water content and pore EC as entities and for a zone to
  // name which ones were its own. The publisher ships raw counts instead and this app
  // derives both against the zone's medium, so there is nothing to point at: the
  // binding is substrate_node_id (migration 6) and the reading is computed, not
  // referenced. Nothing has ever read these columns and both are NULL in every
  // deployment.
  //
  // The only destructive migration here, hence the note: rolling the image back past
  // this point leaves older code inserting columns that no longer exist, which fails
  // zone writes (reads are unaffected). Data loss is not the risk — the columns are
  // empty — the older schema expectation is.
  `
  ALTER TABLE zones DROP COLUMN vwc_entity_id;
  ALTER TABLE zones DROP COLUMN pwec_entity_id;
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
