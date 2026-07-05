import { describe, expect, it } from 'vitest';
import { computeScheduleDue } from '../../src/lib/server/opensprinkler/schedule-due';
import { zonedMinutesToInstant } from '../../src/lib/server/opensprinkler/schedule-time';

const TZ = 'America/Toronto';
const GRACE = 5 * 60_000;

// Build a slot instant from a local date + minutes-past-midnight. schedule-time has
// its own dedicated DST test; here we lean on it to express expectations legibly and
// exercise computeScheduleDue's *selection* logic.
const at = (y: number, mo: number, d: number, min: number) => zonedMinutesToInstant(y, mo, d, min, TZ);

describe('computeScheduleDue', () => {
  it('fires the most-recent past slot when it is fresh and unfired', () => {
    const slot = at(2026, 7, 15, 360); // 06:00 local → 10:00Z
    const r = computeScheduleDue([360], null, slot + 30_000, TZ, GRACE);
    expect(r.shouldFire).toBe(true);
    expect(r.dueAt).toBe(slot);
    expect(r.nextDueAt).toBe(at(2026, 7, 16, 360)); // tomorrow's 06:00
  });

  it('skips a slot once it falls outside the grace window', () => {
    const slot = at(2026, 7, 15, 360);
    const r = computeScheduleDue([360], null, slot + 6 * 60_000, TZ, GRACE);
    expect(r.shouldFire).toBe(false);
    expect(r.dueAt).toBeNull();
    // The missed slot is not resurrected; the next candidate is tomorrow's.
    expect(r.nextDueAt).toBe(at(2026, 7, 16, 360));
  });

  it('does not re-fire a slot already recorded as last_fired', () => {
    const slot = at(2026, 7, 15, 360);
    const r = computeScheduleDue([360], slot, slot + 30_000, TZ, GRACE);
    expect(r.shouldFire).toBe(false);
    expect(r.dueAt).toBeNull();
  });

  it('fires again once a newer slot arrives past the previous last_fired', () => {
    const slot = at(2026, 7, 15, 360);
    const r = computeScheduleDue([360], at(2026, 7, 14, 360), slot + 30_000, TZ, GRACE);
    expect(r.shouldFire).toBe(true);
    expect(r.dueAt).toBe(slot);
  });

  it('picks the most-recent past slot when several have passed', () => {
    const now = at(2026, 7, 15, 420) + 30_000; // just after 07:00
    const r = computeScheduleDue([360, 420], null, now, TZ, GRACE);
    expect(r.shouldFire).toBe(true);
    expect(r.dueAt).toBe(at(2026, 7, 15, 420)); // 07:00, not 06:00
  });

  it('crosses midnight for the next-due slot', () => {
    const now = at(2026, 7, 15, 1410); // 23:30 local; today's 00:30 slot long gone
    const r = computeScheduleDue([30], null, now, TZ, GRACE);
    expect(r.shouldFire).toBe(false);
    expect(r.nextDueAt).toBe(at(2026, 7, 16, 30)); // tomorrow's 00:30 (next local day)
  });

  it('treats duplicate times as one slot', () => {
    const slot = at(2026, 7, 15, 360);
    const r = computeScheduleDue([360, 360], null, slot + 30_000, TZ, GRACE);
    expect(r.shouldFire).toBe(true);
    expect(r.dueAt).toBe(slot);
    expect(r.nextDueAt).toBe(at(2026, 7, 16, 360));
  });

  it('returns nulls for empty or fully out-of-range times', () => {
    const now = at(2026, 7, 15, 720);
    expect(computeScheduleDue([], null, now, TZ, GRACE)).toEqual({ shouldFire: false, dueAt: null, nextDueAt: null });
    expect(computeScheduleDue([-5, 1500, 3.5], null, now, TZ, GRACE)).toEqual({
      shouldFire: false,
      dueAt: null,
      nextDueAt: null
    });
  });
});
