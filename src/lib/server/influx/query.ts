import { getInfluxConfig, getInfluxDB } from './client';

export type HistoryRange = '1h' | '3h' | '6h' | '12h' | '24h';

export const HISTORY_RANGES: HistoryRange[] = ['1h', '3h', '6h', '12h', '24h'];

export const DEFAULT_HISTORY_RANGE: HistoryRange = '6h';

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

const RANGE_HOURS: Record<HistoryRange, number> = {
  '1h': 1,
  '3h': 3,
  '6h': 6,
  '12h': 12,
  '24h': 24
};

/** ~200 points/series keeps the SVG chart crisp without overfetching. */
const TARGET_POINTS = 200;

export function isHistoryRange(value: string | null | undefined): value is HistoryRange {
  return typeof value === 'string' && (HISTORY_RANGES as string[]).includes(value);
}

function escapeFluxString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export async function queryHistory(series: HistorySeriesRequest[], range: HistoryRange): Promise<HistorySeries[]> {
  const config = getInfluxConfig();
  const db = getInfluxDB(config);
  if (!config || !db || series.length === 0) return [];

  const hours = RANGE_HOURS[range];
  const windowSeconds = Math.max(30, Math.round((hours * 3600) / TARGET_POINTS));
  const predicate = series
    .map((s) => `(r.node == "${escapeFluxString(s.node)}" and r.entity == "${escapeFluxString(s.entity)}")`)
    .join(' or ');

  const flux = `from(bucket: "${escapeFluxString(config.bucket)}")
  |> range(start: -${hours}h)
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
  return series.map((s) => byKey.get(s.key)).filter((s): s is HistorySeries => Boolean(s && s.points.length > 0));
}
