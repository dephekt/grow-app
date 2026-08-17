// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { beforeAll, describe, expect, it, vi } from 'vitest';

// Every 404 below is driven by there being no live frame, and the routes read the broker
// singleton to find that out — stub it so they run without a connection.
vi.mock('$lib/server/mqtt/service', () => ({
  getSiteMqttService: () => ({ latestSpectrum: () => null })
}));

beforeAll(() => {
  process.env.GROW_SPECTRUM_DB = ':memory:';
});

const { POST: CAPTURE_POST } = await import('../../src/routes/api/spectrum/+server');
const { GET: CAPTURE_GET } = await import('../../src/routes/api/spectrum/[id]/+server');
const { POST: ANCHOR_POST, DELETE: ANCHOR_DELETE } =
  await import('../../src/routes/api/spectrum/anchor/+server');

function event(opts: { body?: unknown; id?: string; url?: string }) {
  const url = opts.url ?? 'http://localhost/api/spectrum';
  return {
    request: new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
    }),
    url: new URL(url),
    params: { id: opts.id ?? '' }
  };
}

/**
 * The status of the HttpError a handler raises. Deliberately tolerant of both shapes: a handler
 * that has no reason to be async raises synchronously, an async one rejects, and SvelteKit awaits
 * inside a try/catch either way — so the route's contract is the status, not which of the two it is.
 */
async function raisedStatus(run: () => unknown): Promise<number | 'did not throw'> {
  try {
    await run();
  } catch (raised) {
    return (raised as { status?: number }).status ?? -1;
  }
  return 'did not throw';
}

describe('spectrum routes signal failure through SvelteKit error()', () => {
  it('404s a capture request when no live frame has arrived', async () => {
    const status = await raisedStatus(() =>
      CAPTURE_POST(event({ body: {} }) as unknown as Parameters<typeof CAPTURE_POST>[0])
    );
    expect(status).toBe(404);
  });

  it('404s an unknown capture id', async () => {
    const status = await raisedStatus(() =>
      CAPTURE_GET(event({ id: 'nope' }) as unknown as Parameters<typeof CAPTURE_GET>[0])
    );
    expect(status).toBe(404);
  });

  it('404s an anchor request when there is nothing to anchor against', async () => {
    const status = await raisedStatus(() =>
      ANCHOR_POST(
        event({ body: { source: 'lux' } }) as unknown as Parameters<typeof ANCHOR_POST>[0]
      )
    );
    expect(status).toBe(404);
  });

  it('400s an anchor clear naming a source that does not exist', async () => {
    const status = await raisedStatus(() =>
      ANCHOR_DELETE(
        event({
          url: 'http://localhost/api/spectrum/anchor?source=bogus'
        }) as unknown as Parameters<typeof ANCHOR_DELETE>[0]
      )
    );
    expect(status).toBe(400);
  });
});
