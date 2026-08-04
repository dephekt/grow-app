// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

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

/** Best-effort auth event log, not a compliance-grade immutable one: the public
 *  login endpoint writes attacker-controlled `login.failed` rows, and the daily
 *  purgeOldAuditEntries / capAuditRows in db.ts bound it. */
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
