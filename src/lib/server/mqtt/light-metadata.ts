import type { DeviceLightsFragment } from './types';
import { numberValue, stringValue } from './coerce';

export interface ParsedLightsConfig {
  nodeId: string;
  fragment: DeviceLightsFragment | null;
}

/** Coerce a raw role value to a string objectId or a string[] of objectIds,
 *  dropping anything that isn't. Returns undefined if nothing usable remains. */
function roleValue(value: unknown): string | string[] | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  if (Array.isArray(value)) {
    const ids = value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
    return ids.length > 0 ? ids : undefined;
  }
  return undefined;
}

function parseLight(value: unknown): DeviceLightsFragment['lights'][number] | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = stringValue(raw.id);
  if (!id) return null;

  const roles: Record<string, string | string[]> = {};
  if (raw.roles && typeof raw.roles === 'object') {
    for (const [role, val] of Object.entries(raw.roles as Record<string, unknown>)) {
      const coerced = roleValue(val);
      if (coerced !== undefined) roles[role] = coerced;
    }
  }

  return {
    id,
    name: stringValue(raw.name),
    type: stringValue(raw.type),
    order: numberValue(raw.order, 0),
    roles
  };
}

export function parseLightsConfigTopic(topic: string, topicPrefix: string): string | null {
  if (!topic.startsWith(`${topicPrefix}/`) || !topic.endsWith('/_lights/config')) return null;
  const nodeId = topic.slice(topicPrefix.length + 1, -'/_lights/config'.length);
  return nodeId.length > 0 && !nodeId.includes('/') ? nodeId : null;
}

export function parseLightsConfigPayload(
  topic: string,
  payloadText: string,
  topicPrefix: string
): ParsedLightsConfig | null {
  const nodeId = parseLightsConfigTopic(topic, topicPrefix);
  if (!nodeId) return null;
  if (payloadText.trim().length === 0) return { nodeId, fragment: null };

  let payload: unknown;
  try {
    payload = JSON.parse(payloadText);
  } catch {
    return null;
  }

  if (!payload || typeof payload !== 'object') return null;
  const raw = payload as Record<string, unknown>;

  if (raw.schema !== 'grow-lights.v1') return null;
  const payloadNodeId = stringValue(raw.nodeId);
  if (payloadNodeId !== nodeId) return null;

  const lights = Array.isArray(raw.lights)
    ? raw.lights.map(parseLight).filter((light): light is DeviceLightsFragment['lights'][number] => Boolean(light))
    : [];

  return {
    nodeId,
    fragment: {
      schema: 'grow-lights.v1',
      nodeId,
      lights
    }
  };
}
