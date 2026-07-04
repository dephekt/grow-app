import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Stub only the network-touching completeLogin so the callback handler runs
// without a live IdP; authorizeFromGroups + provisioning stay real. Mirrors the
// intent of auth-login-route.test.ts: exercise the HTTP-level contract (throttle
// shed, redirect targets, session-cookie mint) that the pure-logic unit tests
// structurally can't see because they never call the handler.
vi.mock('$lib/server/auth/oidc', async (importOriginal) => {
  const actual = await importOriginal<typeof import('$lib/server/auth/oidc')>();
  return { ...actual, completeLogin: vi.fn() };
});

import { GET } from '../../src/routes/auth/oidc/callback/+server';
import { completeLogin, type OidcClaims } from '$lib/server/auth/oidc';
import { getAuthDb } from '$lib/server/auth/db';
import { upsertOidcUser, getUserByOidc, setDisabled } from '$lib/server/auth/users';

const ISS = 'https://idp.example.com';
const REDIRECT_URI = 'https://grow.example.com/auth/oidc/callback';

beforeAll(() => {
  process.env.GROW_AUTH_DB = ':memory:';
  process.env.GROW_SITE = 'daniel-home';
  process.env.GROW_OIDC_ISSUER = ISS;
  process.env.GROW_OIDC_CLIENT_ID = 'grow';
  process.env.GROW_OIDC_CLIENT_SECRET = 'secret';
  process.env.GROW_AUTH_ORIGINS = 'https://grow.example.com';
  // Small deterministic per-IP window; the callback shares POST /auth/login's.
  process.env.GROW_AUTH_LOGIN_RATE_MAX = '3';
  process.env.GROW_AUTH_LOGIN_RATE_WINDOW_SECONDS = '60';
});

beforeEach(() => {
  vi.mocked(completeLogin).mockReset();
});

function claims(overrides: Partial<OidcClaims> = {}): OidcClaims {
  return { iss: ISS, sub: 'sub', groups: [], preferredUsername: 'user', name: null, email: null, ...overrides };
}

function txCookie(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ verifier: 'v', state: 'st', nonce: 'n', redirectUri: REDIRECT_URI, next: '/', ...overrides });
}

interface SetCookie {
  name: string;
  value: string;
}

function makeEvent({ tx, ip, search = '?code=abc&state=st' }: { tx?: string; ip: string; search?: string }) {
  const url = new URL(`http://localhost/auth/oidc/callback${search}`);
  const request = new Request(url, { method: 'GET', headers: { 'user-agent': 'vitest' } });
  const setCookies: SetCookie[] = [];
  const cookies = {
    get: (name: string) => (name === 'grow_oidc_tx' ? tx : undefined),
    set: (name: string, value: string) => setCookies.push({ name, value }),
    delete: () => {}
  };
  const event = { request, url, cookies, getClientAddress: () => ip } as unknown as Parameters<typeof GET>[0];
  return { event, setCookies };
}

/** Invoke the handler and capture the thrown SvelteKit redirect. */
async function invoke(event: Parameters<typeof GET>[0]): Promise<{ status: number; location: string }> {
  try {
    await GET(event);
  } catch (e) {
    const redirectLike = e as { status?: number; location?: string };
    if (typeof redirectLike.location === 'string') {
      return { status: redirectLike.status ?? 0, location: redirectLike.location };
    }
    throw e;
  }
  throw new Error('callback handler did not redirect');
}

describe('GET /auth/oidc/callback', () => {
  it('redirects to error=sso when the tx cookie is missing, without calling the IdP', async () => {
    const { event } = makeEvent({ ip: '203.0.113.20' });
    expect((await invoke(event)).location).toBe('/login?error=sso');
    expect(vi.mocked(completeLogin)).not.toHaveBeenCalled();
  });

  it('redirects to error=sso on a garbled tx cookie', async () => {
    const { event } = makeEvent({ tx: 'not-json', ip: '203.0.113.21' });
    expect((await invoke(event)).location).toBe('/login?error=sso');
    expect(vi.mocked(completeLogin)).not.toHaveBeenCalled();
  });

  it('redirects to error=sso when tx.redirectUri is not a valid URL (no uncaught 500)', async () => {
    const { event } = makeEvent({ tx: txCookie({ redirectUri: 'not-a-valid-url' }), ip: '203.0.113.26' });
    expect((await invoke(event)).location).toBe('/login?error=sso');
    expect(vi.mocked(completeLogin)).not.toHaveBeenCalled();
  });

  it('rate-limits per IP before the token exchange', async () => {
    vi.mocked(completeLogin).mockRejectedValue(new Error('exchange failed'));
    const ip = '203.0.113.22';
    // max=3: the first three reach completeLogin (which fails -> error=sso); the
    // fourth is shed by the throttle before completeLogin runs.
    for (let i = 0; i < 3; i++) {
      const { event } = makeEvent({ tx: txCookie(), ip });
      expect((await invoke(event)).location).toBe('/login?error=sso');
    }
    const { event } = makeEvent({ tx: txCookie(), ip });
    expect((await invoke(event)).location).toBe('/login?error=sso');
    expect(vi.mocked(completeLogin)).toHaveBeenCalledTimes(3);
  });

  it('denies an authenticated identity that lacks an authorized group', async () => {
    vi.mocked(completeLogin).mockResolvedValue(claims({ sub: 'nogroup', groups: [] }));
    const { event } = makeEvent({ tx: txCookie(), ip: '203.0.113.23' });
    expect((await invoke(event)).location).toBe('/login?error=forbidden');
  });

  it('denies a locally-disabled OIDC user even with a valid group', async () => {
    const db = getAuthDb();
    const user = await upsertOidcUser(db, { issuer: ISS, sub: 'dis', username: 'dis', displayName: null, isAdmin: false });
    setDisabled(db, user.id, true);
    vi.mocked(completeLogin).mockResolvedValue(claims({ sub: 'dis', groups: ['/grow-site-daniel-home'] }));
    const { event } = makeEvent({ tx: txCookie(), ip: '203.0.113.24' });
    expect((await invoke(event)).location).toBe('/login?error=forbidden');
  });

  it('mints a session and redirects to the sanitized next on an authorized login', async () => {
    vi.mocked(completeLogin).mockResolvedValue(
      claims({ sub: 'ok', groups: ['/grow-admin'], preferredUsername: 'ok', name: 'OK', email: 'ok@example.com' })
    );
    const { event, setCookies } = makeEvent({ tx: txCookie({ next: '/device-settings' }), ip: '203.0.113.25' });
    expect((await invoke(event)).location).toBe('/device-settings');
    expect(setCookies.some((c) => c.name === 'grow_session')).toBe(true);
    expect(getUserByOidc(getAuthDb(), ISS, 'ok')?.is_admin).toBe(1);
  });
});
