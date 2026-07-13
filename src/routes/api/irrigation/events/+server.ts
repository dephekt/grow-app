import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { DatabaseSync } from 'node:sqlite';
import { getIrrigationDb } from '$lib/server/opensprinkler/db';
import {
  listEvents,
  listEnergyPending,
  eventWindow,
  markEventEnergy,
  pumpTagsForKind
} from '$lib/server/opensprinkler/events';
import { isInfluxConfigured } from '$lib/server/influx/client';
import { queryPumpWindow } from '$lib/server/influx/pump-energy';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
/** Bound the Influx queries a single request can fan out — steady state is ~0 since rows
 *  are measured once and skipped thereafter; this only caps a cold cache / big backfill. */
const MAX_ENRICH_PER_REQUEST = 40;

function clampLimit(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** Best-effort lazy cache fill: integrate pump draw for settled, not-yet-measured rows and
 *  persist it. Skipped entirely when InfluxDB isn't wired up (rows stay "—", never warn).
 *  Never throws into the response — a failed backfill just leaves rows unmeasured. */
async function enrichPendingEnergy(db: DatabaseSync): Promise<void> {
  if (!isInfluxConfigured()) return;
  try {
    const pending = listEnergyPending(db, Date.now()).slice(0, MAX_ENRICH_PER_REQUEST);
    // Independent windows → query them concurrently (bounded by the slice cap), then persist.
    // node:sqlite is synchronous, so the markEventEnergy writes run after the awaits resolve.
    const measured = await Promise.all(
      pending.map(async (row) => {
        const { node, entity } = pumpTagsForKind(row.kind);
        const { startIso, stopIso } = eventWindow(row.ts, row.seconds);
        return { id: row.id, result: await queryPumpWindow(node, entity, startIso, stopIso) };
      })
    );
    for (const { id, result } of measured) {
      if (result) markEventEnergy(db, id, round(result.energyWh, 4), round(result.peakW, 1));
    }
  } catch (error) {
    console.warn('[irrigation] energy enrichment failed', error);
  }
}

// The mixed irrigation + runoff history feed — any authenticated user (read-only; hooks
// already require a session for /api paths).
export const GET: RequestHandler = async ({ url }) => {
  const db = getIrrigationDb();
  await enrichPendingEnergy(db);
  return json({ ok: true, events: listEvents(db, clampLimit(url.searchParams.get('limit'))) });
};
