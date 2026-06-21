import type { FirmwareChannel, FirmwareChannelConfig, FirmwareDeviceConfig } from '$lib/server/mqtt/types';
export { parseProjectVersion } from '$lib/firmware';

export interface FirmwareDevicePayload {
  nodeId: string;
  config: FirmwareDeviceConfig | null;
}

export interface FirmwareChannelPayload {
  nodeId: string;
  config: FirmwareChannelConfig | null;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function firmwareDeviceTopic(topic: string, topicPrefix: string): string | null {
  const prefix = `${topicPrefix}/`;
  const suffix = '/_firmware/config';
  if (!topic.startsWith(prefix) || !topic.endsWith(suffix)) return null;
  const nodeId = topic.slice(prefix.length, -suffix.length);
  return nodeId.length > 0 && !nodeId.includes('/') ? nodeId : null;
}

export function firmwareChannelTopic(topic: string, topicPrefix: string): string | null {
  const prefix = `${topicPrefix}/_app/firmware/`;
  const suffix = '/channel';
  if (!topic.startsWith(prefix) || !topic.endsWith(suffix)) return null;
  const nodeId = topic.slice(prefix.length, -suffix.length);
  return nodeId.length > 0 && !nodeId.includes('/') ? nodeId : null;
}

export function parseFirmwareDevicePayload(
  topic: string,
  payloadText: string,
  topicPrefix: string
): FirmwareDevicePayload | null {
  const nodeId = firmwareDeviceTopic(topic, topicPrefix);
  if (!nodeId) return null;
  if (payloadText.trim().length === 0) return { nodeId, config: null };

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(payloadText) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (payload.schema !== 'grow-firmware-device.v1') return null;
  const payloadNodeId = text(payload.nodeId);
  if (payloadNodeId !== nodeId) return null;

  const projectName = text(payload.projectName);
  const packageOwner = text(payload.packageOwner);
  const packageName = text(payload.package);
  const device = text(payload.device);
  const chipFamily = text(payload.chipFamily);
  if (!projectName || !packageOwner || !packageName || !device || !chipFamily) return null;

  return {
    nodeId,
    config: {
      schema: 'grow-firmware-device.v1',
      nodeId,
      projectName,
      packageOwner,
      package: packageName,
      device,
      chipFamily,
      installedVersion: text(payload.installedVersion),
      manifestUrl: text(payload.manifestUrl)
    }
  };
}

export function parseFirmwareChannelPayload(
  topic: string,
  payloadText: string,
  topicPrefix: string
): FirmwareChannelPayload | null {
  const nodeId = firmwareChannelTopic(topic, topicPrefix);
  if (!nodeId) return null;
  if (payloadText.trim().length === 0) return { nodeId, config: null };

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(payloadText) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (payload.schema !== 'grow-firmware-channel.v1') return null;
  if (text(payload.nodeId) !== nodeId) return null;
  const channel = text(payload.channel);
  if (!isFirmwareChannel(channel)) return null;

  return {
    nodeId,
    config: {
      schema: 'grow-firmware-channel.v1',
      nodeId,
      channel,
      updatedAt: text(payload.updatedAt) ?? new Date(0).toISOString()
    }
  };
}

export function isFirmwareChannel(value: unknown): value is FirmwareChannel {
  return value === 'stable' || value === 'edge';
}

export function buildFirmwareChannelConfig(nodeId: string, channel: FirmwareChannel, updatedAt = new Date().toISOString()) {
  return {
    schema: 'grow-firmware-channel.v1',
    nodeId,
    channel,
    updatedAt
  } satisfies FirmwareChannelConfig;
}
