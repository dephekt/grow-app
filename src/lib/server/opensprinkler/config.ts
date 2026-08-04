// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { getSiteMqttConfig } from '$lib/server/mqtt/config';

/**
 * OpenSprinkler integration config, derived from the site MQTT config so the base
 * topic and discovery prefix stay in lockstep with the rest of the bus.
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
