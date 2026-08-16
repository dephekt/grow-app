// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import type { RequestHandler } from '@sveltejs/kit';
import { loadDevSnapshot } from '$lib/server/dev-snapshot';
import { getSiteMqttService } from '$lib/server/mqtt/service';
import { getAuthDb } from '$lib/server/auth/db';
import { lookupSession } from '$lib/server/auth/sessions';
import { SESSION_COOKIE } from '$lib/server/auth/config';
import { registerEventStream } from '$lib/server/events/streams';

const encoder = new TextEncoder();
const HEARTBEAT_INTERVAL_MS = 25000;

function encode(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export const GET: RequestHandler = async ({ fetch, cookies, locals }) => {
  const devSnapshot = await loadDevSnapshot(undefined, fetch);
  if (devSnapshot) return snapshotOnlyStream(devSnapshot);

  const service = getSiteMqttService();

  // Keep the token to re-validate the session over the life of the stream — a single
  // long-lived GET never re-enters the hooks guard.
  const token = cookies.get(SESSION_COOKIE);
  const userId = locals.user?.id ?? null;

  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let unregister = () => {};
  let controllerRef: ReadableStreamDefaultController | null = null;
  let closed = false;

  // Idempotent teardown path shared by client disconnect, server-initiated close, and admin revoke.
  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    unsubscribe();
    unregister();
  };

  // cancel() must NOT call this — the reader is already gone and closing it would throw.
  const closeStream = () => {
    if (closed) return;
    cleanup();
    try {
      controllerRef?.close();
    } catch {
      // Controller already closed/errored — nothing to do.
    }
  };

  const stream = new ReadableStream({
    start(controller) {
      controllerRef = controller;
      controller.enqueue(encode('snapshot', service.snapshot()));

      unsubscribe = service.subscribe((event) => {
        try {
          // A live `snapshot` event must carry the raw snapshot, not the envelope
          // that incremental events travel in.
          controller.enqueue(
            encode(event.type, event.type === 'snapshot' ? event.snapshot : event)
          );
        } catch {
          // Reader vanished between disconnect and cancel(); stop feeding it.
          closeStream();
        }
      });

      heartbeat = setInterval(() => {
        // Backstop for the registry: close the stream if the session is gone
        // (disabled, revoked, or expired).
        let sessionGone: boolean;
        try {
          sessionGone = token ? !lookupSession(getAuthDb(), token) : false;
        } catch (error) {
          // A DB hiccup is transient, and a throw escaping this bare timer callback
          // would take the whole process down.
          console.error('[events] heartbeat revalidation failed', error);
          return;
        }
        if (sessionGone) {
          closeStream();
          return;
        }
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          // enqueue throws only when the controller is already closed/errored — terminal, not transient.
          closeStream();
        }
      }, HEARTBEAT_INTERVAL_MS);

      // Immediate lever so an admin disabling/revoking this user cuts the stream
      // before the next heartbeat tick.
      if (userId !== null) {
        unregister = registerEventStream({ userId, close: closeStream });
      }
    },
    cancel() {
      cleanup();
    }
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive'
    }
  });
};

function snapshotOnlyStream(snapshot: unknown): Response {
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encode('snapshot', snapshot));
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          // Clear the timer here — an unhandled throw from a bare timer callback
          // would take the whole process down.
          if (heartbeat) clearInterval(heartbeat);
        }
      }, HEARTBEAT_INTERVAL_MS);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
    }
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive'
    }
  });
}
