export interface SiteMqttConfig {
  site: string;
  mqttUrl: string;
  username?: string;
  password?: string;
  topicPrefix: string;
  discoveryPrefix: string;
}

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export function getSiteMqttConfig(): SiteMqttConfig {
  const site = env('GROW_SITE') ?? 'daniel-home';
  const topicPrefix = env('MQTT_TOPIC_PREFIX') ?? `grow/${site}`;

  return {
    site,
    mqttUrl: env('MQTT_URL') ?? 'mqtt://localhost:1883',
    username: env('MQTT_USERNAME') ?? 'grow-app-site-daniel-home',
    password: env('MQTT_PASSWORD'),
    topicPrefix,
    discoveryPrefix: env('MQTT_DISCOVERY_PREFIX') ?? `${topicPrefix}/_discovery`
  };
}
