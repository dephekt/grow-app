import { json, type RequestHandler } from '@sveltejs/kit';
import { firmwareError } from '$lib/server/firmware/http';
import {
  assertPackageManifestMatchesDevice,
  downloadAndValidateBinary,
  downloadPackageManifest
} from '$lib/server/firmware/packages';
import { getSiteMqttService } from '$lib/server/mqtt/service';

export const GET: RequestHandler = async ({ params, url }) => {
  const nodeId = params.nodeId;
  const filename = params.filename;
  const version = url.searchParams.get('version');
  if (!nodeId || !filename) return json({ error: 'Missing node id or filename' }, { status: 400 });
  if (!version) return json({ error: 'Missing package version' }, { status: 400 });

  try {
    const service = getSiteMqttService();
    const device = service.firmwareDevice(nodeId);
    if (!device) return json({ error: 'Firmware metadata is not discovered for this device' }, { status: 404 });

    const manifest = await downloadPackageManifest(device, version);
    assertPackageManifestMatchesDevice(manifest, device);
    const bytes = await downloadAndValidateBinary(manifest, filename);
    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);
    return new Response(body, {
      headers: {
        'content-type': 'application/octet-stream',
        'cache-control': 'no-store',
        'content-length': String(bytes.byteLength)
      }
    });
  } catch (error) {
    return firmwareError(error, 502);
  }
};
