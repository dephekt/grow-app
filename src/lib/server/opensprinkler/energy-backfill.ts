// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import type { DatabaseSync } from 'node:sqlite';
import { getIrrigationDb } from './db';
import { listEnergyPending, eventWindow, markEventEnergy, pumpTagsForKind } from './events';
import { isInfluxConfigured } from '$lib/server/influx/client';
import { queryPumpWindow } from '$lib/server/influx/pump-energy';

/**
 * Background pump-energy enrichment, deliberately off the request path so a slow or hanging
 * InfluxDB can never stall the irrigation page render.
 */

const BACKFILL_INTERVAL_MS = 30_000;
/** Cap the Influx queries a single tick fans out. */
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

/** Start the periodic energy backfill; a no-op when InfluxDB is not configured. */
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
