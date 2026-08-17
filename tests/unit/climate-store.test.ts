// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MIGRATIONS, openClimateDb } from '../../src/lib/server/climate/db';
import {
  ClimateConfigError,
  countClimateEvents,
  getClimateConfig,
  latestClimateEventId,
  listClimateEvents,
  pruneClimateEvents,
  recordClimateEvent,
  updateClimateConfig
} from '../../src/lib/server/climate/store';
import { DEFAULT_CLIMATE_CONFIG } from '../../src/lib/climate/model';
import { RollingMedian } from '../../src/lib/climate/smoothing';

const NOW_ISO = '2026-08-14T12:00:00.000Z';

let db: DatabaseSync;
beforeEach(() => {
  db = openClimateDb(':memory:');
});

describe('climate config', () => {
  it('seeds the shipped defaults, which leave the loop inert', () => {
    const config = getClimateConfig(db);
    expect(config).toEqual(DEFAULT_CLIMATE_CONFIG);
    expect(config.mode).toBe('observe');
    expect(config.exhaustSource).toBe('firmware');
    expect(config.rhSource).toBe('external');
  });

  it('applies a partial patch and leaves the rest alone', () => {
    const next = updateClimateConfig(db, { mode: 'active', exhaustSource: 'loop' }, NOW_ISO);
    expect(next.mode).toBe('active');
    expect(next.exhaustSource).toBe('loop');
    expect(next.deadbandKpa).toBe(DEFAULT_CLIMATE_CONFIG.deadbandKpa);
    expect(getClimateConfig(db)).toEqual(next);
  });

  it('rejects an unknown mode or source', () => {
    expect(() => updateClimateConfig(db, { mode: 'auto' as never }, NOW_ISO)).toThrow(
      ClimateConfigError
    );
    expect(() => updateClimateConfig(db, { rhSource: 'magic' as never }, NOW_ISO)).toThrow(
      ClimateConfigError
    );
  });

  it('rejects out-of-range numbers', () => {
    expect(() => updateClimateConfig(db, { deadbandKpa: 0 }, NOW_ISO)).toThrow(ClimateConfigError);
    expect(() => updateClimateConfig(db, { deadbandKpa: 5 }, NOW_ISO)).toThrow(ClimateConfigError);
    expect(() => updateClimateConfig(db, { minOnSeconds: -1 }, NOW_ISO)).toThrow(
      ClimateConfigError
    );
  });

  it('rejects a vent floor at or above the vent ceiling', () => {
    // Otherwise every tick would both force and block the fan.
    expect(() =>
      updateClimateConfig(db, { ventNeverBelowC: 29, ventAlwaysAboveC: 28 }, NOW_ISO)
    ).toThrow(ClimateConfigError);
  });

  it('writes nothing when validation fails', () => {
    expect(() => updateClimateConfig(db, { mode: 'active', deadbandKpa: 99 }, NOW_ISO)).toThrow();
    expect(getClimateConfig(db).mode).toBe('observe');
  });

  it('recreates the singleton row rather than silently saving nothing', () => {
    // A DB restored from a partial copy could be missing it; an UPDATE ... WHERE id = 1 would
    // match zero rows while still reporting success, and the PATCH response would contradict
    // itself when the route re-read the config.
    db.exec('DELETE FROM climate_config');
    const next = updateClimateConfig(db, { mode: 'active', exhaustSource: 'loop' }, NOW_ISO);
    expect(next.mode).toBe('active');
    expect(getClimateConfig(db)).toEqual(next);
  });

  it('clamps a stored numeric that predates the bounds', () => {
    // The write path validates; before this the read path trusted, so a hand-edited or restored
    // row could hand the loop a 24 h minimum-on with no error.
    updateClimateConfig(db, {}, NOW_ISO); // the migration seeds no row; upsert one to edit
    db.prepare(
      'UPDATE climate_config SET min_on_seconds = 86400, deadband_kpa = -5 WHERE id = 1'
    ).run();
    const config = getClimateConfig(db);
    expect(config.minOnSeconds).toBe(3600);
    expect(config.deadbandKpa).toBe(0.01);
  });

  it('round-trips a null override back to the plan', () => {
    updateClimateConfig(db, { airVpdOverride: 1.05 }, NOW_ISO);
    expect(getClimateConfig(db).airVpdOverride).toBe(1.05);
    updateClimateConfig(db, { airVpdOverride: null }, NOW_ISO);
    expect(getClimateConfig(db).airVpdOverride).toBeNull();
  });
});

describe('climate events', () => {
  const base = {
    ts: NOW_ISO,
    mode: 'active' as const,
    published: true,
    airVpd: 0.85,
    airVpdFast: 0.92,
    leafVpd: 0.57,
    target: 1.0,
    bandLow: 0.9,
    bandHigh: 1.1,
    tentTempC: 29.5,
    tentRhPct: 78,
    roomTempC: 25,
    roomRhPct: 55,
    lightsOn: true
  };

  it('records the actuator and direction for a command', () => {
    recordClimateEvent(db, {
      ...base,
      action: { kind: 'exhaust', on: true, reason: 'below band' }
    });
    const [row] = listClimateEvents(db);
    expect(row).toMatchObject({
      kind: 'exhaust',
      actuator: 'exhaust',
      on: true,
      reason: 'below band'
    });
    expect(row.airVpd).toBe(0.85);
    expect(row.leafVpd).toBe(0.57);
  });

  it('clamps a kind it does not recognise, rather than handing one to an exhaustive switch', () => {
    // `kind` is bare TEXT and the table outlives the build that wrote it, so a row from another
    // version can carry anything. The display switches are exhaustive over the union now, so an
    // unclamped read would render "undefined" where it used to say "hold".
    db.prepare(
      `INSERT INTO climate_events (ts, kind, actuator, on_state, reason, mode, published,
         target, band_low, band_high)
       VALUES (?, 'dehumidify', NULL, NULL, 'from a future build', 'active', 1, 1.0, 0.9, 1.1)`
    ).run(NOW_ISO);

    const [row] = listClimateEvents(db);
    expect(row.kind).toBe('hold');
    expect(row.reason).toBe('from a future build');
  });

  it('records a hold with no actuator', () => {
    recordClimateEvent(db, { ...base, action: { kind: 'hold', reason: 'inside band' } });
    const [row] = listClimateEvents(db);
    expect(row.actuator).toBeNull();
    expect(row.on).toBeNull();
  });

  it('keeps the wanted actuator on delegated and blocked rows', () => {
    recordClimateEvent(db, {
      ...base,
      action: { kind: 'delegated', want: 'humidify', on: true, reason: 'humidistat owns RH' }
    });
    recordClimateEvent(db, {
      ...base,
      action: { kind: 'blocked', want: 'exhaust', on: true, reason: 'too cold' }
    });
    const rows = listClimateEvents(db);
    expect(rows.map((r) => [r.kind, r.actuator])).toEqual(
      expect.arrayContaining([
        ['delegated', 'humidify'],
        ['blocked', 'exhaust']
      ])
    );
  });

  it('distinguishes a dry-run row from a published one', () => {
    recordClimateEvent(db, {
      ...base,
      mode: 'observe',
      published: false,
      action: { kind: 'exhaust', on: true, reason: 'would vent' }
    });
    const [row] = listClimateEvents(db);
    expect(row.published).toBe(false);
    expect(row.mode).toBe('observe');
  });

  it('paginates newest-first against a stable anchor', () => {
    for (let i = 0; i < 5; i++) {
      recordClimateEvent(db, {
        ...base,
        ts: `2026-08-14T12:0${i}:00.000Z`,
        action: { kind: 'hold', reason: `tick ${i}` }
      });
    }
    const anchor = latestClimateEventId(db);
    expect(countClimateEvents(db, anchor)).toBe(5);

    const page1 = listClimateEvents(db, 2, 0, anchor);
    expect(page1.map((r) => r.reason)).toEqual(['tick 4', 'tick 3']);

    // A row inserted mid-read must not shift the second page.
    recordClimateEvent(db, {
      ...base,
      ts: '2026-08-14T12:09:00.000Z',
      action: { kind: 'hold', reason: 'later' }
    });
    const page2 = listClimateEvents(db, 2, 2, anchor);
    expect(page2.map((r) => r.reason)).toEqual(['tick 2', 'tick 1']);
    expect(countClimateEvents(db, anchor)).toBe(5);
  });

  it('prunes rows past the retention window and keeps the rest', () => {
    const at = (iso: string) => ({
      ...base,
      ts: iso,
      action: { kind: 'hold' as const, reason: iso }
    });
    recordClimateEvent(db, at('2026-05-01T00:00:00.000Z'));
    recordClimateEvent(db, at('2026-08-01T00:00:00.000Z'));
    recordClimateEvent(db, at('2026-08-14T00:00:00.000Z'));

    const now = Date.parse('2026-08-14T12:00:00.000Z');
    expect(pruneClimateEvents(db, now, 90)).toBe(1);
    expect(listClimateEvents(db).map((r) => r.reason)).toEqual([
      '2026-08-14T00:00:00.000Z',
      '2026-08-01T00:00:00.000Z'
    ]);
  });

  it('treats a retention of zero as disabled', () => {
    recordClimateEvent(db, {
      ...base,
      ts: '2020-01-01T00:00:00.000Z',
      action: { kind: 'hold', reason: 'ancient' }
    });
    expect(pruneClimateEvents(db, Date.parse('2026-08-14T12:00:00.000Z'), 0)).toBe(0);
    expect(listClimateEvents(db)).toHaveLength(1);
  });

  it('reports a zero anchor on an empty log', () => {
    expect(latestClimateEventId(db)).toBe(0);
    expect(listClimateEvents(db)).toEqual([]);
  });
});

describe('RollingMedian', () => {
  it('is null until a sample lands', () => {
    expect(new RollingMedian(1000).value(0)).toBeNull();
  });

  it('rejects a single outlier that a mean would follow', () => {
    const m = new RollingMedian(60_000);
    for (const v of [1.0, 1.01, 0.99, 1.0]) m.push(v, 0);
    m.push(9.9, 0);
    expect(m.value(0)).toBeCloseTo(1.0, 2);
  });

  it('averages the middle pair on an even count', () => {
    const m = new RollingMedian(60_000);
    m.push(1, 0);
    m.push(2, 0);
    expect(m.value(0)).toBe(1.5);
  });

  it('ages samples out of the window', () => {
    const m = new RollingMedian(10_000);
    m.push(5, 0);
    m.push(1, 20_000);
    expect(m.value(20_000)).toBe(1);
    expect(m.size).toBe(1);
  });

  it('drops future-dated samples so a backwards clock cannot strand them', () => {
    const m = new RollingMedian(10_000);
    m.push(9, 100_000);
    m.push(1, 1_000);
    expect(m.value(1_000)).toBe(1);
  });

  it('resets to empty', () => {
    const m = new RollingMedian(10_000);
    m.push(1, 0);
    m.reset();
    expect(m.value(0)).toBeNull();
  });

  it('windows on READ, so a reader that never pushes cannot be served a stale median', () => {
    const m = new RollingMedian(10_000);
    m.push(1, 0);
    expect(m.value(5_000)).toBe(1);
    expect(m.value(60_000)).toBeNull();
  });

  it('does not MUTATE on read — /api/climate reads the loop’s shared singleton', () => {
    // A read at a skewed or stale clock must not delete the samples the loop just pushed.
    const m = new RollingMedian(10_000);
    m.push(1, 5_000);
    expect(m.value(0)).toBeNull();
    expect(m.value(60_000)).toBeNull();
    expect(m.value(5_000)).toBe(1);
    expect(m.size).toBe(1);
  });
});

/**
 * Migration 2 lands on a live table — the deployed loop had already written a night of rows
 * before the fast reading existed — so the column has to arrive without disturbing them.
 */
describe('migration 2 — air_vpd_fast on an existing log', () => {
  it('adds the column to a v1 database, leaving earlier rows readable with a null', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'grow-climate-mig-')), 'climate.db');
    const old = new DatabaseSync(path);
    for (const migration of MIGRATIONS.slice(0, 1)) old.exec(migration);
    old.exec('PRAGMA user_version = 1');
    old
      .prepare(
        `INSERT INTO climate_events (ts, kind, reason, mode, published, air_vpd, target,
           band_low, band_high, lights_on)
         VALUES (?, 'hold', 'pre-migration row', 'active', 0, 0.99, 1.0, 0.9, 1.1, 0)`
      )
      .run(NOW_ISO);
    old.close();

    const db = openClimateDb(path);
    const [row] = listClimateEvents(db);
    expect(row.reason).toBe('pre-migration row');
    expect(row.airVpd).toBe(0.99);
    expect(row.airVpdFast).toBeNull();

    recordClimateEvent(db, {
      ts: NOW_ISO,
      action: { kind: 'exhaust', on: false, reason: 'top of band' },
      mode: 'active',
      published: true,
      airVpd: 1.02,
      airVpdFast: 1.14,
      leafVpd: null,
      target: 1.0,
      bandLow: 0.9,
      bandHigh: 1.1,
      tentTempC: 27,
      tentRhPct: 65,
      roomTempC: 24,
      roomRhPct: 55,
      lightsOn: true
    });
    const fresh = listClimateEvents(db).find((e) => e.reason === 'top of band');
    expect(fresh?.airVpd).toBe(1.02);
    expect(fresh?.airVpdFast).toBe(1.14);
    db.close();
  });
});
