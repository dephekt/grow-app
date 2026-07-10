import { describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openSettingsDb } from '../../src/lib/server/settings/db';
import { getSetting, setSetting } from '../../src/lib/server/settings/store';

function freshDb(): DatabaseSync {
  return openSettingsDb(':memory:');
}

describe('settings KV store', () => {
  it('creates app_settings at user_version 1', () => {
    const db = freshDb();
    const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
    expect(user_version).toBe(1);
    // The table exists and is queryable.
    expect(getSetting(db, 'anything')).toBeUndefined();
  });

  it('round-trips a set then get', () => {
    const db = freshDb();
    setSetting(db, 'site_timezone', 'America/Chicago');
    expect(getSetting(db, 'site_timezone')).toBe('America/Chicago');
  });

  it('overwrites the value and bumps updated_at on a second set', () => {
    const db = freshDb();
    setSetting(db, 'site_timezone', 'America/Chicago');
    const first = db
      .prepare('SELECT updated_at FROM app_settings WHERE key = ?')
      .get('site_timezone') as { updated_at: string };

    setSetting(db, 'site_timezone', 'Europe/Berlin');
    const second = db
      .prepare('SELECT value, updated_at FROM app_settings WHERE key = ?')
      .get('site_timezone') as { value: string; updated_at: string };

    expect(second.value).toBe('Europe/Berlin');
    // Still a single row (upsert, not insert).
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM app_settings').get() as { n: number };
    expect(n).toBe(1);
    // updated_at is re-stamped and never moves backwards.
    expect(second.updated_at >= first.updated_at).toBe(true);
  });

  it('returns undefined for an absent key', () => {
    const db = freshDb();
    expect(getSetting(db, 'missing')).toBeUndefined();
  });
});
