import { beforeAll, describe, expect, it } from 'vitest';
import { POST } from '../../src/routes/auth/login/+server';
import { getAuthDb } from '$lib/server/auth/db';
import { createLocalUser } from '$lib/server/auth/users';
import { getLoginThrottle } from '$lib/server/auth/login-throttle';

// Exercise the login handler's HTTP-level shed-load contract — the 429 status +
// Retry-After wiring and the release-slot-on-every-exit invariant — which the
// throttle-primitive unit tests structurally cannot see (they never call the
// handler) and e2e deliberately disables. A regression that moved releaseSlot()
// out of the finally, or added an early return before it, would leak in-flight
// slots until every login 429s with restart-only recovery — and would otherwise
// ship green. See #34 review.
//
// The handler reads the config-backed getAuthDb()/getLoginThrottle() singletons,
// so pin them to an in-memory DB and small, deterministic limits via env before
// the first call (vitest isolates env per test file under the default forks pool).
beforeAll(() => {
  process.env.GROW_AUTH_DB = ':memory:';
  process.env.GROW_AUTH_LOGIN_RATE_MAX = '3';
  process.env.GROW_AUTH_LOGIN_RATE_WINDOW_SECONDS = '60';
  process.env.GROW_AUTH_LOGIN_MAX_INFLIGHT = '2';
});

interface CapturedCookie {
  name: string;
  value: string;
}

async function invokeLogin(body: unknown, ip: string): Promise<{ res: Response; setCookies: CapturedCookie[] }> {
  const request = new Request('http://localhost/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const setCookies: CapturedCookie[] = [];
  const cookies = {
    get: () => undefined,
    set: (name: string, value: string) => setCookies.push({ name, value }),
    delete: () => {}
  };
  const event = { request, cookies, getClientAddress: () => ip } as unknown as Parameters<typeof POST>[0];
  const res = (await POST(event)) as Response;
  return { res, setCookies };
}

describe('POST /auth/login shed-load contract', () => {
  it('rate-limits a per-IP flood with 429 + numeric Retry-After, before any user match', async () => {
    const ip = '203.0.113.1';
    // max=3: the first three attempts pass the gate (401 for an unknown user),
    // the fourth is rate-limited.
    for (let i = 0; i < 3; i++) {
      const { res } = await invokeLogin({ username: 'ghost', password: 'whatever' }, ip);
      expect(res.status).toBe(401);
    }
    const { res } = await invokeLogin({ username: 'ghost', password: 'whatever' }, ip);
    expect(res.status).toBe(429);
    const retryAfter = Number(res.headers.get('retry-after'));
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
  });

  it('releases the in-flight slot on the failed-login path (no leak)', async () => {
    const ip = '203.0.113.2';
    for (let i = 0; i < 3; i++) {
      await invokeLogin({ username: `nobody${i}`, password: 'nope' }, ip);
    }
    // If the finally were skipped on the failure path, each failed attempt would
    // leak a slot; after three, inFlight would be 3, not 0.
    expect(getLoginThrottle().inFlight).toBe(0);
  });

  it('authenticates a valid login, sets a session cookie, and releases the slot', async () => {
    await createLocalUser(getAuthDb(), { username: 'alice', password: 'password123' });
    const { res, setCookies } = await invokeLogin({ username: 'alice', password: 'password123' }, '203.0.113.3');

    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(setCookies.some((c) => c.name === 'grow_session')).toBe(true);
    expect(getLoginThrottle().inFlight).toBe(0);
  });

  it('sheds load with 429 + Retry-After:1 when the concurrent-derivation cap is saturated', async () => {
    const throttle = getLoginThrottle(); // GROW_AUTH_LOGIN_MAX_INFLIGHT=2
    // Occupy both derivation slots as if two logins were mid-scrypt.
    expect(throttle.tryAcquireSlot()).toBe(true);
    expect(throttle.tryAcquireSlot()).toBe(true);
    try {
      const { res } = await invokeLogin({ username: 'alice', password: 'password123' }, '203.0.113.4');
      expect(res.status).toBe(429);
      expect(res.headers.get('retry-after')).toBe('1');
    } finally {
      throttle.releaseSlot();
      throttle.releaseSlot();
    }
  });
});
