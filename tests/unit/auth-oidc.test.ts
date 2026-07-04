import { afterEach, describe, expect, it } from 'vitest';
import { openAuthDb } from '$lib/server/auth/db';
import { createLocalUser, getUserByOidc, getUserByUsername, upsertOidcUser } from '$lib/server/auth/users';
import { authorizeFromGroups, resolveRequestOrigin } from '$lib/server/auth/oidc';
import { getAllowedOrigins, isSsoEnabled } from '$lib/server/auth/config';

describe('authorizeFromGroups', () => {
  const SLUG = 'daniel-home';

  it('grants access from the site group without admin', () => {
    expect(authorizeFromGroups(['/grow/sites/daniel-home'], SLUG)).toEqual({ authorized: true, isAdmin: false });
  });

  it('grants access and admin from the global admin group alone', () => {
    expect(authorizeFromGroups(['/grow/admin'], SLUG)).toEqual({ authorized: true, isAdmin: true });
  });

  it('denies when no relevant group is present', () => {
    expect(authorizeFromGroups(['/grow/sites/other-site', '/unrelated'], SLUG)).toEqual({
      authorized: false,
      isAdmin: false
    });
  });

  it('denies on an empty group set', () => {
    expect(authorizeFromGroups([], SLUG)).toEqual({ authorized: false, isAdmin: false });
  });

  it('requires the full group path (leaf name alone does not match)', () => {
    expect(authorizeFromGroups(['daniel-home', 'admin'], SLUG).authorized).toBe(false);
  });

  it('ignores unrelated groups while honouring the matching one', () => {
    expect(authorizeFromGroups(['/a', '/grow/sites/daniel-home', '/b'], SLUG)).toEqual({
      authorized: true,
      isAdmin: false
    });
  });
});

describe('resolveRequestOrigin', () => {
  it('uses x-forwarded-host + forwarded https', () => {
    const h = new Headers({ 'x-forwarded-host': 'grow.example.com', 'x-forwarded-proto': 'https' });
    expect(resolveRequestOrigin(h)).toBe('https://grow.example.com');
  });

  it('falls back to Host and http for a direct LAN request', () => {
    const h = new Headers({ host: '192.168.8.3:3080' });
    expect(resolveRequestOrigin(h)).toBe('http://192.168.8.3:3080');
  });

  it('takes the first entry of a comma-listed forwarded host/proto', () => {
    const h = new Headers({ 'x-forwarded-host': 'a.example.com, b.example.com', 'x-forwarded-proto': 'https, http' });
    expect(resolveRequestOrigin(h)).toBe('https://a.example.com');
  });

  it('returns null when no host is present', () => {
    expect(resolveRequestOrigin(new Headers())).toBeNull();
  });
});

describe('upsertOidcUser', () => {
  const ISS = 'https://idp.example.com/realms/home';

  it('provisions a new OIDC-only user on first login', async () => {
    const db = openAuthDb(':memory:');
    const user = await upsertOidcUser(db, {
      issuer: ISS,
      sub: 'sub-1',
      username: 'greg',
      displayName: 'Greg',
      isAdmin: false
    });

    expect(user.username).toBe('greg');
    expect(user.display_name).toBe('Greg');
    expect(user.is_admin).toBe(0);
    expect(user.password_hash).toBeNull();
    expect(user.oidc_issuer).toBe(ISS);
    expect(user.oidc_sub).toBe('sub-1');
    expect(getUserByOidc(db, ISS, 'sub-1')?.id).toBe(user.id);
  });

  it('re-syncs display_name + is_admin on a later login without a new row', async () => {
    const db = openAuthDb(':memory:');
    const first = await upsertOidcUser(db, { issuer: ISS, sub: 'sub-1', username: 'greg', displayName: 'Greg', isAdmin: false });
    const second = await upsertOidcUser(db, { issuer: ISS, sub: 'sub-1', username: 'ignored', displayName: 'Greg R.', isAdmin: true });

    expect(second.id).toBe(first.id);
    expect(second.display_name).toBe('Greg R.');
    expect(second.is_admin).toBe(1);
    // username is set once and never renamed on later logins.
    expect(second.username).toBe('greg');
    expect((db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n).toBe(1);
  });

  it('does not touch password_hash or disabled on re-sync (local kill-switch survives)', async () => {
    const db = openAuthDb(':memory:');
    const created = await upsertOidcUser(db, { issuer: ISS, sub: 'sub-1', username: 'greg', displayName: null, isAdmin: true });
    // Simulate a local admin disabling the account + it having a fallback password.
    db.prepare("UPDATE users SET disabled = 1, password_hash = 'scrypt$fake' WHERE id = ?").run(created.id);

    const after = await upsertOidcUser(db, { issuer: ISS, sub: 'sub-1', username: 'greg', displayName: null, isAdmin: false });
    expect(after.disabled).toBe(1);
    expect(after.password_hash).toBe('scrypt$fake');
    expect(after.is_admin).toBe(0); // admin still re-synced from the claim
  });

  it('uniquifies a username that collides with a different account (never links)', async () => {
    const db = openAuthDb(':memory:');
    const local = await createLocalUser(db, { username: 'greg', password: 'password123' });

    const oidc = await upsertOidcUser(db, { issuer: ISS, sub: 'sub-99', username: 'greg', displayName: null, isAdmin: false });
    expect(oidc.id).not.toBe(local.id);
    expect(oidc.username).toBe('greg-2');
    // The pre-existing local account is untouched (no takeover by claim).
    expect(getUserByUsername(db, 'greg')?.id).toBe(local.id);
    expect(getUserByUsername(db, 'greg')?.oidc_sub).toBeNull();
  });
});

describe('config: SSO enablement', () => {
  const KEYS = [
    'GROW_OIDC_ISSUER',
    'GROW_OIDC_CLIENT_ID',
    'GROW_OIDC_CLIENT_SECRET',
    'GROW_AUTH_ORIGINS'
  ];
  const saved = new Map<string, string | undefined>();

  function setEnv(values: Record<string, string | undefined>): void {
    for (const key of KEYS) {
      if (!saved.has(key)) saved.set(key, process.env[key]);
      if (values[key] === undefined) delete process.env[key];
      else process.env[key] = values[key];
    }
  }

  afterEach(() => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    saved.clear();
  });

  it('is enabled when issuer, client id/secret, and an origin are all set', () => {
    setEnv({
      GROW_OIDC_ISSUER: 'https://idp.example.com',
      GROW_OIDC_CLIENT_ID: 'grow',
      GROW_OIDC_CLIENT_SECRET: 'secret',
      GROW_AUTH_ORIGINS: 'https://grow.example.com'
    });
    expect(isSsoEnabled()).toBe(true);
  });

  it('is disabled (fail-closed) when the origin allowlist is empty', () => {
    setEnv({
      GROW_OIDC_ISSUER: 'https://idp.example.com',
      GROW_OIDC_CLIENT_ID: 'grow',
      GROW_OIDC_CLIENT_SECRET: 'secret',
      GROW_AUTH_ORIGINS: undefined
    });
    expect(isSsoEnabled()).toBe(false);
  });

  it('is disabled when the client secret is missing', () => {
    setEnv({
      GROW_OIDC_ISSUER: 'https://idp.example.com',
      GROW_OIDC_CLIENT_ID: 'grow',
      GROW_OIDC_CLIENT_SECRET: undefined,
      GROW_AUTH_ORIGINS: 'https://grow.example.com'
    });
    expect(isSsoEnabled()).toBe(false);
  });

  it('parses, trims, and strips trailing slashes from the origin allowlist', () => {
    setEnv({ GROW_AUTH_ORIGINS: 'https://grow.example.com/ , http://192.168.8.3:3080 ,,' });
    expect(getAllowedOrigins()).toEqual(['https://grow.example.com', 'http://192.168.8.3:3080']);
  });
});
