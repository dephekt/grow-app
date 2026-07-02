import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openAuthDb } from '$lib/server/auth/db';
import { createLocalUser, ensureBootstrapAdmin, getUserByUsername } from '$lib/server/auth/users';
import { verifyPassword } from '$lib/server/auth/passwords';

const tempDirs: string[] = [];

function tempDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'grow-auth-'));
  tempDirs.push(dir);
  return join(dir, 'auth.db');
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('migrations', () => {
  it('applies to user_version 1 on a fresh db', () => {
    const db = openAuthDb(':memory:');
    expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 1 });
  });

  it('is idempotent across reopen (no double-apply)', () => {
    const path = tempDbPath();
    const first = openAuthDb(path);
    createLocalUser(first, { username: 'greg', password: 'password123' });
    first.close();

    const second = openAuthDb(path);
    expect(second.prepare('PRAGMA user_version').get()).toEqual({ user_version: 1 });
    expect(getUserByUsername(second, 'greg')?.username).toBe('greg');
    second.close();
  });
});

describe('ensureBootstrapAdmin', () => {
  it('creates an admin with a usable password on first boot', () => {
    const db = openAuthDb(':memory:');
    ensureBootstrapAdmin(db, { username: 'admin', password: 'bootstrap-secret' });

    const admin = getUserByUsername(db, 'admin');
    expect(admin?.is_admin).toBe(1);
    expect(verifyPassword('bootstrap-secret', admin!.password_hash)).toBe(true);
  });

  it('accepts a pre-computed password hash', () => {
    const db = openAuthDb(':memory:');
    // hash of "hash-secret" produced by hashPassword — inline to avoid coupling.
    ensureBootstrapAdmin(db, { username: 'admin', password: 'first-secret' });
    const stored = getUserByUsername(db, 'admin')!.password_hash!;

    const db2 = openAuthDb(':memory:');
    ensureBootstrapAdmin(db2, { username: 'admin', passwordHash: stored });
    expect(verifyPassword('first-secret', getUserByUsername(db2, 'admin')!.password_hash)).toBe(true);
  });

  it('never resets the password on later boots (inert secret)', () => {
    const db = openAuthDb(':memory:');
    ensureBootstrapAdmin(db, { username: 'admin', password: 'original-pass' });
    ensureBootstrapAdmin(db, { username: 'admin', password: 'changed-pass' });

    const admin = getUserByUsername(db, 'admin')!;
    expect(verifyPassword('original-pass', admin.password_hash)).toBe(true);
    expect(verifyPassword('changed-pass', admin.password_hash)).toBe(false);
  });

  it('creates no admin when no bootstrap secret is provided', () => {
    const db = openAuthDb(':memory:');
    ensureBootstrapAdmin(db, { username: 'admin' });
    expect(getUserByUsername(db, 'admin')).toBeUndefined();
  });
});

describe('createLocalUser', () => {
  it('rejects a duplicate username', () => {
    const db = openAuthDb(':memory:');
    createLocalUser(db, { username: 'greg', password: 'password123' });
    expect(() => createLocalUser(db, { username: 'greg', password: 'password456' })).toThrow();
  });

  it('is case-insensitive on username uniqueness', () => {
    const db = openAuthDb(':memory:');
    createLocalUser(db, { username: 'Greg', password: 'password123' });
    expect(getUserByUsername(db, 'greg')?.username).toBe('Greg');
  });
});
