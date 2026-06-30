import type { EntityConfig } from '$lib/server/mqtt/types';

/**
 * Shared recognisers for alert *threshold* number entities and *alert* binary
 * sensors, plus the metric-prefix / high-low side extraction that pairs them.
 *
 * Unlike `entity-match.ts` (which keys live `sensor` entities off `deviceClass`),
 * threshold `number` and alert `binary_sensor` entities carry NO `deviceClass` in
 * discovery — only the live sensor does. So metric identity and the high/low side
 * here are unavoidably derived from `objectId`/`name`. This module is the single
 * home for that string matching, reused by `AlertsPanel.svelte` (the curated alerts
 * UI) and `device-settings/+page.svelte` (`isAlertsCurated`, which decides whether to
 * render that UI), so the two can't drift.
 */

function objectIdOf(entity: EntityConfig): string {
  return (entity.objectId ?? entity.id).toLowerCase();
}

/**
 * The metric key a threshold/alert entity belongs to, e.g.
 *   co2_high_threshold → co2 ;  co2_low_alert → co2 ;  vpd_high_limit → vpd
 * Strips a trailing high/low/min/max side and a trailing threshold/alert/limit kind.
 */
export function metricPrefix(entity: EntityConfig): string {
  return objectIdOf(entity)
    .replace(/_?(high|low|min|max)_?(threshold|alert|limit)?$/, '')
    .replace(/_?(threshold|alert|limit)$/, '')
    .replace(/_$/, '');
}

/**
 * Which side of the band an entity controls: 'high' (high/max) or 'low' (low/min),
 * or null for a single combined/generic alert. Looks at both objectId and name so a
 * sensor named "CO2 High Alert" with a generic objectId is still classified.
 */
export function entitySide(entity: EntityConfig): 'high' | 'low' | null {
  const objectId = objectIdOf(entity);
  const name = (entity.name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const value = `${objectId}_${name}`;

  if (/(^|_)(high|max)(_|$)/.test(value)) return 'high';
  if (/(^|_)(low|min)(_|$)/.test(value)) return 'low';
  return null;
}

/** A writable threshold `number` (e.g. `co2_high_threshold`, `temperature_low_limit`). */
export function isThresholdEntity(entity: EntityConfig): boolean {
  if (entity.component !== 'number') return false;
  const objectId = objectIdOf(entity);
  return objectId.includes('threshold') || /(^|_)(high|low|min|max|limit)(_|$)/.test(objectId);
}

/** An alert `binary_sensor` (e.g. `co2_high_alert`, "VPD Alert"). */
export function isAlertEntity(entity: EntityConfig): boolean {
  if (entity.component !== 'binary_sensor') return false;
  const objectId = objectIdOf(entity);
  const name = (entity.name ?? '').toLowerCase();
  return objectId.includes('alert') || name.includes('alert');
}
