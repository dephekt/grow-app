import { json } from '@sveltejs/kit';
import { isInfluxConfigured } from '$lib/server/influx/client';
import { DEFAULT_HISTORY_RANGE, isHistoryRange, queryHistory } from '$lib/server/influx/query';
import { resolveTrendSeries } from '$lib/server/influx/trend-series';
import { getSiteMqttService } from '$lib/server/mqtt/service';
import type { RequestHandler } from './$types';

/**
 * Server-mediated time-series read. Browsers never touch InfluxDB directly —
 * they ask for curated trend series resolved against live discovery, and we
 * query Influx on their behalf.
 */
export const GET: RequestHandler = async ({ url }) => {
  const rangeParam = url.searchParams.get('range');
  const range = isHistoryRange(rangeParam) ? rangeParam : DEFAULT_HISTORY_RANGE;

  if (!isInfluxConfigured()) {
    return json({ configured: false, range, series: [] });
  }

  const requested = url.searchParams.get('series');
  const wanted = requested
    ? new Set(
        requested
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      )
    : null;

  const snapshot = getSiteMqttService().snapshot();
  const resolved = resolveTrendSeries(snapshot).filter((s) => !wanted || wanted.has(s.key));

  const history = await queryHistory(
    resolved.map(({ key, node, entity }) => ({ key, node, entity })),
    range
  );
  const pointsByKey = new Map(history.map((s) => [s.key, s.points]));

  return json({
    configured: true,
    range,
    series: resolved.map((s) => ({
      key: s.key,
      label: s.label,
      color: s.color,
      node: s.node,
      entity: s.entity,
      points: pointsByKey.get(s.key) ?? []
    }))
  });
};
