// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/**
 * Trend domains + the chart's data contract, shared by the dashboard panel
 * (`TrendsPanel`), the chart (`TrendsChart`), and the server-side resolver
 * (`server/influx/trend-domains.ts`). Client-safe — no `$lib/server` imports.
 */
export type TrendDomain = 'water' | 'climate' | 'thermal' | 'air-quality' | 'substrate';

export const TREND_DOMAINS: ReadonlyArray<{ key: TrendDomain; label: string; planned?: boolean }> = [
  { key: 'water', label: 'Water' },
  { key: 'climate', label: 'Climate' },
  { key: 'thermal', label: 'Thermal' },
  { key: 'air-quality', label: 'Air Quality' },
  // Substrate charts derived VWC / pore EC per probe (see `server/influx/trend-domains`).
  { key: 'substrate', label: 'Substrate' }
];

export const DEFAULT_TREND_DOMAIN: TrendDomain = 'water';

export function isTrendDomain(value: string | null | undefined): value is TrendDomain {
  return TREND_DOMAINS.some((d) => d.key === value);
}

/** One sample of a trend series. */
export interface TrendPoint {
  t: string;
  v: number;
}

/** A chartable series — the contract between `/api/history` and `TrendsChart`. */
export interface TrendSeries {
  key: string;
  label: string;
  unit: string;
  points: TrendPoint[];
  /** Key of the series this one shadows for comparison — charted in its colour, dashed. */
  compareOf?: string;
}
