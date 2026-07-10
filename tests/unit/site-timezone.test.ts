import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openSettingsDb } from '../../src/lib/server/settings/db';
import { setSetting } from '../../src/lib/server/settings/store';
import {
  deviceDesiredTimeZone,
  resetSiteTimeZoneCache,
  resolveSiteTimeZone,
  storedSiteTimeZone,
  warmSiteTimeZone
} from '../../src/lib/server/settings/site-timezone';

// Both env keys the resolver consults; saved and cleared so a stray host TZ can't
// leak into the "cold cache falls through the env chain" assertions.
const KEYS = ['GROW_SCHEDULE_TZ', 'TZ'];
const saved: Record<string, string | undefined> = {};

function setEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  resetSiteTimeZoneCache();
  KEYS.forEach((k) => {
    saved[k] = process.env[k];
    delete process.env[k];
  });
});

afterEach(() => {
  KEYS.forEach((k) => setEnv(k, saved[k]));
  resetSiteTimeZoneCache();
  vi.restoreAllMocks();
});

describe('storedSiteTimeZone cache', () => {
  it('is undefined while the cache is cold (never warmed, no DB read)', () => {
    // No warm call → no SELECT, no getSettingsDb(). The recorder relies on this to
    // build snapshots without ever opening the settings DB.
    expect(storedSiteTimeZone()).toBeUndefined();
  });

  it('is undefined when warmed against a DB with no stored row', () => {
    const db = openSettingsDb(':memory:');
    warmSiteTimeZone(db);
    // warm, but stored: null → still undefined (deliberately, via the env chain).
    expect(storedSiteTimeZone()).toBeUndefined();
  });

  it('returns the persisted zone once warmed', () => {
    const db = openSettingsDb(':memory:');
    setSetting(db, 'site_timezone', 'America/Chicago');
    warmSiteTimeZone(db);
    expect(storedSiteTimeZone()).toBe('America/Chicago');
  });
});

describe('resolveSiteTimeZone provenance', () => {
  it('uses the env chain when the cache is cold', () => {
    setEnv('GROW_SCHEDULE_TZ', 'America/Toronto');
    expect(resolveSiteTimeZone()).toEqual({ zone: 'America/Toronto', source: 'schedule-env' });
  });

  it('lets the persisted zone win over GROW_SCHEDULE_TZ', () => {
    const db = openSettingsDb(':memory:');
    setSetting(db, 'site_timezone', 'America/Chicago');
    warmSiteTimeZone(db);
    setEnv('GROW_SCHEDULE_TZ', 'America/Toronto');
    expect(resolveSiteTimeZone()).toEqual({ zone: 'America/Chicago', source: 'stored' });
  });

  it('falls to TZ when GROW_SCHEDULE_TZ is unset', () => {
    setEnv('TZ', 'Europe/Berlin');
    expect(resolveSiteTimeZone()).toEqual({ zone: 'Europe/Berlin', source: 'tz-env' });
  });

  it('reports the host zone when nothing is stored or overridden', () => {
    // Host TZ is valid in the test runtime, so source is 'host', not 'utc'.
    expect(resolveSiteTimeZone().source).toBe('host');
  });

  it('degrades an invalid chosen candidate to UTC with a logged error', () => {
    setEnv('GROW_SCHEDULE_TZ', 'America/Teronto');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(resolveSiteTimeZone()).toEqual({ zone: 'UTC', source: 'utc' });
    expect(spy).toHaveBeenCalled();
  });
});

describe('deviceDesiredTimeZone provenance matrix', () => {
  it('returns the persisted zone (source stored)', () => {
    const db = openSettingsDb(':memory:');
    setSetting(db, 'site_timezone', 'America/Chicago');
    warmSiteTimeZone(db);
    expect(deviceDesiredTimeZone()).toBe('America/Chicago');
  });

  it('returns the GROW_SCHEDULE_TZ override (source schedule-env)', () => {
    setEnv('GROW_SCHEDULE_TZ', 'America/Toronto');
    expect(deviceDesiredTimeZone()).toBe('America/Toronto');
  });

  it('returns the TZ override (source tz-env)', () => {
    setEnv('TZ', 'Europe/Berlin');
    expect(deviceDesiredTimeZone()).toBe('Europe/Berlin');
  });

  it('returns undefined when the zone is merely inferred from the host', () => {
    expect(resolveSiteTimeZone().source).toBe('host');
    expect(deviceDesiredTimeZone()).toBeUndefined();
  });

  it('returns undefined when an invalid override degrades to UTC (source utc)', () => {
    setEnv('GROW_SCHEDULE_TZ', 'America/Teronto');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(deviceDesiredTimeZone()).toBeUndefined();
  });
});
