import { json, type RequestHandler } from '@sveltejs/kit';
import { firmwareError } from '$lib/server/firmware/http';
import { resolveFirmwarePackage } from '$lib/server/firmware/packages';
import { parseFirmwareUpdateState } from '$lib/server/firmware/update-state';
import { getSiteMqttService } from '$lib/server/mqtt/service';

export const POST: RequestHandler = async ({ params, request }) => {
  const nodeId = params.nodeId;
  if (!nodeId) return json({ ok: false, error: 'Missing node id' }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as { version?: unknown };
  const requestedVersion = typeof body.version === 'string' ? body.version : null;

  try {
    const service = getSiteMqttService();
    const device = service.firmwareDevice(nodeId);
    if (!device) return json({ ok: false, error: 'Firmware metadata is not discovered for this device' }, { status: 404 });

    const updateEntity = service.firmwareUpdateEntity(nodeId);
    if (!updateEntity) {
      return json({ ok: false, error: 'Firmware update entity is not discovered; bootstrap this device first' }, { status: 409 });
    }

    const channel = service.selectedFirmwareChannel(nodeId);
    const resolved = await resolveFirmwarePackage(device, channel);
    if (!resolved) return json({ ok: false, error: `No ${channel} firmware package found for ${device.package}` }, { status: 404 });
    if (requestedVersion && requestedVersion !== resolved.manifest.version) {
      return json({ ok: false, error: 'Requested firmware version is no longer selected' }, { status: 409 });
    }
    if (device.installedVersion === resolved.manifest.version) {
      return json({ ok: false, error: 'Selected firmware version is already installed' }, { status: 409 });
    }

    const updateState = parseFirmwareUpdateState(service.entityState(updateEntity.id).value);
    if (updateState.latestVersion !== resolved.manifest.version) {
      return json(
        {
          ok: false,
          error: 'Device-side update state does not match the selected package',
          latestVersion: updateState.latestVersion,
          selectedVersion: resolved.manifest.version
        },
        { status: 409 }
      );
    }

    await service.applyFirmwareUpdate(nodeId);
    return json({ ok: true, nodeId, channel, version: resolved.manifest.version, payload: 'INSTALL' });
  } catch (error) {
    return firmwareError(error, 502);
  }
};
