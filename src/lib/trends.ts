// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/**
 * Trend domains + the chart's data contract, shared by the dashboard panel
 * (`TrendsPanel`), the chart (`TrendsChart`), and the server-side resolver
 * (`server/influx/trend-domains.ts`) so the three never drift. Client-safe — no
 * `$lib/server` imports — so the browser bundle can use the domain list/type.
 */
export type TrendDomain = 'water' | 'climate' | 'thermal' | 'air-quality' | 'substrate';

export const TREND_DOMAINS: ReadonlyArray<{ key: TrendDomain; label: string; planned?: boolean }> = [
  { key: 'water', label: 'Water' },
  { key: 'climate', label: 'Climate' },
  { key: 'thermal', label: 'Thermal' },
  { key: 'air-quality', label: 'Air Quality' },
  // Substrate charts derived VWC / pore EC per probe (see `server/influx/trend-domains`).
  // No longer `planned`: with no probe on the bus it resolves to no series and the chart
  // shows its own empty state, which is the same answer without hard-coding it.
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
}
