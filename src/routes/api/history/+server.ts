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
import { listProbes } from '$lib/server/opensprinkler/probes';
import type { SubstrateProbeBinding, SubstrateZoneBinding } from '$lib/substrate';
import type { RequestHandler } from './$types';

/**
 * Zones and their probe bindings, which together select the calibration curve and the
 * series labels for the substrate domain.
 */
function substrateBindings(domain: string): {
  zones: SubstrateZoneBinding[];
  probes: SubstrateProbeBinding[];
} {
  if (domain !== 'substrate') return { zones: [], probes: [] };
  try {
    const db = getIrrigationDb();
    return {
      zones: listZones(db).map((z) => ({ id: z.id, name: z.name, substrateType: z.substrateType })),
      probes: listProbes(db)
    };
  } catch (err) {
    console.warn('[history] could not read zone bindings:', err);
    return { zones: [], probes: [] };
  }
}

/**
 * Server-mediated time-series read: browsers ask for a trend domain
 * (water/climate/thermal/air-quality/substrate) and never touch InfluxDB directly.
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
  const { zones, probes } = substrateBindings(domain);
  const specs = resolveDomainSeries(snapshot, domain, zones, probes);

  const history = await queryHistory(
    specs.map(({ key, node, entity }) => ({ key, node, entity })),
    range
  );
  const pointsByKey = new Map(history.map((s) => [s.key, s.points]));

  return json({
    configured: true,
    domain,
    range,
    series: assembleDomainSeries(snapshot, domain, specs, pointsByKey, zones, probes)
  });
};
