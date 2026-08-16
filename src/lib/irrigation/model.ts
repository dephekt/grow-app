// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { resolveEntityRef, type EntityRef } from '$lib/entity-match';
import type { EntityConfig, Snapshot } from '$lib/server/mqtt/types';

/**
 * Pure client-side model for the irrigation card (grow-app #23); the server types are
 * imported type-only to keep it client-safe.
 */

export type { EntityRef };

/** The plugs' nodeIds, NOT necessarily `device.identifiers[0]`: these ESPHome plugs omit device
 *  `ids` in discovery, so match snapshot devices on `nodeId`. */
export const IRRIGATION_NODE = 'irrigation-pump';
export const RUNOFF_NODE = 'runoff-monitor';

/** Above the base package's 3 W standby suppression → the pump is genuinely drawing. */
export const PUMP_DRAW_MIN_W = 5;

/** Ceiling on a zone's run clamp: the pump plug latches its own supply off after a 12 min
 *  dry-run session, so a legitimate run has to finish well inside that or it trips the cutout
 *  and needs a physical rearm (grow-fleet devices/irrigation-pump.yaml, `dry_run_timeout`). */
export const MAX_RUN_SECONDS_CEILING = 600;

/** The runoff pump draws ~20-30 W when running vs ~0-3 W standby, so this floor sits well clear
 *  of both standby and small power-meter glitches. */
export const RUNOFF_DRAW_MIN_W = 10;

/** Resolve a (node, objectId) ref to its discovered entity. Kept as a named export for the
 *  irrigation call sites; the implementation is shared with lights and plugs. */
export const resolveEntity = resolveEntityRef;

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
  return (
    snapshot.devices.find((device) => device.id === 'opensprinkler')?.availability ?? 'unknown'
  );
}

/** True when any OpenSprinkler station is energized (a valve is open). */
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

/** The runoff bilge pump is running, derived from measured power draw and NOT the firmware
 *  `runoff_pump_running` binary sensor, which only trips above ~20 W and misses lower runs. */
export function runoffRunning(snapshot: Snapshot): boolean {
  const watts = numericValue(snapshot, { node: RUNOFF_NODE, objectId: 'runoff_pump_power' });
  return watts !== null && watts >= RUNOFF_DRAW_MIN_W;
}
