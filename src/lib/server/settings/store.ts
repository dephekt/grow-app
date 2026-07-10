import type { DatabaseSync } from 'node:sqlite';

/** Generic KV read: the stored string for `key`, or undefined when absent. Takes
 *  `db` as the first arg, mirroring the opensprinkler DAOs (schedules.ts, zones.ts)
 *  so the caller controls which DB instance is used (real singleton vs. `:memory:`). */
export function getSetting(db: DatabaseSync, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

/** Generic KV upsert: write `value` for `key`, stamping `updated_at`. The
 *  ON CONFLICT clause overwrites an existing row (and bumps its timestamp) rather
 *  than erroring on the PRIMARY KEY, so repeat writes of a setting are idempotent. */
export function setSetting(db: DatabaseSync, key: string, value: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, value, now);
}
