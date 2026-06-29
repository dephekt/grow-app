import { readFileSync } from 'node:fs';
import { InfluxDB } from '@influxdata/influxdb-client';

export interface InfluxConfig {
  url: string;
  token: string;
  org: string;
  bucket: string;
}

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

function secretEnv(name: string): string | undefined {
  const direct = env(name);
  if (direct) return direct;

  const file = env(`${name}_FILE`);
  if (!file) return undefined;

  return readFileSync(file, 'utf8').replace(/\r?\n$/, '');
}

/**
 * Resolve InfluxDB connection config from the environment. Returns null when the
 * site has no time-series backend wired up (URL or token absent), so callers can
 * degrade gracefully instead of throwing — the app must keep working on a site
 * that has not deployed InfluxDB yet.
 */
export function getInfluxConfig(): InfluxConfig | null {
  const url = env('INFLUX_URL');
  const token = secretEnv('INFLUX_TOKEN');
  if (!url || !token) return null;

  return {
    url,
    token,
    org: env('INFLUX_ORG') ?? 'grow',
    bucket: env('INFLUX_BUCKET') ?? env('GROW_SITE') ?? 'daniel-home'
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
