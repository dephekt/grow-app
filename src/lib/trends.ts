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
  // Substrate charts derived VWC / pore EC beside the raw temp and bulk EC, per probe.
  { key: 'substrate', label: 'Substrate' }
];

export const DEFAULT_TREND_DOMAIN: TrendDomain = 'water';

export function isTrendDomain(value: string | null | undefined): value is TrendDomain {
  return TREND_DOMAINS.some((d) => d.key === value);
}

/**
 * History windows, in the order the range pills render them. Lives here rather than in
 * `server/influx/query.ts` because the panel is client code and SvelteKit's illegal-import
 * check is static — any path into `$lib/server` is a build error, whichever binding is taken.
 * `7d`/`30d` rather than `1w`/`1m`, which reads as "1 minute" beside `1h`.
 */
export const HISTORY_RANGES = ['1h', '3h', '6h', '12h', '24h', '3d', '7d', '30d'] as const;

export type HistoryRange = (typeof HISTORY_RANGES)[number];

export const DEFAULT_HISTORY_RANGE: HistoryRange = '6h';

const HOUR = 3600;

/** How far back each range reaches; the aggregate window is sized from this too. */
export const RANGE_SECONDS: Record<HistoryRange, number> = {
  '1h': HOUR,
  '3h': 3 * HOUR,
  '6h': 6 * HOUR,
  '12h': 12 * HOUR,
  '24h': 24 * HOUR,
  '3d': 72 * HOUR,
  '7d': 168 * HOUR,
  '30d': 720 * HOUR
};

export function isHistoryRange(value: string | null | undefined): value is HistoryRange {
  return typeof value === 'string' && (HISTORY_RANGES as readonly string[]).includes(value);
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
  /** Charted but switched off until the legend turns it on — a secondary reading. */
  hidden?: boolean;
}
