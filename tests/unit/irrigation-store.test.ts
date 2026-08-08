// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MIGRATIONS, openIrrigationDb } from '../../src/lib/server/opensprinkler/db';
import {
  createZone,
  deleteZone,
  getZone,
  listZones,
  recordEvent,
  toZoneJson,
  updateZone
} from '../../src/lib/server/opensprinkler/zones';
import { getProbe, listProbes, upsertProbe } from '../../src/lib/server/opensprinkler/probes';

function freshDb(): DatabaseSync {
  return openIrrigationDb(':memory:');
}

describe('substrate probe binding', () => {
  /**
   * The binding is what lets the dashboard pick a calibration curve: probe → zone →
   * substrate type. Nullable throughout, because a probe routinely sits in a test pot
   * before it belongs to any zone and must still read.
   */
  it('defaults to unbound and round-trips a binding', () => {
    const db = freshDb();
    const zone = createZone(db, { name: 'Tent 1', stationSid: 0 });
    expect(getProbe(db, 'substrate-a')).toBeUndefined();

    const bound = upsertProbe(db, 'substrate-a', { zoneId: zone.id });
    expect(bound.zoneId).toBe(zone.id);
    expect(getProbe(db, 'substrate-a')?.zoneId).toBe(zone.id);
  });

  /**
   * The row is keyed on the probe, so binding it a second time moves it rather than
   * adding a duplicate. Under the old zone-side column two zones could each name the
   * same probe and `zones.find()` silently resolved it to whichever came first.
   */
  it('moves a probe between zones instead of duplicating it', () => {
    const db = freshDb();
    const a = createZone(db, { name: 'Tent 1', stationSid: 0 });
    const b = createZone(db, { name: 'Tent 2', stationSid: 1 });
    upsertProbe(db, 'substrate-a', { zoneId: a.id });
    upsertProbe(db, 'substrate-a', { zoneId: b.id });
    expect(listProbes(db)).toHaveLength(1);
    expect(getProbe(db, 'substrate-a')?.zoneId).toBe(b.id);
  });

  it('records the display name verbatim', () => {
    const db = freshDb();
    const zone = createZone(db, { name: '4x4', stationSid: 0 });
    expect(upsertProbe(db, 'substrate-c', { zoneId: zone.id, name: 'Mule A' })).toMatchObject({
      name: 'Mule A'
    });
  });

  it('unbinds without forgetting whose pot it is', () => {
    const db = freshDb();
    const zone = createZone(db, { name: 'Tent 1', stationSid: 0 });
    upsertProbe(db, 'substrate-a', { zoneId: zone.id, name: 'Gelato A' });
    const loose = upsertProbe(db, 'substrate-a', { zoneId: null });
    expect(loose.zoneId).toBeNull();
    expect(loose.name).toBe('Gelato A');
  });

  /** An unrelated patch must not silently drop the rest of the row. */
  it('survives a patch that does not mention it', () => {
    const db = freshDb();
    const zone = createZone(db, { name: 'Tent 1', stationSid: 0 });
    upsertProbe(db, 'substrate-a', { zoneId: zone.id, name: 'Gelato A' });
    expect(upsertProbe(db, 'substrate-a', { name: 'Gelato B' })).toMatchObject({
      zoneId: zone.id,
      name: 'Gelato B'
    });
  });

  /** Deleting a zone must not delete the probe with it — the hardware is still there. */
  it('keeps the probe when its zone is deleted, just unbound', () => {
    const db = freshDb();
    const zone = createZone(db, { name: 'Tent 1', stationSid: 0 });
    upsertProbe(db, 'substrate-a', { zoneId: zone.id, name: 'Gelato A' });
    deleteZone(db, zone.id);
    expect(getProbe(db, 'substrate-a')).toMatchObject({ zoneId: null, name: 'Gelato A' });
  });

  it('round-trips the threshold bands, with null meaning an open side', () => {
    const db = freshDb();
    const zone = createZone(db, {
      name: '4x4',
      stationSid: 0,
      vwcMinPct: 30,
      vwcMaxPct: 60,
      pwecMin: 2.5
    });
    expect(zone.vwcMinPct).toBe(30);
    expect(zone.vwcMaxPct).toBe(60);
    expect(zone.pwecMin).toBe(2.5);
    expect(zone.pwecMax).toBeNull();
    expect(zone.substrateTempMinC).toBeNull();

    const cleared = updateZone(db, zone.id, { vwcMinPct: null });
    expect(cleared?.vwcMinPct).toBeNull();
    expect(cleared?.vwcMaxPct).toBe(60);
  });

  /** A zero bound is a real bound, not an absent one — the classic null/0 conflation. */
  it('keeps a zero bound distinct from an unset one', () => {
    const db = freshDb();
    const zone = createZone(db, { name: '4x4', stationSid: 0, pwecMin: 0 });
    expect(zone.pwecMin).toBe(0);
    expect(zone.pwecMax).toBeNull();
  });

  it('survives a patch that does not mention the bands', () => {
    const db = freshDb();
    const zone = createZone(db, { name: '4x4', stationSid: 0, vwcMinPct: 30, vwcMaxPct: 60 });
    const patched = updateZone(db, zone.id, { name: 'Tent A' });
    expect(patched?.vwcMinPct).toBe(30);
    expect(patched?.vwcMaxPct).toBe(60);
  });

  /**
   * The check the parser cannot do: a patch naming one end has to be judged against the
   * end already stored.
   */
  it('rejects a crossed band formed across two patches', () => {
    const db = freshDb();
    const zone = createZone(db, { name: '4x4', stationSid: 0, vwcMinPct: 30, vwcMaxPct: 60 });
    expect(() => updateZone(db, zone.id, { vwcMaxPct: 20 })).toThrow(/VWC/);
    // The rejected write left the stored band untouched.
    expect(getZone(db, zone.id)?.vwcMaxPct).toBe(60);
  });

  it('patches one end of a band without clearing the other', () => {
    const db = freshDb();
    const zone = createZone(db, { name: '4x4', stationSid: 0, vwcMinPct: 30, vwcMaxPct: 60 });
    const patched = updateZone(db, zone.id, { vwcMaxPct: 55 });
    expect(patched?.vwcMinPct).toBe(30);
    expect(patched?.vwcMaxPct).toBe(55);
  });

  it('is at schema version 9', () => {
    const db = freshDb();
    expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(9);
  });

  /** Migration 7 removed the placeholders the binding replaced; migration 9 removed the
   *  binding column itself, once the reference moved onto the probe. */
  it('no longer carries the vwc/pwec entity or probe-binding columns', () => {
    const db = freshDb();
    const columns = (db.prepare('PRAGMA table_info(zones)').all() as unknown as { name: string }[]).map((c) => c.name);
    expect(columns).not.toContain('substrate_node_id');
    expect(columns).not.toContain('vwc_entity_id');
    expect(columns).not.toContain('pwec_entity_id');
  });

  /** The drop runs against a table migration 1 created with rows in it, so the rest of
   *  a zone must survive it. */
  it('keeps every other zone field across the drop', () => {
    const db = freshDb();
    const zone = createZone(db, {
      name: 'Tent 1',
      stationSid: 3,
      substrateType: 'Coco',
      substrateVolumeMl: 4000,
      drippers: 2,
      emitterLph: 2
    });
    const read = getZone(db, zone.id)!;
    expect(read.name).toBe('Tent 1');
    expect(read.stationSid).toBe(3);
    expect(read.substrateType).toBe('Coco');
    expect(read.substrateVolumeMl).toBe(4000);
    expect(read.drippers).toBe(2);
    expect(read.emitterLph).toBe(2);
  });
});

describe('irrigation zone store', () => {
  it('creates, reads, updates, and deletes zones', () => {
    const db = freshDb();
    const zone = createZone(db, {
      name: 'Tent 1',
      stationSid: 0,
      substrateVolumeMl: 3785,
      drippers: 2,
      emitterLph: 2
    });
    expect(zone.id).toBeTruthy();
    expect(zone.maxRunSeconds).toBe(300); // default
    expect(zone.enabled).toBe(true);

    expect(getZone(db, zone.id)?.name).toBe('Tent 1');
    expect(listZones(db)).toHaveLength(1);

    const updated = updateZone(db, zone.id, { name: 'Tent A', maxRunSeconds: 120 });
    expect(updated?.name).toBe('Tent A');
    expect(updated?.maxRunSeconds).toBe(120);
    // Fields not in the patch are preserved.
    expect(updated?.substrateVolumeMl).toBe(3785);

    expect(deleteZone(db, zone.id)).toBe(true);
    expect(getZone(db, zone.id)).toBeUndefined();
    expect(deleteZone(db, zone.id)).toBe(false);
  });

  it('rejects a second zone on the same station (UNIQUE station_sid)', () => {
    const db = freshDb();
    createZone(db, { name: 'A', stationSid: 0 });
    expect(() => createZone(db, { name: 'B', stationSid: 0 })).toThrow(/UNIQUE/i);
  });

  it('clears a nullable field when the patch sets it to null', () => {
    const db = freshDb();
    const zone = createZone(db, { name: 'Z', stationSid: 1, substrateVolumeMl: 1000 });
    expect(updateZone(db, zone.id, { substrateVolumeMl: null })?.substrateVolumeMl).toBeNull();
  });

  it('exposes the derived station entity id', () => {
    const db = freshDb();
    const zone = createZone(db, { name: 'Z', stationSid: 2 });
    expect(toZoneJson(zone).stationEntityId).toBe('opensprinkler_station_2');
  });

  it('defaults schedulesPaused to false and toggles it without touching other fields', () => {
    const db = freshDb();
    const zone = createZone(db, { name: 'Z', stationSid: 0, maxRunSeconds: 120 });
    expect(zone.schedulesPaused).toBe(false);

    const paused = updateZone(db, zone.id, { schedulesPaused: true });
    expect(paused?.schedulesPaused).toBe(true);
    expect(paused?.name).toBe('Z');
    expect(paused?.maxRunSeconds).toBe(120); // untouched

    expect(updateZone(db, zone.id, { schedulesPaused: false })?.schedulesPaused).toBe(false);
  });

  it('can create a zone already paused', () => {
    const db = freshDb();
    expect(createZone(db, { name: 'P', stationSid: 1, schedulesPaused: true }).schedulesPaused).toBe(true);
  });

  it('records irrigation events', () => {
    const db = freshDb();
    const zone = createZone(db, { name: 'Z', stationSid: 0 });
    recordEvent(db, { zoneId: zone.id, stationSid: 0, seconds: 30, requestedPercent: 3, actor: 'dan' });
    const rows = db.prepare('SELECT seconds, actor FROM irrigation_events').all() as Array<{ seconds: number; actor: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ seconds: 30, actor: 'dan' });
  });
});

/**
 * Migration 9 moves the probe→zone reference off `zones.substrate_node_id` and onto its own
 * row. It is the only migration that carries data rather than reshaping empty structure, so
 * a fresh database — which every other test uses — never exercises it.
 */
describe('migration 9 — probe binding backfill', () => {
  /** A database left at version 8, with whatever rows the test wants in it. */
  function atVersion8(seed: (db: DatabaseSync) => void): string {
    const path = join(mkdtempSync(join(tmpdir(), 'grow-mig-')), 'irrigation.db');
    const db = new DatabaseSync(path);
    db.exec('PRAGMA foreign_keys = ON');
    for (const migration of MIGRATIONS.slice(0, 8)) db.exec(migration);
    db.exec('PRAGMA user_version = 8');
    seed(db);
    db.close();
    return path;
  }

  const insertZone = (db: DatabaseSync, id: string, name: string, sid: number, node: string | null) =>
    db
      .prepare(
        `INSERT INTO zones (id, name, station_sid, substrate_node_id, substrate_type, max_run_seconds,
           enabled, schedules_paused, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'Coco', 300, 1, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
      )
      .run(id, name, sid, node);

  it('carries a bound probe onto its own row and drops the column', () => {
    const path = atVersion8((db) => insertZone(db, 'z1', '4x4', 0, 'substrate-a'));
    const db = openIrrigationDb(path);

    expect(listProbes(db)).toHaveLength(1);
    expect(getProbe(db, 'substrate-a')).toMatchObject({ zoneId: 'z1', name: null });
    const columns = (db.prepare('PRAGMA table_info(zones)').all() as unknown as { name: string }[]).map((c) => c.name);
    expect(columns).not.toContain('substrate_node_id');
    // The zone itself is untouched by the move.
    expect(getZone(db, 'z1')?.name).toBe('4x4');
  });

  it('leaves an unbound zone with no probe row', () => {
    const db = openIrrigationDb(atVersion8((seed) => insertZone(seed, 'z1', '4x4', 0, null)));
    expect(listProbes(db)).toHaveLength(0);
  });

  /**
   * The old shape allowed two zones to name one probe, and `zones.find()` resolved that by
   * taking the first. A PRIMARY KEY would abort the whole migration on it, so the insert
   * ignores the collision and keeps the same winner.
   */
  it('survives two zones that named the same probe, keeping the first', () => {
    const db = openIrrigationDb(
      atVersion8((seed) => {
        insertZone(seed, 'z1', 'Tent 1', 0, 'substrate-a');
        insertZone(seed, 'z2', 'Tent 2', 1, 'substrate-a');
      })
    );
    expect(listProbes(db)).toHaveLength(1);
    expect(getProbe(db, 'substrate-a')?.zoneId).toBe('z1');
  });

  it('stamps timestamps the app can parse back', () => {
    const db = openIrrigationDb(atVersion8((seed) => insertZone(seed, 'z1', '4x4', 0, 'substrate-a')));
    const created = getProbe(db, 'substrate-a')!.createdAt;
    expect(Number.isNaN(Date.parse(created))).toBe(false);
  });
});
