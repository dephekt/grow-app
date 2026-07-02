import { describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openAuthDb, purgeExpiredSessions } from '$lib/server/auth/db';
import { createLocalUser, setDisabled } from '$lib/server/auth/users';
import {
  createSession,
  deleteSession,
  deleteSessionsForUser,
  hashToken,
  lookupSession,
  renewIfNeeded
} from '$lib/server/auth/sessions';

function freshDb(): DatabaseSync {
  return openAuthDb(':memory:');
}

function setExpiry(db: DatabaseSync, sessionId: number, iso: string): void {
  db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(iso, sessionId);
}

describe('sessions', () => {
  it('stores only the token hash, never the raw token', () => {
    const db = freshDb();
    const user = createLocalUser(db, { username: 'greg', password: 'password123' });
    const { token } = createSession(db, { userId: user.id, loginMethod: 'local' });

    const row = db.prepare('SELECT token_hash FROM sessions').get() as { token_hash: string };
    expect(row.token_hash).toBe(hashToken(token));
    expect(row.token_hash).not.toBe(token);
  });

  it('resolves a valid token to its user', () => {
    const db = freshDb();
    const user = createLocalUser(db, { username: 'greg', password: 'password123' });
    const { token } = createSession(db, { userId: user.id, loginMethod: 'local' });

    const lookup = lookupSession(db, token);
    expect(lookup?.user.id).toBe(user.id);
    expect(lookup?.user.username).toBe('greg');
    expect(lookup?.loginMethod).toBe('local');
  });

  it('returns null for an unknown token', () => {
    const db = freshDb();
    expect(lookupSession(db, 'nope')).toBeNull();
  });

  it('returns null for an expired session', () => {
    const db = freshDb();
    const user = createLocalUser(db, { username: 'greg', password: 'password123' });
    const { token } = createSession(db, { userId: user.id, loginMethod: 'local' });
    const sid = lookupSession(db, token)!.sessionId;

    setExpiry(db, sid, new Date(Date.now() - 1000).toISOString());
    expect(lookupSession(db, token)).toBeNull();
  });

  it('returns null once the user is disabled (live authz lever)', () => {
    const db = freshDb();
    const user = createLocalUser(db, { username: 'greg', password: 'password123' });
    const { token } = createSession(db, { userId: user.id, loginMethod: 'local' });
    expect(lookupSession(db, token)).not.toBeNull();

    setDisabled(db, user.id, true);
    expect(lookupSession(db, token)).toBeNull();
  });

  it('does not renew a fresh session but renews one inside the last day', () => {
    const db = freshDb();
    const user = createLocalUser(db, { username: 'greg', password: 'password123' });
    const { token, expiresAt } = createSession(db, { userId: user.id, loginMethod: 'local' });
    const sid = lookupSession(db, token)!.sessionId;

    // Fresh (~30 days out) → no renewal.
    expect(renewIfNeeded(db, sid, expiresAt)).toBeNull();

    // Within the last day → renew, pushing expiry back out to ~30 days.
    const soon = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    setExpiry(db, sid, soon);
    const renewed = renewIfNeeded(db, sid, soon);
    expect(renewed).not.toBeNull();
    expect(new Date(renewed!).getTime()).toBeGreaterThan(new Date(soon).getTime());
  });

  it('deletes a single session and all sessions for a user', () => {
    const db = freshDb();
    const user = createLocalUser(db, { username: 'greg', password: 'password123' });
    const a = createSession(db, { userId: user.id, loginMethod: 'local' });
    const b = createSession(db, { userId: user.id, loginMethod: 'local' });

    deleteSession(db, a.token);
    expect(lookupSession(db, a.token)).toBeNull();
    expect(lookupSession(db, b.token)).not.toBeNull();

    const removed = deleteSessionsForUser(db, user.id);
    expect(removed).toBe(1);
    expect(lookupSession(db, b.token)).toBeNull();
  });

  it('purges expired sessions', () => {
    const db = freshDb();
    const user = createLocalUser(db, { username: 'greg', password: 'password123' });
    const { token } = createSession(db, { userId: user.id, loginMethod: 'local' });
    const sid = lookupSession(db, token)!.sessionId;
    setExpiry(db, sid, new Date(Date.now() - 1000).toISOString());

    expect(purgeExpiredSessions(db)).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 0 });
  });
});
