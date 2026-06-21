import { json, type RequestHandler } from '@sveltejs/kit';
import { requireFirmwareUpdateToken } from '$lib/server/firmware/access';
import { firmwareError } from '$lib/server/firmware/http';
import { resolveFirmwarePackage, toEspHomeManifest } from '$lib/server/firmware/packages';
import { getSiteMqttService } from '$lib/server/mqtt/service';

export const GET: RequestHandler = async ({ params, url }) => {
  const nodeId = params.nodeId;
  if (!nodeId) return json({ error: 'Missing node id' }, { status: 400 });

  const tokenResult = requireFirmwareUpdateToken(url);
  if (tokenResult instanceof Response) return tokenResult;

  try {
    const service = getSiteMqttService();
    const device = service.firmwareDevice(nodeId);
    if (!device) return json({ error: 'Firmware metadata is not discovered for this device' }, { status: 404 });

    const channel = service.selectedFirmwareChannel(nodeId);
    const resolved = await resolveFirmwarePackage(device, channel);
    if (!resolved) return json({ error: `No ${channel} firmware package found for ${device.package}` }, { status: 404 });

    return json(toEspHomeManifest(resolved.manifest, nodeId, tokenResult.token), {
      headers: {
        'cache-control': 'no-store'
      }
    });
  } catch (error) {
    return firmwareError(error, 502);
  }
};
