import { env } from '$lib/server/env';

/**
 * DST-correct wall-clock ↔ UTC conversion with no tz library. Schedules store local
 * times (minutes-past-local-midnight); firing needs the real UTC instant a given
 * wall time maps to *at that date*, which shifts by the zone's DST offset. We lean on
 * the platform's IANA tz database via `Intl.DateTimeFormat` rather than pulling in a
 * dependency — Node ships full-tz ICU, so `America/Toronto` resolves correctly.
 */

/** The zone all schedule wall-clock times are interpreted in. Explicit override
 *  first, then the process TZ, then the host's resolved zone, then UTC. */
export function getScheduleTimeZone(): string {
  return (
    env('GROW_SCHEDULE_TZ') ??
    env('TZ') ??
    Intl.DateTimeFormat().resolvedOptions().timeZone ??
    'UTC'
  );
}

/** Read the year/month/day/hour/minute/second a UTC instant shows on the wall in `tz`. */
function wallParts(instantMs: number, tz: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(new Date(instantMs));
  const map: Record<string, number> = {};
  for (const part of parts) if (part.type !== 'literal') map[part.type] = Number(part.value);
  return map;
}

/**
 * Signed offset (local − UTC) in ms that `tz` is at the given instant. West-of-UTC
 * zones are negative (e.g. Toronto EDT ≈ −4h). Computed by reading the instant's wall
 * clock in `tz`, re-interpreting those digits as if they were UTC, and diffing.
 */
export function tzOffsetMs(instantMs: number, tz: string): number {
  const p = wallParts(instantMs, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - instantMs;
}

/** Local calendar date (1-based month) that a UTC instant falls on in `tz`. */
export function localDateParts(nowMs: number, tz: string): { year: number; month: number; day: number } {
  const p = wallParts(nowMs, tz);
  return { year: p.year, month: p.month, day: p.day };
}

/**
 * The UTC instant a local wall time (`year`/`month` [1-based]/`day` + minutes-past-
 * midnight) maps to in `tz`. `Date.UTC(...)` gives the instant *if the wall time were
 * UTC*; subtracting the zone offset shifts it to the real instant. The offset itself
 * depends on the instant (DST), so we correct once: the offset sampled at the true
 * instant can differ from the one sampled at the naive guess across a transition.
 *
 * Nonexistent (spring-forward gap) and ambiguous (fall-back overlap) wall times still
 * resolve to a single deterministic instant — good enough here because the `last_fired`
 * dedup collapses the twin a fall-back would otherwise produce.
 */
export function zonedMinutesToInstant(
  year: number,
  month: number,
  day: number,
  minutes: number,
  tz: string
): number {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const inst = guess - tzOffsetMs(guess, tz);
  // Re-sample the offset at the resolved instant; only differs across a DST boundary.
  const corrected = guess - tzOffsetMs(inst, tz);
  return corrected;
}
