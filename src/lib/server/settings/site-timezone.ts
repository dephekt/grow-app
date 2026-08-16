// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import type { DatabaseSync } from 'node:sqlite';
import { env } from '$lib/server/env';
import { isValidTimeZone } from '$lib/server/tz/valid';
import { getSettingsDb } from '$lib/server/settings/db';
import { getSetting, setSetting } from '$lib/server/settings/store';

/**
 * The one IANA site timezone: persisted-first, env-fallback resolver shared by the
 * scheduler, the SSE snapshot, and the MQTT reconciler.
 * The module cache starts cold, so an unwarmed resolve never opens the settings DB.
 */

const SETTING_KEY = 'site_timezone';

/** `warm` distinguishes "not read yet" (cold — env chain only) from "read, no row"
 *  (warm, `stored: null` — env chain, but deliberately, not accidentally). */
const cache: { warm: boolean; stored: string | null } = { warm: false, stored: null };

/** Load the persisted zone into the cache, from the web-app boot path only and never
 *  from the recorder. */
export function warmSiteTimeZone(db: DatabaseSync = getSettingsDb()): void {
  cache.stored = getSetting(db, SETTING_KEY) ?? null;
  cache.warm = true;
}

/** Test-only: drop the cache back to cold. */
export function resetSiteTimeZoneCache(): void {
  cache.warm = false;
  cache.stored = null;
}

/** The persisted zone, or undefined when the cache is cold or holds no row; never opens the DB. */
export function storedSiteTimeZone(): string | undefined {
  return cache.warm ? (cache.stored ?? undefined) : undefined;
}

export type TimeZoneSource = 'stored' | 'schedule-env' | 'tz-env' | 'host' | 'utc';

/**
 * Resolve the effective site zone and where it came from — first *present* candidate of
 * persisted setting → `GROW_SCHEDULE_TZ` → `TZ` → host zone → `UTC`, validated once so an
 * invalid zone degrades to UTC instead of falling through to the next candidate.
 */
export function resolveSiteTimeZone(): { zone: string; source: TimeZoneSource } {
  const candidates: Array<{ zone: string | undefined; source: TimeZoneSource }> = [
    { zone: storedSiteTimeZone(), source: 'stored' },
    { zone: env('GROW_SCHEDULE_TZ'), source: 'schedule-env' },
    { zone: env('TZ'), source: 'tz-env' },
    { zone: Intl.DateTimeFormat().resolvedOptions().timeZone, source: 'host' }
  ];
  const chosen = candidates.find((c) => c.zone !== undefined);
  const zone = chosen?.zone ?? 'UTC';
  const source = chosen?.source ?? 'utc';
  if (isValidTimeZone(zone)) return { zone, source };
  console.error(
    `[schedule] invalid time zone "${zone}" (GROW_SCHEDULE_TZ/TZ); falling back to UTC`
  );
  return { zone: 'UTC', source: 'utc' };
}

/**
 * The zone the MQTT reconciler should push to devices, or undefined to push nothing —
 * only an *intentional* zone (persisted or an explicit env override) reaches hardware.
 */
export function deviceDesiredTimeZone(): string | undefined {
  const { zone, source } = resolveSiteTimeZone();
  return source === 'stored' || source === 'schedule-env' || source === 'tz-env' ? zone : undefined;
}

/** Persist a new site zone and refresh the cache so subsequent reads see it without a restart. */
export function setSiteTimeZone(iana: string): void {
  setSetting(getSettingsDb(), SETTING_KEY, iana);
  warmSiteTimeZone();
}
