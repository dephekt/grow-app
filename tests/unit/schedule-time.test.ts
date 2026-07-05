import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getScheduleTimeZone,
  localDateParts,
  tzOffsetMs,
  zonedMinutesToInstant
} from '../../src/lib/server/opensprinkler/schedule-time';

const TZ = 'America/Toronto';

describe('schedule-time DST conversion', () => {
  it('maps a 06:00 local shot to the right UTC instant across DST', () => {
    // Summer (EDT, UTC−4): 06:00 → 10:00Z. Winter (EST, UTC−5): 06:00 → 11:00Z.
    expect(new Date(zonedMinutesToInstant(2026, 7, 15, 360, TZ)).toISOString()).toBe('2026-07-15T10:00:00.000Z');
    expect(new Date(zonedMinutesToInstant(2026, 1, 15, 360, TZ)).toISOString()).toBe('2026-01-15T11:00:00.000Z');
  });

  it('reports a signed offset that flips with the season', () => {
    // EDT is −4h, EST is −5h.
    expect(tzOffsetMs(Date.UTC(2026, 6, 15, 12, 0), TZ)).toBe(-4 * 3600_000);
    expect(tzOffsetMs(Date.UTC(2026, 0, 15, 12, 0), TZ)).toBe(-5 * 3600_000);
  });

  it('resolves the spring-forward gap to a single deterministic instant', () => {
    // Mar 8 2026: 02:00 → 03:00 skips 02:00–02:59. A daytime 06:00 is already EDT.
    expect(new Date(zonedMinutesToInstant(2026, 3, 8, 360, TZ)).toISOString()).toBe('2026-03-08T10:00:00.000Z');
    // The nonexistent 02:30 still yields one stable instant (interpreted as EDT here).
    const gap = zonedMinutesToInstant(2026, 3, 8, 150, TZ);
    expect(new Date(gap).toISOString()).toBe('2026-03-08T06:30:00.000Z');
    expect(zonedMinutesToInstant(2026, 3, 8, 150, TZ)).toBe(gap); // deterministic
  });

  it('resolves the fall-back overlap to a single deterministic instant', () => {
    // Nov 1 2026: 02:00 → 01:00 repeats 01:00–01:59. A daytime 06:00 is EST.
    expect(new Date(zonedMinutesToInstant(2026, 11, 1, 360, TZ)).toISOString()).toBe('2026-11-01T11:00:00.000Z');
    // The ambiguous 01:30 collapses to one stable instant (the last_fired dedup then
    // swallows the twin the repeated wall hour would otherwise fire twice).
    const overlap = zonedMinutesToInstant(2026, 11, 1, 90, TZ);
    expect(zonedMinutesToInstant(2026, 11, 1, 90, TZ)).toBe(overlap);
  });

  it('reads the local calendar date an instant falls on', () => {
    // 03:00Z on Jul 15 is 23:00 the previous evening in Toronto (EDT).
    expect(localDateParts(Date.UTC(2026, 6, 15, 3, 0), TZ)).toEqual({ year: 2026, month: 7, day: 14 });
    expect(localDateParts(Date.UTC(2026, 6, 15, 12, 0), TZ)).toEqual({ year: 2026, month: 7, day: 15 });
  });
});

describe('getScheduleTimeZone', () => {
  const KEYS = ['GROW_SCHEDULE_TZ', 'TZ'];
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    KEYS.forEach((k) => {
      saved[k] = process.env[k];
      delete process.env[k];
    });
  });
  afterEach(() => {
    KEYS.forEach((k) => {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    });
    vi.restoreAllMocks();
  });

  it('passes a valid IANA zone through', () => {
    process.env.GROW_SCHEDULE_TZ = 'America/Toronto';
    expect(getScheduleTimeZone()).toBe('America/Toronto');
  });

  it('degrades a typo to UTC (no throw) with a logged warning', () => {
    process.env.GROW_SCHEDULE_TZ = 'America/Teronto';
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(getScheduleTimeZone()).toBe('UTC');
    expect(spy).toHaveBeenCalled();
  });
});
