import type { EntityConfig, Snapshot } from '$lib/server/mqtt/types';

/** Token name the dashboard chart maps to a stroke colour. */
export type TrendColor = 'amber' | 'cyan' | 'muted';

export interface TrendSeriesDef {
  key: string;
  label: string;
  color: TrendColor;
  /** Recognise the entity that backs this series in a discovered snapshot. */
  match: (entity: EntityConfig) => boolean;
}

export interface ResolvedTrendSeries {
  key: string;
  label: string;
  color: TrendColor;
  node: string;
  entity: string;
}

function isNumericSensor(entity: EntityConfig): boolean {
  return entity.component === 'sensor' && entity.entityCategory !== 'diagnostic';
}

/**
 * Curated dashboard trend series. Resolved against real discovery — a site that
 * lacks a given probe simply omits that line rather than inventing data.
 */
export const TREND_SERIES: TrendSeriesDef[] = [
  {
    key: 'ph',
    label: 'pH',
    color: 'amber',
    match: (e) => isNumericSensor(e) && (e.deviceClass === 'ph' || e.objectId === 'water_ph' || e.unit === 'pH')
  },
  {
    key: 'air_temp',
    label: 'Air °C',
    color: 'cyan',
    // Ambient temperature: deviceClass is often unset on ESPHome sensors, so fall
    // back to unit/name. Exclude the water probe, which is its own reading.
    match: (e) =>
      isNumericSensor(e) &&
      (e.deviceClass === 'temperature' || e.unit === '°C' || /temp/i.test(e.objectId ?? '')) &&
      !/water/i.test(e.objectId ?? '') &&
      !/water/i.test(e.name)
  },
  {
    key: 'co2',
    label: 'CO₂',
    color: 'muted',
    match: (e) =>
      isNumericSensor(e) &&
      (e.deviceClass === 'carbon_dioxide' ||
        /(^|_)co2(_|$)/i.test(e.objectId ?? '') ||
        /co2|carbon diox/i.test(e.name))
  }
];

export function resolveTrendSeries(snapshot: Snapshot): ResolvedTrendSeries[] {
  const resolved: ResolvedTrendSeries[] = [];
  for (const def of TREND_SERIES) {
    const entity = snapshot.entities.find((e) => def.match(e));
    if (!entity?.nodeId || !entity.objectId) continue;
    resolved.push({ key: def.key, label: def.label, color: def.color, node: entity.nodeId, entity: entity.objectId });
  }
  return resolved;
}
