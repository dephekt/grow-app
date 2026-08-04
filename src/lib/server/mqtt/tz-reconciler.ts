// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { getSiteMqttService, type SiteMqttService } from './service';
import type { SnapshotEvent } from './types';
import { deviceDesiredTimeZone } from '$lib/server/settings/site-timezone';
import { posixTzFromIana, type PosixResult } from '$lib/server/tz/posix-tz';

/** Reconcile the site time zone onto every tz-capable device; POSIX is derived at the publish
 *  boundary only and never persisted. */

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

/** Pure per-pass reconciliation; "desired" past the conversion is the POSIX form, which is
 *  what a device echoes and what is recorded as attempted. */
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

// Cross-pass state; a reset clears both so the site value is re-attempted from scratch.
const lastPublished = new Map<string, string>();
let lastWarnedIana: string | null = null;

function runReconcilePass(
  service: SiteMqttService,
  { resetAttempts }: { resetAttempts: boolean }
): Promise<ReconcileReport> {
  if (resetAttempts) {
    lastPublished.clear();
    lastWarnedIana = null;
  }
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
export function reconcileSiteTimezone(
  service: SiteMqttService = getSiteMqttService()
): Promise<ReconcileReport> {
  return runReconcilePass(service, { resetAttempts: true });
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

/** Wire the reconciler to broker and discovery events; purely event-driven, and every pass is
 *  catch-guarded so a publish failure cannot escape into the emitter. */
export function startSiteTimezoneReconciler(service: SiteMqttService = getSiteMqttService()): void {
  const guarded = (resetAttempts: boolean) =>
    void runReconcilePass(service, { resetAttempts }).catch((error) =>
      console.error('[tz] reconcile pass failed', error)
    );

  service.subscribe((event: SnapshotEvent) => {
    if (event.type === 'broker' && event.broker?.connected) guarded(true);
    else if (isTimeZoneEntity(event)) {
      // Clear only this entity's guard, so a node that missed a change is re-stamped without
      // re-attempting devices that are correctly rejecting the value.
      if (event.entity) lastPublished.delete(event.entity.id);
      guarded(false);
    }
  });

  guarded(true);
}
