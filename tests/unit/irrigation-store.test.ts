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
