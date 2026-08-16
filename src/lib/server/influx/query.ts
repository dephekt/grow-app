// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { RANGE_SECONDS, type HistoryRange } from '$lib/trends';
import { getInfluxConfig, getInfluxDB } from './client';

// The range vocabulary is owned by `$lib/trends` so the client panel can share it.
export {
  DEFAULT_HISTORY_RANGE,
  HISTORY_RANGES,
  isHistoryRange,
  type HistoryRange
} from '$lib/trends';

/** Single Influx measurement the recorder writes every reading into (tag-keyed). */
export const READING_MEASUREMENT = 'reading';

export interface HistorySeriesRequest {
  /** Logical series id, e.g. 'ph' — stable across the request/response. */
  key: string;
  /** Device nodeId tag. */
  node: string;
  /** Entity objectId tag. */
  entity: string;
}

export interface HistoryPoint {
  t: string;
  v: number;
}

export interface HistorySeries {
  key: string;
  node: string;
  entity: string;
  points: HistoryPoint[];
}

/** ~600 points/series — enough resolution to drag-zoom into within uPlot without
 *  re-fetching, while still bounding the Influx response. */
const TARGET_POINTS = 600;

/** The aggregate window that holds any range to ~600 points, floored so short ranges
 *  do not ask Influx for buckets finer than the sensors publish. */
export function historyWindowSeconds(range: HistoryRange): number {
  return Math.max(30, Math.round(RANGE_SECONDS[range] / TARGET_POINTS));
}

/** Escape a value for safe interpolation into a Flux double-quoted string literal. */
export function escapeFluxString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export async function queryHistory(
  series: HistorySeriesRequest[],
  range: HistoryRange
): Promise<HistorySeries[]> {
  const config = getInfluxConfig();
  const db = getInfluxDB(config);
  if (!config || !db || series.length === 0) return [];

  const seconds = RANGE_SECONDS[range];
  const windowSeconds = historyWindowSeconds(range);
  const predicate = series
    .map(
      (s) =>
        `(r.node == "${escapeFluxString(s.node)}" and r.entity == "${escapeFluxString(s.entity)}")`
    )
    .join(' or ');

  const flux = `from(bucket: "${escapeFluxString(config.bucket)}")
  |> range(start: -${seconds}s)
  |> filter(fn: (r) => r._measurement == "${READING_MEASUREMENT}" and r._field == "value")
  |> filter(fn: (r) => ${predicate})
  |> aggregateWindow(every: ${windowSeconds}s, fn: mean, createEmpty: false)
  |> keep(columns: ["_time", "_value", "node", "entity"])`;

  const byKey = new Map<string, HistorySeries>();
  const keyByTag = new Map<string, string>();
  for (const s of series) {
    keyByTag.set(`${s.node}|${s.entity}`, s.key);
    byKey.set(s.key, { key: s.key, node: s.node, entity: s.entity, points: [] });
  }

  const queryApi = db.getQueryApi(config.org);
  try {
    for await (const { values, tableMeta } of queryApi.iterateRows(flux)) {
      const row = tableMeta.toObject(values) as Record<string, unknown>;
      const key = keyByTag.get(`${String(row.node ?? '')}|${String(row.entity ?? '')}`);
      if (!key) continue;
      const v = Number(row._value);
      if (!Number.isFinite(v)) continue;
      byKey.get(key)?.points.push({ t: String(row._time), v });
    }
  } catch (err) {
    console.warn('[influx] queryHistory error:', err);
  }

  // Preserve request order; drop series with no stored history yet.
  return series
    .map((s) => byKey.get(s.key))
    .filter((s): s is HistorySeries => Boolean(s && s.points.length > 0));
}
