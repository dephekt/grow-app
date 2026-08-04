// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { resolveSiteTimeZone } from '$lib/server/settings/site-timezone';

/** DST-correct wall-clock to UTC conversion using the platform's IANA database via Intl,
 *  with no tz dependency. */

/** The one zone schedule times are interpreted in; a typo'd override degrades to UTC with a
 *  warning rather than throwing in the tz math. */
export function getScheduleTimeZone(): string {
  return resolveSiteTimeZone().zone;
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

/** Signed offset (local − UTC) at an instant, by re-reading the wall clock as if it were UTC. */
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

/** The UTC instant a local wall time maps to, corrected once because the offset itself depends
 *  on the instant across a DST transition. */
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
