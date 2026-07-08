import type { EntityConfig, EntityState } from '$lib/server/mqtt/types';

export type AlertStatus = 'OK' | 'ALERT' | 'ARMED' | 'HIGH' | 'LOW' | 'UNKNOWN';

/** The slice of a threshold rule that status derivation needs: committed
 *  threshold numbers, paired alert binary_sensors, and the live sensor. */
export interface AlertRuleEntities {
  lowEntity: EntityConfig | null;
  highEntity: EntityConfig | null;
  lowAlertEntity: EntityConfig | null;
  highAlertEntity: EntityConfig | null;
  genericAlertEntity: EntityConfig | null;
  liveEntity: EntityConfig | null;
}

/** On/off tests honour the entity's discovery payloads (payload_on/payload_off,
 *  default ON/OFF). The bare 'true'/'false' forms are accepted only alongside
 *  the defaults, so a custom-payload sensor (e.g. 'alarm'/'clear') is never
 *  misread through the generic strings. */
export function isOn(entity: EntityConfig | null, value: string | null | undefined): boolean {
  if (value == null) return false;
  const on = entity?.payloadOn ?? 'ON';
  return value === on || (on === 'ON' && value === 'true');
}

export function isOff(entity: EntityConfig | null, value: string | null | undefined): boolean {
  if (value == null) return false;
  const off = entity?.payloadOff ?? 'OFF';
  return value === off || (off === 'OFF' && value === 'false');
}

function alertValue(entity: EntityConfig | null, states: Record<string, EntityState>): string | null | undefined {
  if (!entity) return undefined;
  return states[entity.id]?.value;
}

export function numericStateValue(entity: EntityConfig | null, states: Record<string, EntityState>): number | null {
  if (!entity) return null;
  const value = states[entity.id]?.value;
  // trim() also rejects whitespace-only payloads, which Number() coerces to 0.
  if (value == null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Status derived purely from the live reading vs the device's thresholds.
 *  Used when there's no alert sensor, or to recover HIGH/LOW direction from a
 *  single combined alert. Uses committed threshold values, not optimistic ones.
 *  OK requires at least one resolved threshold to compare against — a live
 *  number with no thresholds is not evidence that anything is fine. */
export function statusFromLive(
  rule: AlertRuleEntities,
  states: Record<string, EntityState>
): 'OK' | 'HIGH' | 'LOW' | 'UNKNOWN' {
  const liveVal = numericStateValue(rule.liveEntity, states);
  if (liveVal == null) return 'UNKNOWN';
  const high = numericStateValue(rule.highEntity, states);
  const low = numericStateValue(rule.lowEntity, states);
  if (high != null && liveVal >= high) return 'HIGH';
  if (low != null && liveVal <= low) return 'LOW';
  return high != null || low != null ? 'OK' : 'UNKNOWN';
}

export function alertStatus(rule: AlertRuleEntities, states: Record<string, EntityState>): AlertStatus {
  const highValue = alertValue(rule.highAlertEntity, states);
  const lowValue = alertValue(rule.lowAlertEntity, states);
  const genericValue = alertValue(rule.genericAlertEntity, states);

  const highKnown = highValue != null && highValue !== '';
  const lowKnown = lowValue != null && lowValue !== '';
  const genericKnown = genericValue != null && genericValue !== '';
  const hasAlertEntity = Boolean(rule.highAlertEntity || rule.lowAlertEntity || rule.genericAlertEntity);

  if (isOn(rule.highAlertEntity, highValue) && isOn(rule.lowAlertEntity, lowValue)) return 'ALERT';
  if (isOn(rule.highAlertEntity, highValue)) return 'HIGH';
  if (isOn(rule.lowAlertEntity, lowValue)) return 'LOW';
  if (isOn(rule.genericAlertEntity, genericValue)) {
    // A single combined alert is on but carries no direction; recover HIGH/LOW
    // from the live value vs thresholds, else fall back to ARMED.
    const byLive = statusFromLive(rule, states);
    return byLive === 'HIGH' || byLive === 'LOW' ? byLive : 'ARMED';
  }

  // No alert sensor at all → reflect the live reading vs thresholds.
  if (!hasAlertEntity) return statusFromLive(rule, states);

  // Every alert sensor is now silent (never reported a state), explicitly off,
  // or indeterminate (a payload that is neither on nor off, e.g. 'unavailable').
  // Combine that evidence with the live reading vs the committed thresholds:
  // the device's own alarm wins over a threshold comparison that can be
  // desynced (hysteresis, lag, stale committed values), so a direction whose
  // sensor reports off is never alerted from live; live OK only confirms OK
  // when no reporting sensor is indeterminate — otherwise the device's alarm
  // state is unknowable; and without a usable live reading, all reporting
  // sensors off ⇒ OK, anything else ⇒ UNKNOWN.
  const highOff = isOff(rule.highAlertEntity, highValue);
  const lowOff = isOff(rule.lowAlertEntity, lowValue);
  const genericOff = isOff(rule.genericAlertEntity, genericValue);
  const anyPresent = highKnown || lowKnown || genericKnown;
  const allPresentOff = (!highKnown || highOff) && (!lowKnown || lowOff) && (!genericKnown || genericOff);

  const liveStatus = statusFromLive(rule, states);
  if (liveStatus === 'HIGH' && !highOff && !genericOff) return 'HIGH';
  if (liveStatus === 'LOW' && !lowOff && !genericOff) return 'LOW';
  if (liveStatus === 'OK' && allPresentOff) return 'OK';
  return anyPresent && allPresentOff ? 'OK' : 'UNKNOWN';
}
