import type { DatabaseSync } from 'node:sqlite';

export type AuthEvent =
  | 'login.local'
  | 'login.oidc'
  | 'login.denied'
  | 'login.failed'
  | 'logout'
  | 'password.set'
  | 'password.cleared'
  | 'user.provisioned'
  | 'user.created'
  | 'user.disabled'
  | 'user.enabled'
  | 'sessions.revoked'
  | 'admin.bootstrapped';

export interface AuditEntry {
  event: AuthEvent;
  username?: string | null;
  userId?: number | null;
  ip?: string | null;
  detail?: string | null;
}

/** Append-only auth event log. Best-effort: a logging failure must never block a
 *  login or an admin action, so callers may wrap this but it also swallows here. */
export function recordAudit(db: DatabaseSync, entry: AuditEntry): void {
  try {
    db.prepare(
      `INSERT INTO auth_audit (at, event, username, user_id, ip, detail)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      new Date().toISOString(),
      entry.event,
      entry.username ?? null,
      entry.userId ?? null,
      entry.ip ?? null,
      entry.detail ?? null
    );
  } catch (error) {
    console.error('[auth] failed to write audit entry', entry.event, error);
  }
}
