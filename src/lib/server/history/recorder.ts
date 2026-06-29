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
import type { EntityConfig, EntityState } from '$lib/server/mqtt/types';

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
  const site = service.snapshot().site;
  const entities = new Map<string, EntityConfig>();
  for (const entity of service.snapshot().entities) entities.set(entity.id, entity);

  let written = 0;
  const unsubscribe = service.subscribe((event) => {
    if (event.type === 'entity' && event.entity) {
      entities.set(event.entity.id, event.entity);
      return;
    }
    if (event.type !== 'state' || !event.entityId || !event.state) return;

    const entity = entities.get(event.entityId);
    if (!entity || !isRecordable(entity)) return;

    const value = numericValue(entity, event.state);
    if (value === null) return;

    const point = new Point(READING_MEASUREMENT)
      .tag('site', site)
      .tag('node', entity.nodeId ?? entity.device.identifiers[0] ?? 'unknown')
      .tag('entity', entity.objectId ?? entity.id)
      .tag('component', entity.component)
      .floatField('value', value);
    if (entity.unit) point.tag('unit', entity.unit);
    if (event.state.updatedAt) point.timestamp(new Date(event.state.updatedAt));

    writeApi.writePoint(point);
    written += 1;
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
