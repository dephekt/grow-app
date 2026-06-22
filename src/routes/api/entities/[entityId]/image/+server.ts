import { json, type RequestHandler } from '@sveltejs/kit';
import { getSiteMqttService } from '$lib/server/mqtt/service';

export const GET: RequestHandler = async ({ params }) => {
  const entityId = params.entityId;
  if (!entityId) return json({ error: 'Missing entity id' }, { status: 400 });
  try {
    const frame = await getSiteMqttService().getCameraFrame(entityId);
    if (!frame) return json({ error: 'No camera frame available' }, { status: 404 });
    const body = new ArrayBuffer(frame.bytes.byteLength);
    new Uint8Array(body).set(frame.bytes);
    return new Response(body, {
      headers: {
        'content-type': frame.contentType,
        'cache-control': 'no-store',
        'content-length': String(frame.bytes.byteLength)
      }
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Camera fetch failed' }, { status: 502 });
  }
};
