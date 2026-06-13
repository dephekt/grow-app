import { json, type RequestHandler } from '@sveltejs/kit';
import { getSiteMqttService } from '$lib/server/mqtt/service';
import type { CommandRequest } from '$lib/server/mqtt/types';

export const POST: RequestHandler = async ({ params, request }) => {
  const body = (await request.json().catch(() => ({}))) as CommandRequest;
  const entityId = params.entityId;

  if (!entityId) {
    return json({ ok: false, error: 'Missing entity id' }, { status: 400 });
  }

  try {
    await getSiteMqttService().publishCommand(entityId, body);
    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Command failed';
    const status = message === 'Unknown entity' ? 404 : message.includes('Confirmation') ? 409 : 400;
    return json({ ok: false, error: message }, { status });
  }
};
