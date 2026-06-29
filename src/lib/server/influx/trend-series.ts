import { isAmbientTemperature, isCo2, isWaterPh } from '$lib/entity-match';
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

/**
 * Curated dashboard trend series. Resolved against real discovery — a site that
 * lacks a given probe simply omits that line rather than inventing data. The
 * recognisers are shared with the dashboard panels via `$lib/entity-match`.
 */
export const TREND_SERIES: TrendSeriesDef[] = [
  { key: 'ph', label: 'pH', color: 'amber', match: isWaterPh },
  { key: 'air_temp', label: 'Air °C', color: 'cyan', match: isAmbientTemperature },
  { key: 'co2', label: 'CO₂', color: 'muted', match: isCo2 }
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
