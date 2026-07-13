import type { EntityConfig, Snapshot } from '$lib/server/mqtt/types';

/**
 * Pure client-side model for the irrigation card (grow-app #23). Resolves the two
 * always-on monitor plugs' entities and reports live pump draw + OpenSprinkler status
 * for the monitoring card. Type-only import from the server types keeps this
 * client-safe (mirrors entity-match.ts).
 */

/** A (node, objectId) reference. Strict pairing is required: the two pump plugs publish
 *  colliding objectIds (`voltage`, `current`, `total_daily_energy`), so objectId alone
 *  is ambiguous. */
export interface EntityRef {
  node: string;
  objectId: string;
}

/** The plugs' nodeIds (== entity.nodeId). NOT necessarily == device.identifiers[0]: these ESPHome
 *  plugs omit device `ids` in discovery, so match snapshot devices on `nodeId`, not `id`. */
export const IRRIGATION_NODE = 'irrigation-pump';
export const RUNOFF_NODE = 'runoff-monitor';

/** Above the base package's 3 W standby suppression → the pump is genuinely drawing.
 *  Drives the irrigation-pump row's running/idle state. */
export const PUMP_DRAW_MIN_W = 5;

/** The runoff pump draws ~20-30 W when running vs ~0-3 W standby, so this floor (double the
 *  irrigation floor) sits well clear of both standby and small power-meter glitches. Used by
 *  both the live runoff indicator and the history monitor's rising-edge detection. */
export const RUNOFF_DRAW_MIN_W = 10;

/** Resolve a (node, objectId) ref to its discovered entity. Node is matched against the
 *  entity's own node (its `nodeId`, or the device's primary identifier as a fallback) —
 *  mirrors lights/model.entityByRef. */
export function resolveEntity(snapshot: Snapshot, ref: EntityRef): EntityConfig | undefined {
  return snapshot.entities.find(
    (entity) => entity.objectId === ref.objectId && (entity.nodeId ?? entity.device.identifiers[0]) === ref.node
  );
}

/** Raw live value for a resolved entity, or null. */
export function rawValue(snapshot: Snapshot, entity: EntityConfig | undefined): string | null {
  if (!entity) return null;
  return snapshot.states[entity.id]?.value ?? null;
}

/** Numeric live value for a (node, objectId) ref, or null if absent / non-numeric. */
export function numericValue(snapshot: Snapshot, ref: EntityRef): number | null {
  const value = rawValue(snapshot, resolveEntity(snapshot, ref));
  if (value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Availability of the in-app OpenSprinkler driver (its synthesized device's LWT):
 *  `unknown` when no station has been discovered yet (no zones configured). */
export function openSprinklerAvailability(snapshot: Snapshot): 'online' | 'offline' | 'unknown' {
  return snapshot.devices.find((device) => device.id === 'opensprinkler')?.availability ?? 'unknown';
}

/** True when any OpenSprinkler station is energized (a valve is open). Drives the
 *  card's "watering" status label. */
export function anyStationRunning(snapshot: Snapshot): boolean {
  return snapshot.entities.some(
    (entity) =>
      entity.component === 'binary_sensor' &&
      entity.device.identifiers[0] === 'opensprinkler' &&
      /^opensprinkler_station_\d+$/.test(entity.id) &&
      (snapshot.states[entity.id]?.value ?? null) === (entity.payloadOn ?? 'ON')
  );
}

/** The irrigation pump is drawing power (self-cycling on its pressure switch). */
export function irrigationDrawing(snapshot: Snapshot): boolean {
  const watts = numericValue(snapshot, { node: IRRIGATION_NODE, objectId: 'pump_power' });
  return watts !== null && watts >= PUMP_DRAW_MIN_W;
}

/** The runoff bilge pump is running. Derived from measured power draw (like the irrigation
 *  pump), NOT the firmware `runoff_pump_running` binary sensor: that sensor proved unreliable
 *  in the field — it only trips above ~20 W, so it missed lower-power runs entirely (a ~20 W
 *  run drew power and was audibly running, yet the sensor never reported ON), leaving both
 *  this live indicator and the history monitor dark. The plug's power meter caught every run,
 *  so we key off that instead. */
export function runoffRunning(snapshot: Snapshot): boolean {
  const watts = numericValue(snapshot, { node: RUNOFF_NODE, objectId: 'runoff_pump_power' });
  return watts !== null && watts >= RUNOFF_DRAW_MIN_W;
}
