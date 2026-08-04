// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { presentedNumericMetrics } from '$lib/device-presentation';
import {
  isThermalArrayTemp,
  resolveAirQualityDevice,
  resolveClimateDevice,
  resolveThermalDevice,
  resolveWaterDevice
} from '$lib/entity-match';
import { type TrendDomain, type TrendPoint, type TrendSeries } from '$lib/trends';
import {
  SUBSTRATE_BULK_EC,
  SUBSTRATE_COUNTS,
  SUBSTRATE_TEMPERATURE,
  deriveReadings,
  probeTabLabel,
  resolveSubstrateProbes,
  substrateCurveFor,
  type SubstrateZoneBinding
} from '$lib/substrate';
import type { DeviceSnapshot, Snapshot } from '$lib/server/mqtt/types';

export { DEFAULT_TREND_DOMAIN, isTrendDomain } from '$lib/trends';
export type { TrendDomain } from '$lib/trends';

/**
 * Resolves a trend domain to the concrete (node, entity) series to query from Influx.
 * Keeps like with like — plotting pH against air CO₂ is meaningless, so each domain
 * charts only its own device's readings. Water/Climate come from the device's
 * firmware-declared dashboard metrics; Thermal is the MLX90640 array temps. The
 * device resolvers are shared with the dashboard panels (`$lib/entity-match`) so the
 * readout and the trend chart always plot the same device.
 */

export interface DomainSeriesSpec {
  /** Unique series id (the entity objectId) — also the Influx `entity` tag. */
  key: string;
  label: string;
  unit: string;
  node: string;
  entity: string;
}

function metricSpecs(snapshot: Snapshot, device: DeviceSnapshot | undefined, stripPrefix = ''): DomainSeriesSpec[] {
  if (!device) return [];
  return presentedNumericMetrics(snapshot, device, stripPrefix)
    .map((m) => ({
      key: m.entity.objectId ?? m.entity.id,
      label: m.label,
      unit: m.entity.unit ?? '',
      node: m.entity.nodeId ?? '',
      entity: m.entity.objectId ?? ''
    }))
    .filter((s) => s.node && s.entity);
}

function thermalLabel(objectId: string): string {
  if (objectId.includes('mean')) return 'Mean';
  if (objectId.includes('min')) return 'Min';
  if (objectId.includes('max')) return 'Max';
  return objectId;
}

/**
 * Substrate is the one domain whose charted values are not stored. The bus publisher
 * records RAW counts, temperature and bulk EC; water content and pore EC are derived
 * from them against the zone's medium (see `$lib/substrate`). So this domain queries
 * the raw series and `assembleDomainSeries` converts them afterwards — which also means
 * re-potting a zone into a different medium re-derives the whole chart, rather than
 * leaving a step where the calibration changed.
 *
 * Series keys carry the node id. Every probe on the bus publishes the SAME object ids,
 * so keying on objectId alone would collapse four pots into one series and silently
 * chart whichever answered last.
 */
function substrateSpecs(snapshot: Snapshot, zones: readonly SubstrateZoneBinding[]): DomainSeriesSpec[] {
  const specs: DomainSeriesSpec[] = [];
  for (const probe of resolveSubstrateProbes(snapshot, zones)) {
    for (const objectId of [SUBSTRATE_COUNTS, SUBSTRATE_TEMPERATURE, SUBSTRATE_BULK_EC]) {
      specs.push({
        key: `${probe.nodeId}:${objectId}`,
        label: objectId,
        unit: '',
        node: probe.nodeId,
        entity: objectId
      });
    }
  }
  return specs;
}

export function resolveDomainSeries(
  snapshot: Snapshot,
  domain: TrendDomain,
  zones: readonly SubstrateZoneBinding[] = []
): DomainSeriesSpec[] {
  if (domain === 'water') {
    return metricSpecs(snapshot, resolveWaterDevice(snapshot), 'Water ');
  }
  if (domain === 'climate') {
    return metricSpecs(snapshot, resolveClimateDevice(snapshot));
  }
  if (domain === 'air-quality') {
    // The particulate/gas monitor's firmware-declared metrics (role:metric) —
    // same rule as its readout card, so the tab and card stay in sync.
    return metricSpecs(snapshot, resolveAirQualityDevice(snapshot));
  }
  if (domain === 'thermal') {
    // Scope to the thermal device (like water/climate) so a second rig publishing
    // mlx90640_* entities can't collide on `key` (objectId) and drop a series.
    const dev = resolveThermalDevice(snapshot);
    if (!dev) return [];
    return snapshot.entities
      .filter((e) => e.nodeId === dev.nodeId && isThermalArrayTemp(e))
      .map((e) => ({
        key: e.objectId ?? e.id,
        label: thermalLabel(e.objectId ?? ''),
        unit: e.unit ?? '°C',
        node: e.nodeId ?? '',
        entity: e.objectId ?? ''
      }))
      .filter((s) => s.node && s.entity);
  }
  if (domain === 'substrate') {
    return substrateSpecs(snapshot, zones);
  }
  return [];
}

/**
 * Turn queried points into the series the client charts.
 *
 * Every domain but substrate is a pass-through — its specs already name what to plot.
 * Substrate derives, because what a grower reads (water content, pore EC) is computed
 * from what the sensor stores (counts, temperature, bulk EC).
 */
export function assembleDomainSeries(
  snapshot: Snapshot,
  domain: TrendDomain,
  specs: DomainSeriesSpec[],
  pointsByKey: Map<string, TrendPoint[]>,
  zones: readonly SubstrateZoneBinding[] = []
): TrendSeries[] {
  if (domain !== 'substrate') {
    return specs.map((s) => ({ key: s.key, label: s.label, unit: s.unit, points: pointsByKey.get(s.key) ?? [] }));
  }

  const probes = resolveSubstrateProbes(snapshot, zones);
  // With one probe the readings need no qualifier; with several, each series says whose
  // pot it is. Prefix rather than suffix so the legend's probe names line up.
  const qualify = (label: string, probeLabel: string) => (probes.length > 1 ? `${probeLabel} ${label}` : label);

  const series: TrendSeries[] = [];
  for (const probe of probes) {
    const curve = substrateCurveFor(probe.substrateType);
    const counts = pointsByKey.get(`${probe.nodeId}:${SUBSTRATE_COUNTS}`) ?? [];
    if (counts.length === 0) continue;
    const probeLabel = probeTabLabel(probe);

    // Water content is a pointwise function of counts alone, so it charts wherever the
    // sensor recorded — no join, no dropped buckets.
    series.push({
      key: `${probe.nodeId}:vwc`,
      label: qualify('VWC', probeLabel),
      unit: '%',
      points: counts.flatMap((p) => {
        const vwc = deriveReadings({ counts: p.v, temperatureC: null, bulkEc: null }, curve).vwc;
        return vwc === null ? [] : [{ t: p.t, v: vwc * 100 }];
      })
    });

    // Pore EC needs all three readings at the same instant. They ride one Influx query
    // on a shared aggregate window, so timestamps line up — but `createEmpty: false`
    // means any of them can miss a bucket, and a bucket without all three is dropped
    // rather than filled from a neighbour.
    const temps = new Map((pointsByKey.get(`${probe.nodeId}:${SUBSTRATE_TEMPERATURE}`) ?? []).map((p) => [p.t, p.v]));
    const bulk = new Map((pointsByKey.get(`${probe.nodeId}:${SUBSTRATE_BULK_EC}`) ?? []).map((p) => [p.t, p.v]));
    const poreEc = counts.flatMap((p) => {
      const temperatureC = temps.get(p.t);
      const bulkEc = bulk.get(p.t);
      if (temperatureC === undefined || bulkEc === undefined) return [];
      const derived = deriveReadings({ counts: p.v, temperatureC, bulkEc }, curve).poreEc;
      return derived === null ? [] : [{ t: p.t, v: derived }];
    });
    if (poreEc.length > 0) {
      series.push({ key: `${probe.nodeId}:pwec`, label: qualify('pwEC', probeLabel), unit: 'mS/cm', points: poreEc });
    }
  }
  return series;
}
