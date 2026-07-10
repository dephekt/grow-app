import { getSiteMqttService } from './service';
import type { SnapshotEvent } from './types';
import { deviceDesiredTimeZone } from '$lib/server/settings/site-timezone';
import { posixTzFromIana, type PosixResult } from '$lib/server/tz/posix-tz';

/**
 * Reconcile the one site time zone onto every tz-capable device.
 *
 * IANA is the source of truth everywhere else; the POSIX form is derived here at the
 * publish boundary only (tz/posix-tz.ts) and never persisted or snapshotted. This module
 * owns the small amount of cross-pass state needed to avoid re-publishing on every entity
 * re-discovery, and exposes a pure `reconcileTimeZone()` so the branching logic is
 * testable without a live broker.
 */

export interface ReconcileReport {
  /** Entities we published the POSIX to this pass. */
  pushed: string[];
  /** Entities already carrying the desired POSIX — nothing to do. */
  inSync: string[];
  /** Entities skipped because we already attempted this exact POSIX (loop guard). */
  skipped: string[];
  /** Entities whose publish threw; bucketed, never rethrown. */
  failed: string[];
}

/** A tz-capable device entity plus its last-seen device value (the POSIX string the
 *  device currently reports), so the reconciler can decide push vs. in-sync. */
export interface ReconcileTzEntity {
  id: string;
  currentValue: string | null | undefined;
}

export interface ReconcileTimeZoneDeps {
  /** The intentional site zone (persisted or explicit env). `undefined` means "leave
   *  device entities untouched" — a host-inferred or UTC-degraded zone is never pushed. */
  desiredIana: string | undefined;
  entities: ReconcileTzEntity[];
  toPosix: (iana: string) => PosixResult;
  publish: (entityId: string, posix: string) => Promise<void>;
  /** entityId → the POSIX we last attempted to publish; the loop guard reads/writes it. */
  lastPublished: Map<string, string>;
  /** Invoked once when the zone can't be converted, so a bad zone is diagnosable
   *  without spamming the log on every pass (the caller dedupes across passes). */
  warn: (reason: string, iana: string) => void;
}

const emptyReport = (): ReconcileReport => ({ pushed: [], inSync: [], skipped: [], failed: [] });

/**
 * Pure per-pass reconciliation. Skip-all when there's no intentional zone or the zone
 * can't be converted (warn once). Otherwise, per entity: leave it alone if it already
 * reports the desired POSIX; skip it if we've already attempted this POSIX (so a bare
 * re-discovery doesn't re-publish); else publish once, bucketing a throw into `failed`.
 * Note "desired" past the conversion is the POSIX — that's what a device reports and
 * what we record as attempted.
 */
export async function reconcileTimeZone(deps: ReconcileTimeZoneDeps): Promise<ReconcileReport> {
  const report = emptyReport();
  if (deps.desiredIana === undefined) return report;

  const result = deps.toPosix(deps.desiredIana);
  if (!result.ok) {
    deps.warn(result.reason, deps.desiredIana);
    return report;
  }
  const desired = result.posix;

  for (const entity of deps.entities) {
    if (entity.currentValue === desired) {
      report.inSync.push(entity.id);
      continue;
    }
    if (deps.lastPublished.get(entity.id) === desired) {
      report.skipped.push(entity.id);
      continue;
    }
    // Record the attempt before awaiting so a failed publish still counts against the
    // loop guard: a persistent failure re-tries only when a reset clears the map.
    deps.lastPublished.set(entity.id, desired);
    try {
      await deps.publish(entity.id, desired);
      report.pushed.push(entity.id);
    } catch {
      report.failed.push(entity.id);
    }
  }

  return report;
}

// Cross-pass state. `lastPublished` guards against re-publishing on entity re-discovery;
// `lastWarnedIana` collapses the "can't convert this zone" warning to once per distinct
// zone. A reset (broker reconnect, or an explicit reconcile from the PUT) clears both so
// the site value is re-attempted and re-diagnosed from scratch.
const lastPublished = new Map<string, string>();
let lastWarnedIana: string | null = null;

function runReconcilePass({ resetAttempts }: { resetAttempts: boolean }): Promise<ReconcileReport> {
  if (resetAttempts) {
    lastPublished.clear();
    lastWarnedIana = null;
  }
  const service = getSiteMqttService();
  const entities: ReconcileTzEntity[] = service.timeZoneEntities().map((entity) => ({
    id: entity.id,
    currentValue: service.entityState(entity.id).value
  }));

  return reconcileTimeZone({
    desiredIana: deviceDesiredTimeZone(),
    entities,
    toPosix: posixTzFromIana,
    publish: (entityId, posix) => service.publishCommand(entityId, { value: posix }),
    lastPublished,
    warn: (reason, iana) => {
      if (lastWarnedIana === iana) return;
      lastWarnedIana = iana;
      console.warn(
        `[tz] cannot derive a POSIX TZ for site time zone "${iana}" (${reason}); leaving device time_zone entities untouched`
      );
    }
  });
}

/** Force a fresh reconcile of the current site zone (clears the loop guard). Called by
 *  the timezone PUT after persisting a new value so devices are re-stamped immediately. */
export function reconcileSiteTimezone(): Promise<ReconcileReport> {
  return runReconcilePass({ resetAttempts: true });
}

function isTimeZoneEntity(event: SnapshotEvent): boolean {
  const entity = event.entity;
  return (
    event.type === 'entity' &&
    entity !== undefined &&
    entity.component === 'text' &&
    entity.objectId === 'time_zone' &&
    Boolean(entity.commandTopic)
  );
}

/**
 * Wire the reconciler to broker/discovery events (web-app path only; never the recorder).
 * Reconnect resets the loop guard and re-pushes; a freshly discovered time_zone entity
 * triggers a no-reset pass so only the new node gets stamped. One boot pass covers
 * whatever is already retained. There is no timer — the reconciler is purely event-driven,
 * and every pass is `.catch`-guarded so a publish failure can't escape into the emitter.
 */
export function startSiteTimezoneReconciler(): void {
  const service = getSiteMqttService();
  const guarded = (resetAttempts: boolean) =>
    void runReconcilePass({ resetAttempts }).catch((error) => console.error('[tz] reconcile pass failed', error));

  service.subscribe((event: SnapshotEvent) => {
    if (event.type === 'broker' && event.broker?.connected) guarded(true);
    else if (isTimeZoneEntity(event)) guarded(false);
  });

  guarded(true);
}
