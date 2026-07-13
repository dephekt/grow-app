import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getIrrigationDb } from '$lib/server/opensprinkler/db';
import { listEvents } from '$lib/server/opensprinkler/events';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function clampLimit(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

// The mixed irrigation + runoff history feed — any authenticated user (read-only; hooks already
// require a session for /api paths). Pump energy is filled in off the request path by the
// background backfill loop (startIrrigationEnergyBackfill), so this handler never touches Influx
// and a slow Influx can't stall the page.
export const GET: RequestHandler = ({ url }) => {
  return json({ ok: true, events: listEvents(getIrrigationDb(), clampLimit(url.searchParams.get('limit'))) });
};
