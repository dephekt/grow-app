// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openClimateDb } from '../../src/lib/server/climate/db';
import {
  ClimateConfigError,
  countClimateEvents,
  getClimateConfig,
  latestClimateEventId,
  listClimateEvents,
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
    expect(() => updateClimateConfig(db, { mode: 'auto' as never }, NOW_ISO)).toThrow(ClimateConfigError);
    expect(() => updateClimateConfig(db, { rhSource: 'magic' as never }, NOW_ISO)).toThrow(ClimateConfigError);
  });

  it('rejects out-of-range numbers', () => {
    expect(() => updateClimateConfig(db, { deadbandKpa: 0 }, NOW_ISO)).toThrow(ClimateConfigError);
    expect(() => updateClimateConfig(db, { deadbandKpa: 5 }, NOW_ISO)).toThrow(ClimateConfigError);
    expect(() => updateClimateConfig(db, { minOnSeconds: -1 }, NOW_ISO)).toThrow(ClimateConfigError);
  });

  it('rejects a vent floor at or above the vent ceiling', () => {
    // Otherwise every tick would both force and block the fan.
    expect(() => updateClimateConfig(db, { ventNeverBelowC: 29, ventAlwaysAboveC: 28 }, NOW_ISO)).toThrow(
      ClimateConfigError
    );
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
    recordClimateEvent(db, { ...base, action: { kind: 'exhaust', on: true, reason: 'below band' } });
    const [row] = listClimateEvents(db);
    expect(row).toMatchObject({ kind: 'exhaust', actuator: 'exhaust', on: true, reason: 'below band' });
    expect(row.airVpd).toBe(0.85);
    expect(row.leafVpd).toBe(0.57);
  });

  it('records a hold with no actuator', () => {
    recordClimateEvent(db, { ...base, action: { kind: 'hold', reason: 'inside band' } });
    const [row] = listClimateEvents(db);
    expect(row.actuator).toBeNull();
    expect(row.on).toBeNull();
  });

  it('keeps the wanted actuator on delegated and blocked rows', () => {
    recordClimateEvent(db, { ...base, action: { kind: 'delegated', want: 'humidify', reason: 'humidistat owns RH' } });
    recordClimateEvent(db, { ...base, action: { kind: 'blocked', want: 'exhaust', reason: 'too cold' } });
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
    recordClimateEvent(db, { ...base, ts: '2026-08-14T12:09:00.000Z', action: { kind: 'hold', reason: 'later' } });
    const page2 = listClimateEvents(db, 2, 2, anchor);
    expect(page2.map((r) => r.reason)).toEqual(['tick 2', 'tick 1']);
    expect(countClimateEvents(db, anchor)).toBe(5);
  });

  it('reports a zero anchor on an empty log', () => {
    expect(latestClimateEventId(db)).toBe(0);
    expect(listClimateEvents(db)).toEqual([]);
  });
});

describe('RollingMedian', () => {
  it('is null until a sample lands', () => {
    expect(new RollingMedian(1000).value()).toBeNull();
  });

  it('rejects a single outlier that a mean would follow', () => {
    const m = new RollingMedian(60_000);
    for (const v of [1.0, 1.01, 0.99, 1.0]) m.push(v, 0);
    m.push(9.9, 0);
    expect(m.value()).toBeCloseTo(1.0, 2);
  });

  it('averages the middle pair on an even count', () => {
    const m = new RollingMedian(60_000);
    m.push(1, 0);
    m.push(2, 0);
    expect(m.value()).toBe(1.5);
  });

  it('ages samples out of the window', () => {
    const m = new RollingMedian(10_000);
    m.push(5, 0);
    m.push(1, 20_000);
    expect(m.value()).toBe(1);
    expect(m.size).toBe(1);
  });

  it('drops future-dated samples so a backwards clock cannot strand them', () => {
    const m = new RollingMedian(10_000);
    m.push(9, 100_000);
    m.push(1, 1_000);
    expect(m.value()).toBe(1);
  });

  it('resets to empty', () => {
    const m = new RollingMedian(10_000);
    m.push(1, 0);
    m.reset();
    expect(m.value()).toBeNull();
  });
});
