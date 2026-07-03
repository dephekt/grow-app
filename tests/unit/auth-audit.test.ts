import { afterEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { capAuditRows, openAuthDb, purgeOldAuditEntries } from '$lib/server/auth/db';
import { recordAudit } from '$lib/server/auth/audit';
import { intEnv } from '$lib/server/env';

function freshDb(): DatabaseSync {
  return openAuthDb(':memory:');
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Insert an audit row with an explicit `at`, to seed backdated history that
 *  `recordAudit` (which always stamps "now") can't produce. */
function insertAudit(db: DatabaseSync, at: string, event = 'login.failed'): void {
  db.prepare('INSERT INTO auth_audit (at, event) VALUES (?, ?)').run(at, event);
}

function auditCount(db: DatabaseSync): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM auth_audit').get() as { n: number }).n;
}

describe('recordAudit', () => {
  it('writes a row for a login.failed event', () => {
    const db = freshDb();
    recordAudit(db, { event: 'login.failed', username: 'greg', ip: '10.0.0.1' });

    const row = db.prepare('SELECT event, username, ip FROM auth_audit').get() as {
      event: string;
      username: string;
      ip: string;
    };
    expect(row).toEqual({ event: 'login.failed', username: 'greg', ip: '10.0.0.1' });
  });
});

describe('purgeOldAuditEntries', () => {
  it('deletes rows older than the retention window and keeps recent ones', () => {
    const db = freshDb();
    insertAudit(db, new Date(Date.now() - 40 * DAY_MS).toISOString()); // aged out
    insertAudit(db, new Date(Date.now() - 10 * DAY_MS).toISOString()); // inside window
    insertAudit(db, new Date().toISOString()); // now

    expect(purgeOldAuditEntries(db, 30)).toBe(1);
    expect(auditCount(db)).toBe(2);
  });

  it('is a no-op when retention is 0 (retain indefinitely)', () => {
    const db = freshDb();
    insertAudit(db, new Date(Date.now() - 3650 * DAY_MS).toISOString());

    expect(purgeOldAuditEntries(db, 0)).toBe(0);
    expect(auditCount(db)).toBe(1);
  });

  it('removes nothing when every row is inside the window', () => {
    const db = freshDb();
    insertAudit(db, new Date(Date.now() - 1 * DAY_MS).toISOString());
    insertAudit(db, new Date().toISOString());

    expect(purgeOldAuditEntries(db, 90)).toBe(0);
    expect(auditCount(db)).toBe(2);
  });
});

describe('capAuditRows', () => {
  it('keeps only the newest maxRows by id', () => {
    const db = freshDb();
    for (let i = 0; i < 5; i++) recordAudit(db, { event: 'login.failed' });

    expect(capAuditRows(db, 3)).toBe(2);

    const ids = (db.prepare('SELECT id FROM auth_audit ORDER BY id').all() as { id: number }[]).map(
      (r) => r.id
    );
    expect(ids).toEqual([3, 4, 5]); // the two lowest ids dropped
  });

  it('is gap-safe: cap counts surviving rows, not the max id', () => {
    const db = freshDb();
    for (let i = 0; i < 5; i++) recordAudit(db, { event: 'login.failed' });
    db.prepare('DELETE FROM auth_audit WHERE id IN (2, 4)').run(); // punch holes: ids 1,3,5 left

    expect(capAuditRows(db, 2)).toBe(1); // drop id 1, keep 3 and 5
    const ids = (db.prepare('SELECT id FROM auth_audit ORDER BY id').all() as { id: number }[]).map(
      (r) => r.id
    );
    expect(ids).toEqual([3, 5]);
  });

  it('removes nothing when the table is at or below the cap', () => {
    const db = freshDb();
    for (let i = 0; i < 3; i++) recordAudit(db, { event: 'login.failed' });

    expect(capAuditRows(db, 3)).toBe(0);
    expect(capAuditRows(db, 10)).toBe(0);
    expect(auditCount(db)).toBe(3);
  });

  it('is a no-op when the cap is 0 (uncapped)', () => {
    const db = freshDb();
    for (let i = 0; i < 5; i++) recordAudit(db, { event: 'login.failed' });

    expect(capAuditRows(db, 0)).toBe(0);
    expect(auditCount(db)).toBe(5);
  });
});

describe('intEnv', () => {
  const KEY = 'GROW_TEST_INT_ENV';

  afterEach(() => {
    delete process.env[KEY];
  });

  it('returns the fallback when unset', () => {
    expect(intEnv(KEY, 90)).toBe(90);
  });

  it('parses a valid non-negative integer', () => {
    process.env[KEY] = '30';
    expect(intEnv(KEY, 90)).toBe(30);
  });

  it('accepts 0 (the disable sentinel)', () => {
    process.env[KEY] = '0';
    expect(intEnv(KEY, 90)).toBe(0);
  });

  it('falls back on negative, non-integer, and garbage values', () => {
    for (const bad of ['-5', '1.5', 'abc', '']) {
      process.env[KEY] = bad;
      expect(intEnv(KEY, 90)).toBe(90);
    }
  });
});
