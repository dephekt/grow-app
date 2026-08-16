// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { getSiteMqttService } from '$lib/server/mqtt/service';
import type { EntityConfig, SnapshotEvent } from '$lib/server/mqtt/types';
import { RUNOFF_NODE, RUNOFF_DRAW_MIN_W } from '$lib/irrigation/model';
import { getIrrigationDb } from './db';
import { recordRunoffEvent } from './events';

/** Keyed off measured power, not the firmware binary sensor, which trips above ~20 W and missed
 *  real lower-power runs in the field. */
const RUNOFF_POWER_OBJECT_ID = 'runoff_pump_power';

/** Sustained idle that re-arms the detector; set well above the plug's ~10 s report cadence. */
const RUNOFF_REARM_IDLE_MS = 30_000;

/** Mirrors model.resolveEntity's node match without needing a full snapshot. */
function isRunoffPowerEntity(entity: EntityConfig): boolean {
  return (
    (entity.nodeId ?? entity.device.identifiers[0]) === RUNOFF_NODE &&
    entity.objectId === RUNOFF_POWER_OBJECT_ID
  );
}

/**
 * Rising-edge detector for the runoff pump, recording a run on the idle→drawing transition.
 */
export class RunoffRunTracker {
  private armed = false;
  private lastAboveMs: number | null = null;

  constructor(
    private readonly floorW = RUNOFF_DRAW_MIN_W,
    private readonly rearmIdleMs = RUNOFF_REARM_IDLE_MS
  ) {}

  /** Feed a raw power reading (W); returns the started run on a rising edge, else null. */
  note(watts: number, nowMs: number): { startedAtMs: number } | null {
    if (Number.isFinite(watts) && watts >= this.floorW) {
      this.lastAboveMs = nowMs;
      if (this.armed) {
        this.armed = false;
        return { startedAtMs: nowMs };
      }
      return null;
    }
    // Below the floor: arm once the pump has been idle long enough that any prior run has ended.
    // `lastAboveMs === null` is the startup case — the first idle sample arms with no wait.
    if (
      !this.armed &&
      (this.lastAboveMs === null || nowMs - this.lastAboveMs >= this.rearmIdleMs)
    ) {
      this.armed = true;
    }
    return null;
  }
}

/** Persist runoff-pump runs on each debounced rising edge; a no-op if the plug is never found. */
export function startRunoffMonitor(): void {
  const service = getSiteMqttService();
  const tracker = new RunoffRunTracker();
  // Resolved from 'entity'/'snapshot' discovery events — never by rebuilding the full snapshot()
  // on the per-message state path.
  let runoffEntityId: string | null = null;

  const remember = (entity: EntityConfig): void => {
    runoffEntityId = entity.id;
  };

  service.subscribe((event: SnapshotEvent) => {
    if (runoffEntityId === null) {
      if (event.type === 'entity' && event.entity && isRunoffPowerEntity(event.entity)) {
        remember(event.entity);
      } else if (event.type === 'snapshot' && event.snapshot) {
        const entity = event.snapshot.entities.find(isRunoffPowerEntity);
        if (entity) remember(entity);
      }
    }

    if (event.type !== 'state' || !event.entityId || !event.state) return;
    if (runoffEntityId === null || event.entityId !== runoffEntityId) return;

    const run = tracker.note(Number(event.state.value), Date.now());
    if (!run) return;
    try {
      recordRunoffEvent(getIrrigationDb(), { startedAt: new Date(run.startedAtMs).toISOString() });
    } catch (error) {
      console.error('[runoff] recording runoff event failed', error);
    }
  });
}
