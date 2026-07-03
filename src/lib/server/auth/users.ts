import type { DatabaseSync } from 'node:sqlite';
import type { BootstrapAdmin } from '$lib/server/auth/config';
import { hashPassword } from '$lib/server/auth/passwords';
import { recordAudit } from '$lib/server/auth/audit';

/** Raw `users` row as stored (SQLite booleans are 0/1 integers). */
export interface UserRow {
  id: number;
  username: string;
  display_name: string | null;
  is_admin: number;
  disabled: number;
  password_hash: string | null;
  password_updated_at: string | null;
  oidc_issuer: string | null;
  oidc_sub: string | null;
  created_at: string;
  last_login_at: string | null;
}

/** The user shape attached to `event.locals` and returned by /api/me. No secrets. */
export interface AuthenticatedUser {
  id: number;
  username: string;
  displayName: string | null;
  isAdmin: boolean;
  hasLocalPassword: boolean;
  oidcLinked: boolean;
}

/** Admin-facing user view. Like AuthenticatedUser plus management fields; still
 *  omits the password hash. */
export interface UserSummary {
  id: number;
  username: string;
  displayName: string | null;
  isAdmin: boolean;
  disabled: boolean;
  hasLocalPassword: boolean;
  oidcLinked: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export function toUserSummary(row: UserRow): UserSummary {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    isAdmin: row.is_admin === 1,
    disabled: row.disabled === 1,
    hasLocalPassword: row.password_hash !== null,
    oidcLinked: row.oidc_issuer !== null,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at
  };
}

export function toAuthenticatedUser(row: UserRow): AuthenticatedUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    isAdmin: row.is_admin === 1,
    hasLocalPassword: row.password_hash !== null,
    oidcLinked: row.oidc_issuer !== null
  };
}

export function getUserByUsername(db: DatabaseSync, username: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username) as UserRow | undefined;
}

export function getUserById(db: DatabaseSync, id: number): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export function getUserByOidc(db: DatabaseSync, issuer: string, sub: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE oidc_issuer = ? AND oidc_sub = ?').get(issuer, sub) as UserRow | undefined;
}

export function listUsers(db: DatabaseSync): UserRow[] {
  return db.prepare('SELECT * FROM users ORDER BY username COLLATE NOCASE').all() as unknown as UserRow[];
}

export interface CreateLocalUserInput {
  username: string;
  password: string;
  isAdmin?: boolean;
  displayName?: string | null;
}

/** Create a pure-local (no OIDC) user with a password. Throws if the username
 *  is taken (the UNIQUE constraint surfaces as an error). */
export async function createLocalUser(db: DatabaseSync, input: CreateLocalUserInput): Promise<UserRow> {
  // Derive the hash BEFORE opening any statement: hashPassword is async now, so
  // computing it up front keeps the INSERT a single synchronous node:sqlite call
  // — no `await` sits between statements on the shared connection.
  const passwordHash = await hashPassword(input.password);
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO users (username, display_name, is_admin, disabled, password_hash, password_updated_at, created_at)
       VALUES (?, ?, ?, 0, ?, ?, ?)`
    )
    .run(
      input.username,
      input.displayName ?? null,
      input.isAdmin ? 1 : 0,
      passwordHash,
      now,
      now
    );
  const id = Number(result.lastInsertRowid);
  recordAudit(db, { event: 'user.created', username: input.username, userId: id });
  return getUserById(db, id)!;
}

export async function setPassword(db: DatabaseSync, userId: number, password: string): Promise<void> {
  const passwordHash = await hashPassword(password);
  db.prepare('UPDATE users SET password_hash = ?, password_updated_at = ? WHERE id = ?').run(
    passwordHash,
    new Date().toISOString(),
    userId
  );
  recordAudit(db, { event: 'password.set', userId });
}

export function clearPassword(db: DatabaseSync, userId: number): void {
  db.prepare('UPDATE users SET password_hash = NULL, password_updated_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    userId
  );
  recordAudit(db, { event: 'password.cleared', userId });
}

export function setDisabled(db: DatabaseSync, userId: number, disabled: boolean): void {
  db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(disabled ? 1 : 0, userId);
  recordAudit(db, { event: disabled ? 'user.disabled' : 'user.enabled', userId });
}

export function touchLogin(db: DatabaseSync, userId: number): void {
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(new Date().toISOString(), userId);
}

/**
 * Ensure a usable local admin exists on first boot. If any enabled admin with a
 * local password already exists, this is a no-op — the bootstrap secret is inert
 * after the first successful boot and a later password change is never reset.
 *
 * When no usable admin remains (all disabled or de-admin'd), the bootstrap secret
 * doubles as a recovery path: the named user is re-enabled and re-promoted. Its
 * password hash is never overwritten, so the inert-secret guarantee still holds.
 */
export async function ensureBootstrapAdmin(db: DatabaseSync, admin: BootstrapAdmin): Promise<void> {
  const existing = db
    .prepare('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1 AND disabled = 0 AND password_hash IS NOT NULL')
    .get() as { n: number };
  if (existing.n > 0) return;

  if (!admin.password && !admin.passwordHash) {
    console.warn(
      '[auth] No enabled local admin exists and neither GROW_AUTH_ADMIN_PASSWORD nor ' +
        'GROW_AUTH_ADMIN_PASSWORD_HASH is set. Nobody can log in locally. Set the bootstrap secret and restart.'
    );
    return;
  }

  const hash = admin.passwordHash ?? (await hashPassword(admin.password!));
  const now = new Date().toISOString();
  const row = getUserByUsername(db, admin.username);

  if (row) {
    if (row.password_hash) {
      // We only reach here with existing.n === 0, so this named user — though it
      // has a password — is disabled and/or no longer an admin (otherwise it would
      // have counted as a usable admin above). Restore admin access WITHOUT touching
      // the hash: the never-overwrite-password / inert-secret guarantee holds, and
      // the bootstrap secret still gives operators a recovery path.
      db.prepare('UPDATE users SET is_admin = 1, disabled = 0 WHERE id = ?').run(row.id);
      recordAudit(db, {
        event: 'admin.bootstrapped',
        username: admin.username,
        userId: row.id,
        detail: 're-enabled existing admin'
      });
      console.warn(
        `[auth] Re-enabled bootstrap admin '${admin.username}' (existed with a password but was ` +
          "disabled/de-admin'd and no other usable admin remained). Password left unchanged."
      );
      return;
    }
    db.prepare('UPDATE users SET password_hash = ?, password_updated_at = ?, is_admin = 1, disabled = 0 WHERE id = ?').run(
      hash,
      now,
      row.id
    );
    recordAudit(db, { event: 'admin.bootstrapped', username: admin.username, userId: row.id, detail: 'upgraded existing user' });
    return;
  }

  const result = db
    .prepare('INSERT INTO users (username, is_admin, disabled, password_hash, password_updated_at, created_at) VALUES (?, 1, 0, ?, ?, ?)')
    .run(admin.username, hash, now, now);
  recordAudit(db, { event: 'admin.bootstrapped', username: admin.username, userId: Number(result.lastInsertRowid) });
}
