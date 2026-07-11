import type { EntityConfig, Snapshot } from '$lib/server/mqtt/types';

/**
 * Pure client-side model for the irrigation card (grow-app #23). Resolves the two
 * always-on monitor plugs' entities and cross-checks the OpenSprinkler valves against
 * irrigation-pump draw for the failsafe. Type-only import from the server types keeps
 * this client-safe (mirrors entity-match.ts).
 */

/** A (node, objectId) reference. Strict pairing is required: the two pump plugs publish
 *  colliding objectIds (`voltage`, `current`, `total_daily_energy`), so objectId alone
 *  is ambiguous. */
export interface EntityRef {
  node: string;
  objectId: string;
}

/** The plugs' `_ui/config` nodeIds (== entity.nodeId == device.identifiers[0]). */
export const IRRIGATION_NODE = 'irrigation-pump';
export const RUNOFF_NODE = 'runoff-monitor';

/** Above the base package's 3 W standby suppression → the pump is genuinely drawing.
 *  Drives both the irrigation-pump row state and the failsafe "no flow" check. */
export const PUMP_DRAW_MIN_W = 5;

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

/** True when any OpenSprinkler station is energized (a valve is open). Coarse by
 *  necessity: the data model has no zone→pump link, so the failsafe checks "any station
 *  ON", not a specific zone. */
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

/** The runoff bilge pump is running, per its firmware binary sensor. */
export function runoffRunning(snapshot: Snapshot): boolean {
  const entity = resolveEntity(snapshot, { node: RUNOFF_NODE, objectId: 'runoff_pump_running' });
  if (!entity) return false;
  return (snapshot.states[entity.id]?.value ?? null) === (entity.payloadOn ?? 'ON');
}

export type FailsafeState = 'ok' | 'fault' | 'idle';

/**
 * Cross-check the OpenSprinkler valves against irrigation-pump draw:
 *  - `fault`: a zone is open but the pump reads below the draw threshold (no flow),
 *  - `ok`:    a zone is open and the pump is drawing (flow confirmed),
 *  - `idle`:  no zone open — nothing to verify.
 */
export function computeFailsafe(snapshot: Snapshot): FailsafeState {
  if (!anyStationRunning(snapshot)) return 'idle';
  return irrigationDrawing(snapshot) ? 'ok' : 'fault';
}
