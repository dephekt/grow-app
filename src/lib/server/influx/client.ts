// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

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
 * Resolve InfluxDB connection config from the environment, or null when the site has
 * no time-series backend wired up (URL or token absent).
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
