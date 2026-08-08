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
  PORE_EC_OFFSETS,
  SUBSTRATE_BULK_EC,
  SUBSTRATE_COUNTS,
  SUBSTRATE_TEMPERATURE,
  deriveReadings,
  resolveSubstrateProbes,
  substrateCurveFor,
  type SubstrateProbeBinding,
  type SubstrateZoneBinding
} from '$lib/substrate';
import type { DeviceSnapshot, Snapshot } from '$lib/server/mqtt/types';

export { DEFAULT_TREND_DOMAIN, isTrendDomain } from '$lib/trends';
export type { TrendDomain } from '$lib/trends';

/** Resolves a trend domain to the (node, entity) series to query, each scoped to its own device. */

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

/** The raw series to query; `assembleDomainSeries` derives from them, and keys carry the node id
 *  because every probe publishes the same object ids. */
function substrateSpecs(
  snapshot: Snapshot,
  zones: readonly SubstrateZoneBinding[],
  probeBindings: readonly SubstrateProbeBinding[]
): DomainSeriesSpec[] {
  const specs: DomainSeriesSpec[] = [];
  for (const probe of resolveSubstrateProbes(snapshot, zones, probeBindings)) {
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
  zones: readonly SubstrateZoneBinding[] = [],
  probeBindings: readonly SubstrateProbeBinding[] = []
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
    return substrateSpecs(snapshot, zones, probeBindings);
  }
  return [];
}

/** The value at `t` is the last one recorded at or before it, reading backwards before the first. */
function stepSeries(points: readonly TrendPoint[]): (t: string) => number | null {
  if (points.length === 0) return () => null;
  const sorted = [...points].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const times = sorted.map((p) => Date.parse(p.t));
  return (t: string) => {
    const at = Date.parse(t);
    // Binary search for the last point at or before `at`.
    let lo = 0;
    let hi = times.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= at) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return sorted[found === -1 ? 0 : found].v;
  };
}

/** Turn queried points into charted series; every domain but substrate passes straight through. */
export function assembleDomainSeries(
  snapshot: Snapshot,
  domain: TrendDomain,
  specs: DomainSeriesSpec[],
  pointsByKey: Map<string, TrendPoint[]>,
  zones: readonly SubstrateZoneBinding[] = [],
  probeBindings: readonly SubstrateProbeBinding[] = []
): TrendSeries[] {
  if (domain !== 'substrate') {
    return specs.map((s) => ({ key: s.key, label: s.label, unit: s.unit, points: pointsByKey.get(s.key) ?? [] }));
  }

  const probes = resolveSubstrateProbes(snapshot, zones, probeBindings);
  // With one probe the readings need no qualifier; with several, each series says whose
  // pot it is. Prefix rather than suffix so the legend's probe names line up.
  const qualify = (label: string, probeLabel: string) => (probes.length > 1 ? `${probeLabel} ${label}` : label);

  const series: TrendSeries[] = [];
  for (const probe of probes) {
    const curve = substrateCurveFor(probe.substrateType);
    const counts = pointsByKey.get(`${probe.nodeId}:${SUBSTRATE_COUNTS}`) ?? [];
    if (counts.length === 0) continue;
    const probeLabel = probe.label;

    // Water content is a pointwise function of counts alone, so it charts wherever the
    // sensor recorded — no join, no dropped buckets.
    const vwc = counts.flatMap((p) => {
      const derived = deriveReadings({ counts: p.v, temperatureC: null, bulkEc: null }, curve).vwc;
      return derived === null ? [] : [{ t: p.t, v: derived * 100 }];
    });
    // Every count can be rejected as out of range, and an empty series is a legend entry
    // with no line behind it.
    if (vwc.length > 0) {
      series.push({ key: `${probe.nodeId}:vwc`, label: qualify('VWC', probeLabel), unit: '%', points: vwc });
    }

    // The publisher skips unchanged writes, so these three record at wildly different
    // cadences and an equal-timestamp join would intersect to almost nothing.
    const temps = stepSeries(pointsByKey.get(`${probe.nodeId}:${SUBSTRATE_TEMPERATURE}`) ?? []);
    const bulk = stepSeries(pointsByKey.get(`${probe.nodeId}:${SUBSTRATE_BULK_EC}`) ?? []);
    const derived = counts.flatMap((p) => {
      const temperatureC = temps(p.t);
      const bulkEc = bulk(p.t);
      if (temperatureC === null || bulkEc === null) return [];
      return [{ t: p.t, readings: deriveReadings({ counts: p.v, temperatureC, bulkEc }, curve) }];
    });

    const poreEcKey = `${probe.nodeId}:pwec`;
    const poreEc = derived.flatMap((d) => (d.readings.poreEc === null ? [] : [{ t: d.t, v: d.readings.poreEc }]));
    if (poreEc.length > 0) {
      series.push({ key: poreEcKey, label: qualify('pwEC', probeLabel), unit: 'mS/cm', points: poreEc });
    }

    // Emitted whether or not the comparison is switched on, so flipping it is a client-side
    // filter rather than a refetch.
    const poreEcCoir = derived.flatMap((d) =>
      d.readings.poreEcCoir === null ? [] : [{ t: d.t, v: d.readings.poreEcCoir }]
    );
    if (poreEcCoir.length > 0) {
      series.push({
        key: `${probe.nodeId}:pwec-coir`,
        label: qualify(`pwEC ${PORE_EC_OFFSETS.coir.label}`, probeLabel),
        unit: 'mS/cm',
        points: poreEcCoir,
        compareOf: poreEcKey
      });
    }

    // Charted from the same step-carried readers pwEC derives from, so a temperature that
    // recorded four points in three hours still draws a staircase rather than nothing.
    const temperature = counts.flatMap((p) => {
      const v = temps(p.t);
      return v === null ? [] : [{ t: p.t, v }];
    });
    if (temperature.length > 0) {
      series.push({
        key: `${probe.nodeId}:temperature`,
        label: qualify('Temp', probeLabel),
        unit: '°C',
        points: temperature
      });
    }

    // The input behind pwEC, off until the legend asks for it.
    const bulkEc = counts.flatMap((p) => {
      const v = bulk(p.t);
      return v === null ? [] : [{ t: p.t, v }];
    });
    if (bulkEc.length > 0) {
      series.push({
        key: `${probe.nodeId}:bulk-ec`,
        label: qualify('Bulk EC', probeLabel),
        unit: 'mS/cm',
        points: bulkEc,
        hidden: true
      });
    }
  }
  return series;
}
