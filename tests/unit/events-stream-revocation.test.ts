import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// The events route opens a live MQTT-backed SSE stream and, in dev, may short out
// to a snapshot. Stub both so the real (non-snapshot) auth-relevant path runs
// without a broker connection: getSiteMqttService()'s start() would otherwise
// call mqtt.connect(), and loadDevSnapshot must return null to reach the stream.
vi.mock('$lib/server/mqtt/service', () => ({
  getSiteMqttService: () => ({
    snapshot: () => ({}),
    subscribe: () => () => {}
  })
}));
vi.mock('$lib/server/dev-snapshot', () => ({
  loadDevSnapshot: async () => null
}));

import { GET } from '../../src/routes/api/events/+server';
import { PATCH } from '../../src/routes/api/users/[id]/+server';
import { getAuthDb } from '$lib/server/auth/db';
import { createLocalUser } from '$lib/server/auth/users';
import { createSession, deleteSessionsForUser } from '$lib/server/auth/sessions';
import { activeEventStreamCount, closeEventStreamsForUser } from '$lib/server/events/streams';
import { SESSION_COOKIE } from '$lib/server/auth/config';

// The route singletons read env at first use; pin the auth DB in-memory and make
// sure no dev-snapshot env is set (belt-and-suspenders alongside the mock above).
beforeAll(() => {
  process.env.GROW_AUTH_DB = ':memory:';
  delete process.env.GROW_DEV_SNAPSHOT_URL;
  delete process.env.GROW_DEV_SNAPSHOT_FILE;
});

// The stream registry and getAuthDb() are process-local singletons shared across
// tests in this file. Sweep any stream a test leaves open (its heartbeat interval
// would otherwise leak) and restore real timers.
const touchedUserIds = new Set<number>();
afterEach(() => {
  for (const id of touchedUserIds) closeEventStreamsForUser(id);
  touchedUserIds.clear();
  vi.useRealTimers();
});

let userSeq = 0;
async function seedUserWithStream(): Promise<{ userId: number; token: string; response: Response }> {
  const db = getAuthDb();
  const user = await createLocalUser(db, { username: `streamer${userSeq++}`, password: 'password123' });
  touchedUserIds.add(user.id);
  const { token } = createSession(db, { userId: user.id, loginMethod: 'local' });

  // Drive the real GET handler; its ReadableStream start() runs during
  // construction, so the stream is registered by the time the handler returns.
  const event = {
    fetch: (async () => new Response()) as typeof fetch,
    cookies: { get: (name: string) => (name === SESSION_COOKIE ? token : undefined) },
    locals: { user: { id: user.id, isAdmin: false } }
  } as unknown as Parameters<typeof GET>[0];
  const response = (await GET(event)) as Response;

  return { userId: user.id, token, response };
}

async function invokePatch(targetId: number, body: unknown, adminId: number): Promise<Response> {
  const request = new Request(`http://localhost/api/users/${targetId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const event = {
    params: { id: String(targetId) },
    request,
    locals: { user: { id: adminId, isAdmin: true } }
  } as unknown as Parameters<typeof PATCH>[0];
  return (await PATCH(event)) as Response;
}

describe('SSE stream revocation (issue #35)', () => {
  it('registers an open stream when GET /api/events is authorized', async () => {
    const before = activeEventStreamCount();
    await seedUserWithStream();
    expect(activeEventStreamCount()).toBe(before + 1);
  });

  it('disabling a user closes their open stream immediately (both wiring seams)', async () => {
    const { userId } = await seedUserWithStream();
    expect(activeEventStreamCount()).toBe(1);

    const res = await invokePatch(userId, { disabled: true }, /* admin */ 999_999);
    expect(res.status).toBe(200);
    // The PATCH handler must have called closeEventStreamsForUser(userId).
    expect(activeEventStreamCount()).toBe(0);
  });

  it('revoking a user’s sessions closes their open stream immediately', async () => {
    const { userId } = await seedUserWithStream();
    expect(activeEventStreamCount()).toBe(1);

    const res = await invokePatch(userId, { revokeSessions: true }, 999_999);
    expect(res.status).toBe(200);
    expect(activeEventStreamCount()).toBe(0);
  });

  it('does not close a still-authorized user’s stream when a different user is disabled', async () => {
    const survivor = await seedUserWithStream();
    const victim = await seedUserWithStream();
    expect(activeEventStreamCount()).toBe(2);

    await invokePatch(victim.userId, { disabled: true }, 999_999);
    expect(activeEventStreamCount()).toBe(1);
    // The survivor is still registered; sweep it in afterEach.
    expect(touchedUserIds.has(survivor.userId)).toBe(true);
  });

  it('unregisters the stream when the client disconnects (cancel path)', async () => {
    const { response } = await seedUserWithStream();
    expect(activeEventStreamCount()).toBe(1);

    // A client disconnect surfaces as cancel() on the response body's stream,
    // which must run the shared cleanup (clear the heartbeat, unsubscribe,
    // unregister) — the teardown path all three close routes funnel through.
    await response.body?.cancel();
    expect(activeEventStreamCount()).toBe(0);
  });

  it('heartbeat backstop self-closes a stream once its session is gone', async () => {
    // Fake timers so the 25s heartbeat (HEARTBEAT_INTERVAL_MS in the route) can be
    // advanced deterministically. Must be enabled before GET constructs the stream.
    vi.useFakeTimers();
    const { userId } = await seedUserWithStream();
    expect(activeEventStreamCount()).toBe(1);

    // Revoke out-of-band (as a server restart or a different worker would leave it):
    // no closeEventStreamsForUser call, so only the heartbeat revalidation can close it.
    deleteSessionsForUser(getAuthDb(), userId);
    expect(activeEventStreamCount()).toBe(1);

    vi.advanceTimersByTime(25_000);
    expect(activeEventStreamCount()).toBe(0);
  });
});
