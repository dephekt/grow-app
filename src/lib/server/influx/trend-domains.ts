import { presentedNumericMetrics } from '$lib/device-presentation';
import {
  isThermalArrayTemp,
  resolveAirQualityDevice,
  resolveClimateDevice,
  resolveThermalDevice,
  resolveWaterDevice
} from '$lib/entity-match';
import { type TrendDomain } from '$lib/trends';
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

export function resolveDomainSeries(snapshot: Snapshot, domain: TrendDomain): DomainSeriesSpec[] {
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
  // substrate — no probe deployed yet
  return [];
}
