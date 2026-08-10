// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getIrrigationDb } from '$lib/server/opensprinkler/db';
import { countEvents, listEvents } from '$lib/server/opensprinkler/events';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 500;

function clampLimit(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

function clampOffset(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

// Pump energy is filled in off the request path by the background backfill loop
// (startIrrigationEnergyBackfill), so this handler never touches Influx.
export const GET: RequestHandler = ({ url }) => {
  const db = getIrrigationDb();
  const limit = clampLimit(url.searchParams.get('limit'));
  const offset = clampOffset(url.searchParams.get('offset'));
  return json({ ok: true, events: listEvents(db, limit, offset), total: countEvents(db), limit, offset });
};
