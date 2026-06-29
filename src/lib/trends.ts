/**
 * Trend domains + the chart's data contract, shared by the dashboard panel
 * (`TrendsPanel`), the chart (`TrendsChart`), and the server-side resolver
 * (`server/influx/trend-domains.ts`) so the three never drift. Client-safe — no
 * `$lib/server` imports — so the browser bundle can use the domain list/type.
 */
export type TrendDomain = 'water' | 'climate' | 'thermal' | 'substrate';

export const TREND_DOMAINS: ReadonlyArray<{ key: TrendDomain; label: string; planned?: boolean }> = [
  { key: 'water', label: 'Water' },
  { key: 'climate', label: 'Climate' },
  { key: 'thermal', label: 'Thermal' },
  // `planned` domains render the NOT-CONNECTED placeholder and skip the history fetch —
  // a future domain just sets the flag instead of being special-cased by name.
  { key: 'substrate', label: 'Substrate', planned: true }
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
