/**
 * grow-history-recorder — standalone sidecar.
 *
 * Reuses the app's SiteMqttService (discovery + state parsing) instead of
 * re-deriving topic shapes, so every reading lands in InfluxDB already tagged
 * with its site / node / entity / unit. Runs as its own container (built from
 * the grow-app image) so history collection is decoupled from the web server.
 *
 * Records numeric sensors and binary-sensor states only — not commands,
 * setpoints, or diagnostics (per the site brief).
 */
import { Point } from '@influxdata/influxdb-client';
import { getInfluxConfig, getInfluxDB } from '$lib/server/influx/client';
import { READING_MEASUREMENT } from '$lib/server/influx/query';
import { getSiteMqttService } from '$lib/server/mqtt/service';
import { getSiteSlug } from '$lib/server/site';
import type { EntityConfig, EntityState, Snapshot } from '$lib/server/mqtt/types';

// Default to a recorder-specific MQTT client id so we never collide with the web
// app even if compose forgets to set MQTT_CLIENT_ID — both run as PID 1 in their
// own container, so the PID-derived fallback would otherwise be identical.
// Compose may still override this for an explicit id.
if (!process.env.MQTT_CLIENT_ID) {
  process.env.MQTT_CLIENT_ID = `grow-history-recorder-${getSiteSlug()}`;
}

function isRecordable(entity: EntityConfig): boolean {
  if (entity.entityCategory === 'diagnostic') return false;
  return entity.component === 'sensor' || entity.component === 'binary_sensor';
}

function numericValue(entity: EntityConfig, state: EntityState): number | null {
  if (state.value === null) return null;

  if (entity.component === 'binary_sensor') {
    if (state.value === (entity.payloadOn ?? 'ON')) return 1;
    if (state.value === (entity.payloadOff ?? 'OFF')) return 0;
    const lc = state.value.trim().toLowerCase();
    if (['on', 'true', '1'].includes(lc)) return 1;
    if (['off', 'false', '0'].includes(lc)) return 0;
    return null;
  }

  const n = Number(state.value);
  return Number.isFinite(n) ? n : null;
}

function main(): void {
  const config = getInfluxConfig();
  const db = getInfluxDB(config);
  if (!config || !db) {
    console.error('[recorder] INFLUX_URL / INFLUX_TOKEN not configured — refusing to start');
    process.exit(1);
  }

  const writeApi = db.getWriteApi(config.org, config.bucket, 'ms', {
    flushInterval: 5_000,
    maxRetries: 5
  });

  const service = getSiteMqttService();
  const snap = service.snapshot();
  const site = snap.site;
  const entities = new Map<string, EntityConfig>();

  // Dedup by entityId -> last recorded updatedAt. Retained values that arrive
  // bundled with discovery surface via 'snapshot' (not 'state'), so we backfill
  // from snapshots too; the dedup keeps that idempotent.
  const lastRecorded = new Map<string, string>();
  // Entities whose initial retained reading has been backfilled. Ongoing values
  // come via 'state' events, so a snapshot need only look at entities not yet
  // backfilled — avoids re-scanning every entity on every snapshot emit.
  const backfilled = new Set<string>();
  let written = 0;

  function record(entity: EntityConfig | undefined, state: EntityState | undefined): void {
    if (!entity || !state || !isRecordable(entity)) return;
    const value = numericValue(entity, state);
    if (value === null) return;

    const stamp = state.updatedAt ?? '';
    if (lastRecorded.get(entity.id) === stamp) return;
    lastRecorded.set(entity.id, stamp);

    const point = new Point(READING_MEASUREMENT)
      .tag('site', site)
      .tag('node', entity.nodeId ?? entity.device.identifiers[0] ?? 'unknown')
      .tag('entity', entity.objectId ?? entity.id)
      .tag('component', entity.component)
      .floatField('value', value);
    if (entity.unit) point.tag('unit', entity.unit);
    if (state.updatedAt) point.timestamp(new Date(state.updatedAt));

    writeApi.writePoint(point);
    written += 1;
  }

  function recordSnapshot(s: Snapshot): void {
    for (const entity of s.entities) {
      if (backfilled.has(entity.id)) continue;
      entities.set(entity.id, entity);
      const state = s.states[entity.id];
      if (state && state.value != null) {
        record(entity, state);
        backfilled.add(entity.id);
      }
    }
  }

  // Capture anything already retained at startup.
  recordSnapshot(snap);

  const unsubscribe = service.subscribe((event) => {
    if (event.type === 'snapshot' && event.snapshot) {
      recordSnapshot(event.snapshot);
      return;
    }
    if (event.type === 'entity' && event.entity) {
      entities.set(event.entity.id, event.entity);
      return;
    }
    if (event.type === 'state' && event.entityId && event.state) {
      record(entities.get(event.entityId), event.state);
    }
  });

  setInterval(() => {
    if (written > 0) {
      console.log(`[recorder] buffered ${written} points`);
      written = 0;
    }
  }, 60_000).unref();

  console.log(`[recorder] recording site=${site} → ${config.url} bucket=${config.bucket}`);

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[recorder] ${signal} — flushing`);
    unsubscribe();
    try {
      await writeApi.close();
    } catch (error) {
      console.error('[recorder] flush failed', error);
    }
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main();
