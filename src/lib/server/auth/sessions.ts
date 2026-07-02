import type { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import { SESSION_MAX_AGE_SECONDS } from '$lib/server/auth/config';
import type { UserRow } from '$lib/server/auth/users';

const SESSION_TTL_MS = SESSION_MAX_AGE_SECONDS * 1000;
// Renew only when less than a day of the 30-day window remains, so an active
// session writes to the DB at most once per day.
const RENEW_WHEN_REMAINING_MS = SESSION_TTL_MS - 24 * 60 * 60 * 1000;

export type LoginMethod = 'local' | 'oidc';

/** sha256 of the opaque cookie token. Only the hash is stored, so a DB/backup
 *  leak cannot be replayed as a session. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface NewSession {
  token: string;
  expiresAt: string;
}

export interface CreateSessionInput {
  userId: number;
  loginMethod: LoginMethod;
  userAgent?: string | null;
  ip?: string | null;
}

export function createSession(db: DatabaseSync, input: CreateSessionInput): NewSession {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const expiresAt = new Date(now + SESSION_TTL_MS).toISOString();

  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, login_method, created_at, last_seen_at, expires_at, user_agent, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(hashToken(token), input.userId, input.loginMethod, nowIso, nowIso, expiresAt, input.userAgent ?? null, input.ip ?? null);

  return { token, expiresAt };
}

export interface SessionLookup {
  sessionId: number;
  expiresAt: string;
  loginMethod: LoginMethod;
  user: UserRow;
}

/**
 * Resolve a cookie token to its session + user, or null when the token is
 * unknown, the session has expired, or the user is disabled. The `disabled`
 * check here is the live authz lever — a disabled user's existing sessions stop
 * working on their next request.
 */
export function lookupSession(db: DatabaseSync, token: string): SessionLookup | null {
  const row = db
    .prepare(
      `SELECT s.id AS session_id, s.login_method AS session_login_method, s.expires_at AS session_expires_at, u.*
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(hashToken(token)) as (UserRow & { session_id: number; session_login_method: LoginMethod; session_expires_at: string }) | undefined;

  if (!row) return null;
  if (new Date(row.session_expires_at).getTime() <= Date.now()) return null;
  if (row.disabled === 1) return null;

  const { session_id, session_login_method, session_expires_at, ...user } = row;
  return {
    sessionId: session_id,
    expiresAt: session_expires_at,
    loginMethod: session_login_method,
    user: user as UserRow
  };
}

/**
 * Extend a session's expiry to a fresh 30 days when it's within the last day of
 * its window. Returns the new expiry ISO string when a renewal happened (so the
 * caller re-issues the cookie), or null when the session was still fresh.
 */
export function renewIfNeeded(db: DatabaseSync, sessionId: number, expiresAt: string): string | null {
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining >= RENEW_WHEN_REMAINING_MS) return null;

  const now = Date.now();
  const newExpiry = new Date(now + SESSION_TTL_MS).toISOString();
  db.prepare('UPDATE sessions SET expires_at = ?, last_seen_at = ? WHERE id = ?').run(newExpiry, new Date(now).toISOString(), sessionId);
  return newExpiry;
}

export function deleteSession(db: DatabaseSync, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

/** Revoke every session for a user (admin action, or after disabling). Returns
 *  the number of sessions removed. */
export function deleteSessionsForUser(db: DatabaseSync, userId: number): number {
  const result = db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  return Number(result.changes);
}
