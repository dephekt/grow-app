import { getSiteMqttConfig } from '$lib/server/mqtt/config';

/**
 * OpenSprinkler integration config, derived from the site MQTT config so the base
 * topic and discovery prefix stay in lockstep with the rest of the bus. There is
 * no device password: we run OpenSprinkler with "Ignore Password" on (its `pw` is a
 * replayable cleartext MD5 on the bus, so the broker ACL — not the password — is the
 * real gate), so commands carry no `pw` and there is no secret to manage.
 */
export interface OpenSprinklerConfig {
  /** Per-site opt-in (`GROW_OS_ENABLED=true`) — only sites with an OpenSprinkler. */
  enabled: boolean;
  /** OS publish/subscribe base, e.g. `grow/daniel-home/os` (commands go to `<base>/cmd`). */
  baseTopic: string;
  /** HA-style discovery prefix, shared with the rest of the entity model. */
  discoveryPrefix: string;
}

export function getOpenSprinklerConfig(): OpenSprinklerConfig {
  const mqtt = getSiteMqttConfig();
  return {
    enabled: mqtt.osEnabled ?? false,
    baseTopic: mqtt.osBaseTopic ?? `${mqtt.topicPrefix}/os`,
    discoveryPrefix: mqtt.discoveryPrefix
  };
}
