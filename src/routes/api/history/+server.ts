import { json } from '@sveltejs/kit';
import { isInfluxConfigured } from '$lib/server/influx/client';
import { DEFAULT_HISTORY_RANGE, isHistoryRange, queryHistory } from '$lib/server/influx/query';
import { DEFAULT_TREND_DOMAIN, isTrendDomain, resolveDomainSeries } from '$lib/server/influx/trend-domains';
import { getSiteMqttService } from '$lib/server/mqtt/service';
import type { RequestHandler } from './$types';

/**
 * Server-mediated time-series read. Browsers never touch InfluxDB directly — they
 * ask for a trend DOMAIN (water/climate/thermal/air-quality/substrate), we resolve
 * that domain's entities against live discovery and query Influx on their behalf.
 */
export const GET: RequestHandler = async ({ url }) => {
  const rangeParam = url.searchParams.get('range');
  const range = isHistoryRange(rangeParam) ? rangeParam : DEFAULT_HISTORY_RANGE;
  const domainParam = url.searchParams.get('domain');
  const domain = isTrendDomain(domainParam) ? domainParam : DEFAULT_TREND_DOMAIN;

  if (!isInfluxConfigured()) {
    return json({ configured: false, domain, range, series: [] });
  }

  const snapshot = getSiteMqttService().snapshot();
  const specs = resolveDomainSeries(snapshot, domain);

  const history = await queryHistory(
    specs.map(({ key, node, entity }) => ({ key, node, entity })),
    range
  );
  const pointsByKey = new Map(history.map((s) => [s.key, s.points]));

  return json({
    configured: true,
    domain,
    range,
    series: specs.map((s) => ({
      key: s.key,
      label: s.label,
      unit: s.unit,
      points: pointsByKey.get(s.key) ?? []
    }))
  });
};
