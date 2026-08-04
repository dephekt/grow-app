// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openIrrigationDb } from '../../src/lib/server/opensprinkler/db';
import {
  createZone,
  deleteZone,
  getZone,
  listZones,
  recordEvent,
  toZoneJson,
  updateZone
} from '../../src/lib/server/opensprinkler/zones';

function freshDb(): DatabaseSync {
  return openIrrigationDb(':memory:');
}

describe('substrate probe binding', () => {
  /**
   * The binding is what lets the dashboard pick a calibration curve: probe → zone →
   * substrate type. Nullable throughout, because a probe routinely sits in a test pot
   * before it belongs to any zone and must still read.
   */
  it('defaults to unbound and round-trips a probe node id', () => {
    const db = freshDb();
    const zone = createZone(db, { name: 'Tent 1', stationSid: 0 });
    expect(zone.substrateNodeId).toBeNull();

    const bound = updateZone(db, zone.id, { substrateNodeId: 'substrate-a' });
    expect(bound?.substrateNodeId).toBe('substrate-a');
    expect(getZone(db, zone.id)?.substrateNodeId).toBe('substrate-a');
  });

  it('accepts the binding at creation', () => {
    const db = freshDb();
    const zone = createZone(db, {
      name: 'Tent 1',
      stationSid: 0,
      substrateType: 'Coco',
      substrateNodeId: 'substrate-a'
    });
    expect(zone.substrateNodeId).toBe('substrate-a');
  });

  it('clears the binding when a probe is moved out of the zone', () => {
    const db = freshDb();
    const zone = createZone(db, { name: 'Tent 1', stationSid: 0, substrateNodeId: 'substrate-a' });
    expect(updateZone(db, zone.id, { substrateNodeId: null })?.substrateNodeId).toBeNull();
  });

  /** An unrelated patch must not silently drop the binding. */
  it('survives a patch that does not mention it', () => {
    const db = freshDb();
    const zone = createZone(db, { name: 'Tent 1', stationSid: 0, substrateNodeId: 'substrate-a' });
    expect(updateZone(db, zone.id, { name: 'Tent A' })?.substrateNodeId).toBe('substrate-a');
  });

  it('is at schema version 7', () => {
    const db = freshDb();
    expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(7);
  });

  /** Migration 7 removed the placeholders the binding replaced. */
  it('no longer carries the vwc/pwec entity columns', () => {
    const db = freshDb();
    const columns = (db.prepare('PRAGMA table_info(zones)').all() as unknown as { name: string }[]).map((c) => c.name);
    expect(columns).toContain('substrate_node_id');
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
      emitterLph: 2,
      substrateNodeId: 'substrate-a'
    });
    const read = getZone(db, zone.id)!;
    expect(read.name).toBe('Tent 1');
    expect(read.stationSid).toBe(3);
    expect(read.substrateType).toBe('Coco');
    expect(read.substrateVolumeMl).toBe(4000);
    expect(read.drippers).toBe(2);
    expect(read.emitterLph).toBe(2);
    expect(read.substrateNodeId).toBe('substrate-a');
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
