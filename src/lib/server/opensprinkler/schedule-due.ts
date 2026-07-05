import { localDateParts, zonedMinutesToInstant } from './schedule-time';

export interface ScheduleDue {
  /** Fire now: a fresh, not-yet-fired slot sits within the grace window. */
  shouldFire: boolean;
  /** The instant of the slot to fire (the dedup + skip-missed anchor), or null. */
  dueAt: number | null;
  /** The next upcoming slot instant after `now`, for the "Next run" display. */
  nextDueAt: number | null;
}

/** Shift a local calendar date by whole days, normalizing month/year rollovers.
 *  Plain UTC date arithmetic — no zone involved, it's only a calendar calculator. */
function shiftDate(
  date: { year: number; month: number; day: number },
  days: number
): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * Level-triggered "should this schedule fire right now?" — pure and deterministic, so
 * the whole firing decision unit-tests without a clock or a DB. Given the schedule's
 * local times, its last-fired anchor, the current instant, the zone, and a grace
 * window, it reports whether the most-recent past slot is due and what the next one is.
 *
 * Skip-missed is an absolute grace window: a slot fires only while `now − slot ≤ grace`.
 * Miss the window (app down, busy) and the slot is never resurrected — the next tick
 * simply targets the following slot. Only ever the single most-recent past slot is a
 * candidate, so a long outage can't fire a backlog.
 */
export function computeScheduleDue(
  minutes: number[],
  lastFiredAtMs: number | null,
  nowMs: number,
  tz: string,
  graceMs: number
): ScheduleDue {
  const times = [...new Set(minutes.filter((m) => Number.isInteger(m) && m >= 0 && m <= 1439))];
  if (times.length === 0) return { shouldFire: false, dueAt: null, nextDueAt: null };

  // Local yesterday/today/tomorrow cover every slot that could be the most-recent past
  // or the next upcoming one, even across a midnight boundary in `tz`.
  const today = localDateParts(nowMs, tz);
  let prev: number | null = null;
  let next: number | null = null;
  for (const shift of [-1, 0, 1]) {
    const date = shiftDate(today, shift);
    for (const minute of times) {
      const inst = zonedMinutesToInstant(date.year, date.month, date.day, minute, tz);
      if (inst <= nowMs) {
        if (prev === null || inst > prev) prev = inst;
      } else if (next === null || inst < next) {
        next = inst;
      }
    }
  }

  const fresh = prev !== null && nowMs - prev <= graceMs;
  const unfired = lastFiredAtMs === null || (prev !== null && prev > lastFiredAtMs);
  const shouldFire = fresh && unfired;
  return { shouldFire, dueAt: shouldFire ? prev : null, nextDueAt: next };
}
