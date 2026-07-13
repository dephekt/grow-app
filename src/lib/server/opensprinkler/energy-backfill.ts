import type { DatabaseSync } from 'node:sqlite';
import { getIrrigationDb } from './db';
import { listEnergyPending, eventWindow, markEventEnergy, pumpTagsForKind } from './events';
import { isInfluxConfigured } from '$lib/server/influx/client';
import { queryPumpWindow } from '$lib/server/influx/pump-energy';

/**
 * Background pump-energy enrichment (grow-app #81). Integrating each event's pump draw from
 * InfluxDB is deliberately OFF the request path: it runs on a timer here, not inside
 * GET /api/irrigation/events, so a slow or hanging Influx can never stall the irrigation page
 * render (which fetches the feed alongside the zones grid). The GET just reads whatever energy
 * has been cached onto the rows so far.
 */

const BACKFILL_INTERVAL_MS = 30_000;
/** Cap the Influx queries a single tick fans out. Steady state is ~0 (rows are measured once
 *  then skipped); this only bounds a cold cache / post-migration backfill, which drains over a
 *  few ticks. */
const MAX_PER_TICK = 40;

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

async function backfillOnce(db: DatabaseSync): Promise<void> {
  const pending = listEnergyPending(db, Date.now()).slice(0, MAX_PER_TICK);
  if (pending.length === 0) return;
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
}

/**
 * Start the periodic energy backfill (web app only, and only when InfluxDB is configured — with
 * no Influx every row stays "—" and there is nothing to do). A re-entrancy guard skips a tick
 * while the previous one is still awaiting Influx, so ticks never overlap or stack.
 */
export function startIrrigationEnergyBackfill(): void {
  if (!isInfluxConfigured()) return;

  let inFlight = false;
  const tick = async (): Promise<void> => {
    if (inFlight) return;
    inFlight = true;
    try {
      await backfillOnce(getIrrigationDb());
    } catch (error) {
      console.warn('[irrigation] energy backfill tick failed', error);
    } finally {
      inFlight = false;
    }
  };

  const timer = setInterval(() => void tick(), BACKFILL_INTERVAL_MS);
  timer.unref?.();
  void tick(); // best-effort immediate fill on start
}
