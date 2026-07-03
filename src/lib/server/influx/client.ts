import { InfluxDB } from '@influxdata/influxdb-client';
import { env, secretEnv } from '$lib/server/env';
import { getSiteSlug } from '$lib/server/site';

export interface InfluxConfig {
  url: string;
  token: string;
  org: string;
  bucket: string;
}

/**
 * Resolve InfluxDB connection config from the environment. Returns null when the
 * site has no time-series backend wired up (URL or token absent), so callers can
 * degrade gracefully instead of throwing — the app must keep working on a site
 * that has not deployed InfluxDB yet.
 */
export function getInfluxConfig(): InfluxConfig | null {
  const url = env('INFLUX_URL');
  const token = secretEnv('INFLUX_TOKEN', { optional: true });
  if (!url || !token) return null;

  return {
    url,
    token,
    org: env('INFLUX_ORG') ?? 'grow',
    bucket: env('INFLUX_BUCKET') ?? getSiteSlug()
  };
}

let cached: InfluxDB | null = null;

export function getInfluxDB(config = getInfluxConfig()): InfluxDB | null {
  if (!config) return null;
  if (!cached) cached = new InfluxDB({ url: config.url, token: config.token });
  return cached;
}

export function isInfluxConfigured(): boolean {
  return getInfluxConfig() !== null;
}
