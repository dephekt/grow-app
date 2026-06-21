import { json, type RequestHandler } from '@sveltejs/kit';
import { firmwareError } from '$lib/server/firmware/http';
import { resolveFirmwarePackage } from '$lib/server/firmware/packages';
import { getSiteMqttService } from '$lib/server/mqtt/service';

export const POST: RequestHandler = async ({ params }) => {
  const nodeId = params.nodeId;
  if (!nodeId) return json({ ok: false, error: 'Missing node id' }, { status: 400 });

  try {
    const service = getSiteMqttService();
    const device = service.firmwareDevice(nodeId);
    if (!device) return json({ ok: false, error: 'Firmware metadata is not discovered for this device' }, { status: 404 });

    const channel = service.selectedFirmwareChannel(nodeId);
    const resolved = await resolveFirmwarePackage(device, channel);
    if (!resolved) {
      return json({
        ok: true,
        nodeId,
        channel,
        package: null,
        listing: null,
        checkTriggered: false
      });
    }
    if (resolved.manifest.version === device.installedVersion) {
      return json({
        ok: true,
        nodeId,
        channel,
        package: resolved.manifest,
        listing: resolved.listing,
        checkTriggered: false
      });
    }

    const checkTriggered = await service.triggerFirmwareCheck(nodeId);
    return json({
      ok: true,
      nodeId,
      channel,
      package: resolved.manifest,
      listing: resolved.listing,
      checkTriggered
    });
  } catch (error) {
    return firmwareError(error, 502);
  }
};
