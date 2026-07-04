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

  // `/api/events` is a protected path, so the guard has already rejected any
  // anonymous request — locals.user is set here. We still keep the token around
  // to re-validate the session over the life of the stream: a single long-lived
  // GET never re-enters the hooks guard, so without this a stream would outlive
  // its user being disabled, having sessions revoked, or the session expiring.
  const token = cookies.get(SESSION_COOKIE);
  const userId = locals.user?.id ?? null;

  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let unregister = () => {};
  let controllerRef: ReadableStreamDefaultController | null = null;
  let closed = false;

  // Single teardown path shared by client disconnect (cancel), server-initiated
  // close (revocation / expiry), and admin revoke via the registry. Idempotent.
  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    unsubscribe();
    unregister();
  };

  // Server-initiated close: tear down, then close the controller. cancel() must
  // NOT call this — the reader is already gone and closing it would throw.
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
          controller.enqueue(encode(event.type, event));
        } catch {
          // Reader vanished between disconnect and cancel(); stop feeding it.
          closeStream();
        }
      });

      heartbeat = setInterval(() => {
        try {
          // Backstop for the registry: if the session is gone (disabled, revoked,
          // or expired) close the stream instead of sending another heartbeat.
          if (token && !lookupSession(getAuthDb(), token)) {
            closeStream();
            return;
          }
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch (error) {
          // A throw here runs in a bare timer callback: unhandled, it takes the
          // whole process (every stream) down. Swallow a transient DB/enqueue
          // error and re-check next tick — the registry still covers immediate
          // revocation, so we'd rather keep the stream than drop it on a hiccup.
          console.error('[events] heartbeat revalidation failed', error);
        }
      }, HEARTBEAT_INTERVAL_MS);

      // Immediate lever: let an admin disabling/revoking this user cut the stream
      // now, rather than on the next heartbeat tick.
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
        controller.enqueue(encoder.encode(': heartbeat\n\n'));
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
