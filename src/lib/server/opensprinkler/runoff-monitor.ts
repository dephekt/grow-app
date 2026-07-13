import { getSiteMqttService } from '$lib/server/mqtt/service';
import type { EntityConfig, SnapshotEvent } from '$lib/server/mqtt/types';
import { RUNOFF_NODE } from '$lib/irrigation/model';
import { getIrrigationDb } from './db';
import { recordRunoffEvent } from './events';

/** The runoff pump's running binary sensor (its objectId under the RUNOFF_NODE plug). */
const RUNOFF_RUNNING_OBJECT_ID = 'runoff_pump_running';

/** Sub-2s ON→OFF blips are sensor flicker, never a real pump run — don't log them. */
const RUNOFF_MIN_SECONDS = 2;

/** Does this discovered entity represent the runoff pump's running sensor? Mirrors
 *  model.resolveEntity's node match without needing a full snapshot. */
function isRunoffRunningEntity(entity: EntityConfig): boolean {
  return (entity.nodeId ?? entity.device.identifiers[0]) === RUNOFF_NODE && entity.objectId === RUNOFF_RUNNING_OBJECT_ID;
}

/**
 * Pure ON→OFF edge detector for the runoff pump. The MQTT `state` event carries only the
 * new value (the service overwrites state without diffing), so the edge — and the run's
 * start time — must be remembered here. Extracted for unit testing.
 */
export class RunoffRunTracker {
  private startedAtMs: number | null = null;

  /** Feed a running/idle observation. Returns the completed run on the ON→OFF edge, else
   *  null. Repeated ON keeps the first start; OFF with no prior ON is a no-op. */
  note(running: boolean, nowMs: number): { startedAtMs: number; seconds: number } | null {
    if (running) {
      if (this.startedAtMs === null) this.startedAtMs = nowMs;
      return null;
    }
    if (this.startedAtMs === null) return null;
    const startedAtMs = this.startedAtMs;
    this.startedAtMs = null;
    return { startedAtMs, seconds: Math.round((nowMs - startedAtMs) / 1000) };
  }

  get running(): boolean {
    return this.startedAtMs !== null;
  }
}

/**
 * Persist runoff-pump runs at server start (web app only — never the read-only recorder).
 * Subscribes to the MQTT service and records a 'runoff' event on each ON→OFF edge of the
 * runoff pump's `runoff_pump_running` binary sensor. Independent of OpenSprinkler: if the
 * runoff plug is never discovered, resolveEntity stays null and this is a no-op.
 */
export function startRunoffMonitor(): void {
  const service = getSiteMqttService();
  const tracker = new RunoffRunTracker();
  // Cached once the runoff sensor is discovered. Resolved from cheap 'entity'/'snapshot'
  // discovery events — never by rebuilding the full snapshot() on the per-message state
  // path (which, on a site without the runoff plug, would run on every sensor update
  // forever). Mirrors the recorder's "track entities from events" pattern.
  let runoffEntityId: string | null = null;
  let payloadOn = 'ON';

  const remember = (entity: EntityConfig): void => {
    runoffEntityId = entity.id;
    payloadOn = entity.payloadOn ?? 'ON';
  };

  service.subscribe((event: SnapshotEvent) => {
    if (runoffEntityId === null) {
      if (event.type === 'entity' && event.entity && isRunoffRunningEntity(event.entity)) {
        remember(event.entity);
      } else if (event.type === 'snapshot' && event.snapshot) {
        const entity = event.snapshot.entities.find(isRunoffRunningEntity);
        if (entity) remember(entity);
      }
    }

    if (event.type !== 'state' || !event.entityId || !event.state) return;
    if (runoffEntityId === null || event.entityId !== runoffEntityId) return;

    const run = tracker.note(event.state.value === payloadOn, Date.now());
    if (!run || run.seconds < RUNOFF_MIN_SECONDS) return;
    try {
      recordRunoffEvent(getIrrigationDb(), { startedAt: new Date(run.startedAtMs).toISOString(), seconds: run.seconds });
    } catch (error) {
      console.error('[runoff] recording runoff event failed', error);
    }
  });
}
