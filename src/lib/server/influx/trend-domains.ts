import { dashboardPresentation } from '$lib/device-presentation';
import { isCo2, isNumericSensor, isWaterPh } from '$lib/entity-match';
import type { DeviceSnapshot, EntityConfig, Snapshot } from '$lib/server/mqtt/types';

/**
 * Trend domains keep like with like — plotting pH against air CO₂ is meaningless,
 * so each domain charts only its own device's readings. Water/Climate come from the
 * device's firmware-declared dashboard metrics; Thermal is the MLX90640 array temps.
 */
export type TrendDomain = 'water' | 'climate' | 'thermal' | 'substrate';

export const TREND_DOMAINS: Array<{ key: TrendDomain; label: string }> = [
  { key: 'water', label: 'Water' },
  { key: 'climate', label: 'Climate' },
  { key: 'thermal', label: 'Thermal' },
  { key: 'substrate', label: 'Substrate' }
];

export const DEFAULT_TREND_DOMAIN: TrendDomain = 'water';

export function isTrendDomain(value: string | null | undefined): value is TrendDomain {
  return TREND_DOMAINS.some((d) => d.key === value);
}

export interface DomainSeriesSpec {
  /** Unique series id (the entity objectId) — also the Influx `entity` tag. */
  key: string;
  label: string;
  unit: string;
  node: string;
  entity: string;
}

function deviceOwning(snapshot: Snapshot, pred: (e: EntityConfig) => boolean): DeviceSnapshot | undefined {
  const e = snapshot.entities.find(pred);
  return e?.nodeId ? snapshot.devices.find((d) => d.nodeId === e.nodeId) : undefined;
}

function metricSpecs(snapshot: Snapshot, device: DeviceSnapshot | undefined, stripPrefix = ''): DomainSeriesSpec[] {
  if (!device) return [];
  return dashboardPresentation(snapshot, device)
    .metrics.map((m) => {
      const label = stripPrefix && m.label.startsWith(stripPrefix) ? m.label.slice(stripPrefix.length) : m.label;
      return {
        key: m.entity.objectId ?? m.entity.id,
        label,
        unit: m.entity.unit ?? '',
        node: m.entity.nodeId ?? '',
        entity: m.entity.objectId ?? ''
      };
    })
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
    return metricSpecs(snapshot, deviceOwning(snapshot, isWaterPh), 'Water ');
  }
  if (domain === 'climate') {
    const dev = deviceOwning(
      snapshot,
      (e) => isCo2(e) || (e.component === 'sensor' && e.deviceClass === 'humidity')
    );
    return metricSpecs(snapshot, dev);
  }
  if (domain === 'thermal') {
    return snapshot.entities
      .filter((e) => isNumericSensor(e) && /mlx90640_(min|mean|max)_temp$/.test(e.objectId ?? ''))
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
