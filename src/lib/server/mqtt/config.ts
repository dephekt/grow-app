import { env, secretEnv } from '$lib/server/env';
import { getSiteSlug } from '$lib/server/site';

export interface SiteMqttConfig {
  site: string;
  mqttUrl: string;
  username?: string;
  password?: string;
  topicPrefix: string;
  discoveryPrefix: string;
  /** Explicit MQTT client id. Set distinctly per process (e.g. the recorder)
   * to avoid two containers colliding on a PID-derived id — both run as PID 1. */
  clientId?: string;
  /** OpenSprinkler integration opt-in (`GROW_OS_ENABLED=true`). Optional so tests
   *  can construct the service with a minimal config. */
  osEnabled?: boolean;
  /** OpenSprinkler publish/subscribe base topic, e.g. `grow/daniel-home/os`. */
  osBaseTopic?: string;
}

export function getSiteMqttConfig(): SiteMqttConfig {
  const site = getSiteSlug();
  const topicPrefix = env('MQTT_TOPIC_PREFIX') ?? `grow/${site}`;

  return {
    site,
    mqttUrl: env('MQTT_URL') ?? 'mqtt://localhost:1883',
    username: env('MQTT_USERNAME') ?? 'grow-app-site-daniel-home',
    password: secretEnv('MQTT_PASSWORD'),
    topicPrefix,
    discoveryPrefix: env('MQTT_DISCOVERY_PREFIX') ?? `${topicPrefix}/_discovery`,
    clientId: env('MQTT_CLIENT_ID'),
    osEnabled: env('GROW_OS_ENABLED') === 'true',
    osBaseTopic: env('GROW_OS_BASE_TOPIC') ?? `${topicPrefix}/os`
  };
}
