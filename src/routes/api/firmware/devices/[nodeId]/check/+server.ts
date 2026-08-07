// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { json, type RequestHandler } from '@sveltejs/kit';
import { firmwareError } from '$lib/server/firmware/http';
import { resolveFirmwarePackage } from '$lib/server/firmware/packages';
import { parseFirmwareUpdateState, resolveInstalledVersion } from '$lib/server/firmware/update-state';
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
    const updateEntity = service.firmwareUpdateEntity(nodeId);
    const updateState = updateEntity
      ? parseFirmwareUpdateState(service.entityState(updateEntity.id).value)
      : null;
    if (resolved.manifest.version === resolveInstalledVersion(updateState, device)) {
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
