import type { RequestHandler } from '@sveltejs/kit';
import { loadDevSnapshot } from '$lib/server/dev-snapshot';
import { getSiteMqttService } from '$lib/server/mqtt/service';

const encoder = new TextEncoder();

function encode(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export const GET: RequestHandler = async ({ fetch }) => {
  const devSnapshot = await loadDevSnapshot(undefined, fetch);
  if (devSnapshot) return snapshotOnlyStream(devSnapshot);

  const service = getSiteMqttService();
  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encode('snapshot', service.snapshot()));

      unsubscribe = service.subscribe((event) => {
        controller.enqueue(encode(event.type, event));
      });

      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(': heartbeat\n\n'));
      }, 25000);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe();
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
      }, 25000);
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
