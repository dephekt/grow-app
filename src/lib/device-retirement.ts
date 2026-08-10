// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import type { EntityConfig, Snapshot } from '$lib/server/mqtt/types';

/** Publisher nodes intentionally retired from this site's app, even if retained MQTT data remains. */
const RETIRED_DEVICE_NODE_IDS: ReadonlySet<string> = new Set(['m5stack-airq']);

export function isRetiredDeviceNode(nodeId: string | null | undefined): boolean {
  return nodeId != null && RETIRED_DEVICE_NODE_IDS.has(nodeId);
}

function isRetiredEntity(entity: EntityConfig): boolean {
  return (
    isRetiredDeviceNode(entity.nodeId) ||
    entity.device.identifiers.some((identifier) => isRetiredDeviceNode(identifier))
  );
}

/** Apply the same retirement policy to saved snapshots that broker ingestion applies live. */
export function filterRetiredDevicesFromSnapshot(snapshot: Snapshot): Snapshot {
  const entities = snapshot.entities.filter((entity) => !isRetiredEntity(entity));
  const entityIds = new Set(entities.map((entity) => entity.id));
  const activeNodeEntries = <T extends { nodeId: string }>(record: Record<string, T>) =>
    Object.entries(record).filter(
      ([nodeId, value]) => !isRetiredDeviceNode(nodeId) && !isRetiredDeviceNode(value.nodeId)
    );

  return {
    ...snapshot,
    devices: snapshot.devices
      .filter((device) => !isRetiredDeviceNode(device.nodeId) && !isRetiredDeviceNode(device.id))
      .map((device) => ({ ...device, entityIds: device.entityIds.filter((id) => entityIds.has(id)) })),
    entities,
    states: Object.fromEntries(Object.entries(snapshot.states).filter(([entityId]) => entityIds.has(entityId))),
    uiConfigs: Object.fromEntries(activeNodeEntries(snapshot.uiConfigs ?? {})),
    firmware: {
      devices: Object.fromEntries(activeNodeEntries(snapshot.firmware?.devices ?? {})),
      channels: Object.fromEntries(activeNodeEntries(snapshot.firmware?.channels ?? {}))
    },
    spectrometerNodeIds: snapshot.spectrometerNodeIds?.filter((nodeId) => !isRetiredDeviceNode(nodeId))
  };
}
