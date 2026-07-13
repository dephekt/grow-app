import { describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openIrrigationDb } from '../../src/lib/server/opensprinkler/db';
import { createZone, deleteZone, recordEvent } from '../../src/lib/server/opensprinkler/zones';
import {
  listEvents,
  recordRunoffEvent,
  markEventEnergy,
  listEnergyPending,
  isSettled,
  eventWindow,
  pumpTagsForKind,
  ENRICH_POST_GRACE_SECONDS,
  ENERGY_SETTLE_SECONDS
} from '../../src/lib/server/opensprinkler/events';

function freshDb(): DatabaseSync {
  return openIrrigationDb(':memory:');
}

/** Insert an event row with an explicit ts (recordEvent stamps now(), which we can't order). */
function insertRaw(
  db: DatabaseSync,
  opts: {
    kind?: string;
    ts: string;
    zoneId?: string | null;
    stationSid?: number | null;
    source?: string;
    seconds?: number | null;
    peakW?: number | null;
    energyWh?: number | null;
  }
): void {
  db.prepare(
    `INSERT INTO irrigation_events (kind, zone_id, station_sid, source, seconds, ts, pump_energy_wh, pump_peak_w)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    opts.kind ?? 'irrigation',
    opts.zoneId ?? null,
    opts.stationSid ?? null,
    opts.source ?? 'manual',
    opts.seconds ?? null,
    opts.ts,
    opts.energyWh ?? null,
    opts.peakW ?? null
  );
}

describe('irrigation events feed — persistence + shaping', () => {
  it('surfaces a zone run (recordEvent) as an irrigation event with the joined zone name', () => {
    const db = freshDb();
    const zone = createZone(db, { name: 'Tent 1', stationSid: 0 });
    recordEvent(db, { zoneId: zone.id, stationSid: 0, seconds: 30, requestedPercent: 3, actor: 'dan' });

    const [e] = listEvents(db);
    expect(e.kind).toBe('irrigation');
    expect(e.zoneName).toBe('Tent 1');
    expect(e.stationSid).toBe(0);
    expect(e.seconds).toBe(30);
    expect(e.requestedPercent).toBe(3);
    expect(e.actor).toBe('dan');
    expect(e.energyWh).toBeNull();
    expect(e.peakW).toBeNull();
    expect(e.noDraw).toBe(false); // unmeasured never warns
  });

  it('persists a runoff run as its own event kind, with no measured duration', () => {
    const db = freshDb();
    recordRunoffEvent(db, { startedAt: '2026-07-12T10:00:00.000Z' });

    const [e] = listEvents(db);
    expect(e.kind).toBe('runoff');
    expect(e.source).toBe('runoff');
    expect(e.actor).toBe('monitor');
    expect(e.seconds).toBeNull();
    expect(e.zoneName).toBeNull();
  });

  it('returns a mixed feed newest-first', () => {
    const db = freshDb();
    insertRaw(db, { ts: '2026-07-12T10:00:00.000Z', stationSid: 0 });
    insertRaw(db, { kind: 'runoff', ts: '2026-07-12T10:05:00.000Z', source: 'runoff' });
    insertRaw(db, { ts: '2026-07-12T10:02:00.000Z', stationSid: 1 });

    const feed = listEvents(db);
    expect(feed.map((e) => e.ts)).toEqual([
      '2026-07-12T10:05:00.000Z',
      '2026-07-12T10:02:00.000Z',
      '2026-07-12T10:00:00.000Z'
    ]);
    expect(feed[0].kind).toBe('runoff');
  });

  it('keeps the run after its zone is deleted (name null, station retained)', () => {
    const db = freshDb();
    const zone = createZone(db, { name: 'Gone', stationSid: 4 });
    recordEvent(db, { zoneId: zone.id, stationSid: 4, seconds: 20 });
    deleteZone(db, zone.id);

    const [e] = listEvents(db);
    expect(e.zoneName).toBeNull();
    expect(e.stationSid).toBe(4);
  });

  it('respects the limit', () => {
    const db = freshDb();
    for (let i = 0; i < 5; i++) insertRaw(db, { ts: `2026-07-12T10:0${i}:00.000Z`, stationSid: i });
    expect(listEvents(db, 2)).toHaveLength(2);
  });
});

describe('irrigation events feed — no-draw warning derivation', () => {
  it('flags an irrigation run whose measured peak never crossed the draw floor', () => {
    const db = freshDb();
    insertRaw(db, { ts: '2026-07-12T10:00:00.000Z', stationSid: 0, seconds: 10 });
    const [row] = listEvents(db);
    markEventEnergy(db, row.id, 0.0, 2.0); // measured, below the 5 W floor

    const [e] = listEvents(db);
    expect(e.energyWh).toBe(0);
    expect(e.peakW).toBe(2);
    expect(e.noDraw).toBe(true);
  });

  it('does not flag an irrigation run that clearly drew', () => {
    const db = freshDb();
    insertRaw(db, { ts: '2026-07-12T10:00:00.000Z', stationSid: 0, seconds: 60 });
    const [row] = listEvents(db);
    markEventEnergy(db, row.id, 0.92, 58.0);

    expect(listEvents(db)[0].noDraw).toBe(false);
  });

  it('never flags a runoff event, even measured below the floor', () => {
    const db = freshDb();
    recordRunoffEvent(db, { startedAt: '2026-07-12T10:00:00.000Z' });
    const [row] = listEvents(db);
    markEventEnergy(db, row.id, 0.0, 1.0);

    expect(listEvents(db)[0].noDraw).toBe(false);
  });
});

describe('irrigation events feed — energy enrichment eligibility', () => {
  const base = Date.parse('2026-07-12T10:00:00.000Z');
  const graceMs = (ENRICH_POST_GRACE_SECONDS + ENERGY_SETTLE_SECONDS) * 1000;

  it('isSettled only after the window + grace has fully elapsed', () => {
    const ts = '2026-07-12T10:00:00.000Z';
    expect(isSettled(ts, 30, base + 10_000)).toBe(false); // mid-run
    expect(isSettled(ts, 30, base + 30_000 + graceMs - 1)).toBe(false); // 1 ms early
    expect(isSettled(ts, 30, base + 30_000 + graceMs)).toBe(true);
    expect(isSettled('not-a-date', 30, base + 10_000_000)).toBe(false);
  });

  it('eventWindow spans [ts, ts + seconds + post-grace]', () => {
    const w = eventWindow('2026-07-12T10:00:00.000Z', 30);
    expect(w.startIso).toBe('2026-07-12T10:00:00.000Z');
    expect(w.stopIso).toBe(new Date(base + (30 + ENRICH_POST_GRACE_SECONDS) * 1000).toISOString());
  });

  it('listEnergyPending returns settled + unmeasured rows only', () => {
    const db = freshDb();
    // Old, unmeasured → eligible.
    insertRaw(db, { ts: '2026-07-12T10:00:00.000Z', stationSid: 0, seconds: 30 });
    // Old, already measured → skip.
    insertRaw(db, { ts: '2026-07-12T09:00:00.000Z', stationSid: 1, seconds: 30, peakW: 40, energyWh: 0.5 });
    // Fresh, not settled → skip.
    const now = base + 10 * 60 * 1000; // 10 min after the first event
    insertRaw(db, { ts: new Date(now - 5_000).toISOString(), stationSid: 2, seconds: 30 });

    const pending = listEnergyPending(db, now);
    expect(pending).toHaveLength(1);
    expect(pending[0].kind).toBe('irrigation');
    expect(pending[0].seconds).toBe(30);
    expect(pending[0].ts).toBe('2026-07-12T10:00:00.000Z');
  });

  it('excludes rows older than the retry window (abandons permanent gaps)', () => {
    const db = freshDb();
    insertRaw(db, { ts: '2026-07-01T00:00:00.000Z', stationSid: 0, seconds: 30 }); // settled but ancient
    const now = Date.parse('2026-07-13T00:00:00.000Z'); // ~12 days later
    expect(listEnergyPending(db, now)).toHaveLength(0);
  });
});

describe('pumpTagsForKind', () => {
  it('maps each kind to its plug tag pair', () => {
    expect(pumpTagsForKind('irrigation')).toEqual({ node: 'irrigation-pump', entity: 'pump_power' });
    expect(pumpTagsForKind('runoff')).toEqual({ node: 'runoff-monitor', entity: 'runoff_pump_power' });
  });
});
