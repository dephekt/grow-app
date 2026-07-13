import { getSiteMqttService } from '$lib/server/mqtt/service';
import type { EntityConfig, SnapshotEvent } from '$lib/server/mqtt/types';
import { RUNOFF_NODE, RUNOFF_DRAW_MIN_W } from '$lib/irrigation/model';
import { getIrrigationDb } from './db';
import { recordRunoffEvent } from './events';

/** The runoff plug's power meter (W). "Running" is keyed off measured power, not the firmware
 *  `runoff_pump_running` binary sensor: that sensor only trips above ~20 W and missed real,
 *  lower-power runs in the field (see model.runoffRunning), so the history monitor keyed off it
 *  went dark. The power meter caught every run. */
const RUNOFF_POWER_OBJECT_ID = 'runoff_pump_power';

/** Sustained idle (below the draw floor) for this long re-arms the detector for the next run.
 *  Chosen well above the plug's power-report cadence (~10 s): a lone spurious low/zero sample
 *  mid-run stays inside this window, so it neither ends a run early nor lets the next sample
 *  re-fire a duplicate row — the failure mode of a naive per-sample edge. Two genuinely separate
 *  bursts closer together than this merge into one "runoff episode", which is fine for history. */
const RUNOFF_REARM_IDLE_MS = 30_000;

/** Does this discovered entity represent the runoff pump's power meter? Mirrors
 *  model.resolveEntity's node match without needing a full snapshot. */
function isRunoffPowerEntity(entity: EntityConfig): boolean {
  return (entity.nodeId ?? entity.device.identifiers[0]) === RUNOFF_NODE && entity.objectId === RUNOFF_POWER_OBJECT_ID;
}

/**
 * Rising-edge detector for the runoff pump, driven by raw power samples. Runoff runs are short
 * bursts (~15 s, often just one or two power samples at the plug's ~10 s cadence), so a run is
 * recorded on the idle→drawing transition.
 *
 * Critically, the detector **starts disarmed and only arms after observing the pump idle** (a
 * below-floor sample) — sustained for RUNOFF_REARM_IDLE_MS since the last draw, so a lone
 * sub-floor dip mid-run doesn't count. A run is therefore recorded only after we've actually seen
 * the pump idle since the previous one. Two consequences fall out of that one rule:
 *   - A continuous run whose above-floor samples arrive far apart (sparse or dropped reports) is
 *     never split into duplicates: with no intervening idle sample, the detector never re-arms.
 *   - A run already in progress when the monitor starts (e.g. across a web-app restart, and almost
 *     certainly already logged before it) is not recorded again: we never saw it start from idle.
 * The tradeoff is a run that is already drawing when the plug (re)connects, with no idle sample
 * ever observed, is missed — acceptable loss for a best-effort feed, and preferable to a spurious
 * insert. The elevated floor (RUNOFF_DRAW_MIN_W) rejects standby noise and small meter glitches.
 * A burst is often a single sample, so duration can't be measured and a run carries only its start.
 * Extracted for unit testing.
 */
export class RunoffRunTracker {
  private armed = false;
  private lastAboveMs: number | null = null;

  constructor(
    private readonly floorW = RUNOFF_DRAW_MIN_W,
    private readonly rearmIdleMs = RUNOFF_REARM_IDLE_MS
  ) {}

  /** Feed a raw power reading (W). Returns the started run on a rising edge (only while armed),
   *  else null. */
  note(watts: number, nowMs: number): { startedAtMs: number } | null {
    if (Number.isFinite(watts) && watts >= this.floorW) {
      this.lastAboveMs = nowMs;
      if (this.armed) {
        this.armed = false;
        return { startedAtMs: nowMs };
      }
      return null;
    }
    // Below the floor: arm once the pump has been idle long enough to be sure any prior run has
    // ended (a lone sub-floor dip mid-run stays inside the window and does not arm). `lastAboveMs
    // === null` is the startup case — the first idle sample arms us with no wait.
    if (!this.armed && (this.lastAboveMs === null || nowMs - this.lastAboveMs >= this.rearmIdleMs)) {
      this.armed = true;
    }
    return null;
  }
}

/**
 * Persist runoff-pump runs at server start (web app only — never the read-only recorder).
 * Subscribes to the MQTT service and records a 'runoff' event on each debounced rising edge of
 * the runoff pump's measured power. Independent of OpenSprinkler: if the runoff plug is never
 * discovered, this is a no-op.
 */
export function startRunoffMonitor(): void {
  const service = getSiteMqttService();
  const tracker = new RunoffRunTracker();
  // Cached once the runoff power meter is discovered. Resolved from cheap 'entity'/'snapshot'
  // discovery events — never by rebuilding the full snapshot() on the per-message state path
  // (which, on a site without the runoff plug, would run on every sensor update forever).
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
