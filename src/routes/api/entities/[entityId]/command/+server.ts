import { json, type RequestHandler } from '@sveltejs/kit';
import { devSnapshotCommandResult } from '$lib/server/dev-snapshot';
import { getSiteMqttService } from '$lib/server/mqtt/service';
import type { CommandRequest } from '$lib/server/mqtt/types';

export const POST: RequestHandler = async ({ fetch, params, request }) => {
  const body = (await request.json().catch(() => ({}))) as CommandRequest;
  const entityId = params.entityId;

  if (!entityId) {
    return json({ ok: false, error: 'Missing entity id' }, { status: 400 });
  }

  const devCommand = await devSnapshotCommandResult(entityId, body, undefined, fetch);
  if (devCommand) return json(devCommand.body, { status: devCommand.status });

  try {
    await getSiteMqttService().publishCommand(entityId, body);
    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Command failed';
    const status = message === 'Unknown entity' ? 404 : message.includes('Confirmation') ? 409 : 400;
    return json({ ok: false, error: message }, { status });
  }
};
