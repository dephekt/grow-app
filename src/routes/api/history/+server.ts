// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { json } from '@sveltejs/kit';
import { isInfluxConfigured } from '$lib/server/influx/client';
import { DEFAULT_HISTORY_RANGE, isHistoryRange, queryHistory } from '$lib/server/influx/query';
import {
  DEFAULT_TREND_DOMAIN,
  assembleDomainSeries,
  isTrendDomain,
  resolveDomainSeries
} from '$lib/server/influx/trend-domains';
import { getSiteMqttService } from '$lib/server/mqtt/service';
import { getIrrigationDb } from '$lib/server/opensprinkler/db';
import { listZones } from '$lib/server/opensprinkler/zones';
import type { SubstrateZoneBinding } from '$lib/substrate';
import type { RequestHandler } from './$types';

/**
 * Zone→probe bindings, which select the calibration curve for the substrate domain.
 * Read only for that domain — the other four never touch the irrigation database, and a
 * read failure degrades to the default curve rather than failing the chart.
 */
function substrateBindings(domain: string): SubstrateZoneBinding[] {
  if (domain !== 'substrate') return [];
  try {
    return listZones(getIrrigationDb()).map((z) => ({
      name: z.name,
      substrateType: z.substrateType,
      substrateNodeId: z.substrateNodeId
    }));
  } catch (err) {
    console.warn('[history] could not read zone bindings:', err);
    return [];
  }
}

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
  const zones = substrateBindings(domain);
  const specs = resolveDomainSeries(snapshot, domain, zones);

  const history = await queryHistory(
    specs.map(({ key, node, entity }) => ({ key, node, entity })),
    range
  );
  const pointsByKey = new Map(history.map((s) => [s.key, s.points]));

  return json({
    configured: true,
    domain,
    range,
    series: assembleDomainSeries(snapshot, domain, specs, pointsByKey, zones)
  });
};
