import { json, type RequestHandler } from '@sveltejs/kit';
import { requireFirmwareUpdateToken } from '$lib/server/firmware/access';
import { firmwareError } from '$lib/server/firmware/http';
import {
  assertPackageManifestMatchesDevice,
  downloadAndValidateBinary,
  downloadPackageManifest,
  getFirmwarePackageSource
} from '$lib/server/firmware/packages';
import { getSiteMqttService } from '$lib/server/mqtt/service';

export const GET: RequestHandler = async ({ params, url }) => {
  const nodeId = params.nodeId;
  const filename = params.filename;
  const version = url.searchParams.get('version');
  if (!nodeId || !filename) return json({ error: 'Missing node id or filename' }, { status: 400 });
  if (!version) return json({ error: 'Missing package version' }, { status: 400 });

  const tokenResult = requireFirmwareUpdateToken(url);
  if (tokenResult instanceof Response) return tokenResult;

  try {
    const service = getSiteMqttService();
    const device = service.firmwareDevice(nodeId);
    if (!device) return json({ error: 'Firmware metadata is not discovered for this device' }, { status: 404 });

    const source = getFirmwarePackageSource();
    const manifest = await downloadPackageManifest(device, version, fetch, source);
    assertPackageManifestMatchesDevice(manifest, device, undefined, source.provider === 'ghcr-oci' ? device.packageOwner : source.owner);
    const bytes = await downloadAndValidateBinary(manifest, filename, fetch, source);
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
