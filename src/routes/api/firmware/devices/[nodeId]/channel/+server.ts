import { json, type RequestHandler } from '@sveltejs/kit';
import { firmwareError } from '$lib/server/firmware/http';
import { isFirmwareChannel } from '$lib/server/firmware/metadata';
import { getSiteMqttService } from '$lib/server/mqtt/service';

export const GET: RequestHandler = ({ params }) => {
  const nodeId = params.nodeId;
  if (!nodeId) return json({ ok: false, error: 'Missing node id' }, { status: 400 });

  const service = getSiteMqttService();
  return json({
    ok: true,
    nodeId,
    channel: service.selectedFirmwareChannel(nodeId),
    config: service.snapshot().firmware.channels[nodeId] ?? null
  });
};

export const PUT: RequestHandler = async ({ params, request }) => {
  const nodeId = params.nodeId;
  if (!nodeId) return json({ ok: false, error: 'Missing node id' }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as { channel?: unknown };
  if (!isFirmwareChannel(body.channel)) {
    return json({ ok: false, error: 'Expected channel stable or edge' }, { status: 400 });
  }

  try {
    const service = getSiteMqttService();
    if (!service.firmwareDevice(nodeId)) {
      return json({ ok: false, error: 'Firmware metadata is not discovered for this device' }, { status: 404 });
    }
    const config = await service.setFirmwareChannel(nodeId, body.channel);
    return json({ ok: true, config });
  } catch (error) {
    return firmwareError(error);
  }
};
