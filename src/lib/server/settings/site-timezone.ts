import type { DatabaseSync } from 'node:sqlite';
import { env } from '$lib/server/env';
import { isValidTimeZone } from '$lib/server/tz/valid';
import { getSettingsDb } from '$lib/server/settings/db';
import { getSetting, setSetting } from '$lib/server/settings/store';

/**
 * The one IANA site timezone: persisted-first, env-fallback resolver shared by the
 * scheduler, the SSE snapshot, and the MQTT reconciler. IANA is the single source of
 * truth — the POSIX form is derived elsewhere (tz/posix-tz.ts) only at the publish
 * boundary and never flows through here.
 *
 * Everything is synchronous. The stored value is read once into a module cache so the
 * hot paths (every schedule tick, every snapshot) touch memory, not SQLite. Crucially
 * the cache starts *cold*: `storedSiteTimeZone()` returns undefined until something on
 * the web-app path calls `warmSiteTimeZone()`. The read-only history recorder builds
 * snapshots without ever warming or opening the settings DB, so an unwarmed
 * `resolveSiteTimeZone()` falls straight through to the env chain with zero DB access.
 */

const SETTING_KEY = 'site_timezone';

/** `warm` distinguishes "not read yet" (cold — env chain only) from "read, no row"
 *  (warm, `stored: null` — env chain, but deliberately, not accidentally). */
const cache: { warm: boolean; stored: string | null } = { warm: false, stored: null };

/** Load the persisted zone into the cache with a single SELECT. Called once from the
 *  web-app boot path (hooks.server.ts), never from the recorder. Defaults to the
 *  process-wide settings DB; tests pass an in-memory handle. */
export function warmSiteTimeZone(db: DatabaseSync = getSettingsDb()): void {
  cache.stored = getSetting(db, SETTING_KEY) ?? null;
  cache.warm = true;
}

/** Test-only: drop the cache back to cold so a fresh warm/env combination can be
 *  exercised without cross-test leakage. */
export function resetSiteTimeZoneCache(): void {
  cache.warm = false;
  cache.stored = null;
}

/** The persisted zone, or undefined when the cache is cold (never warmed) or warm
 *  with no stored row. Never opens the DB — the recorder relies on this so its
 *  snapshots stay DB-free. */
export function storedSiteTimeZone(): string | undefined {
  return cache.warm ? (cache.stored ?? undefined) : undefined;
}

export type TimeZoneSource = 'stored' | 'schedule-env' | 'tz-env' | 'host' | 'utc';

/**
 * Resolve the effective site zone and where it came from. First *present* candidate of
 * persisted setting → `GROW_SCHEDULE_TZ` → `TZ` → host zone → `UTC`. The chosen
 * candidate is validated once; a typo (e.g. `America/Teronto`) degrades to UTC with a
 * logged warning rather than throwing deep in the tz math on every tick — it does not
 * fall through to the next candidate, matching the long-standing scheduler behavior.
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
  console.error(`[schedule] invalid time zone "${zone}" (GROW_SCHEDULE_TZ/TZ); falling back to UTC`);
  return { zone: 'UTC', source: 'utc' };
}

/**
 * The zone the MQTT reconciler should push to devices, or undefined to push nothing.
 * Only an *intentional* zone (persisted or an explicit env override) is pushed; a zone
 * merely inferred from the host, or the UTC degrade, leaves device `time_zone` entities
 * untouched so we never stamp an accidental value onto hardware.
 */
export function deviceDesiredTimeZone(): string | undefined {
  const { zone, source } = resolveSiteTimeZone();
  return source === 'stored' || source === 'schedule-env' || source === 'tz-env' ? zone : undefined;
}

/** Persist a new site zone and refresh the cache so subsequent reads see it without a
 *  restart. Writes through the process-wide settings DB (web-app path only). */
export function setSiteTimeZone(iana: string): void {
  setSetting(getSettingsDb(), SETTING_KEY, iana);
  warmSiteTimeZone();
}
