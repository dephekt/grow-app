// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getClimateDb } from '$lib/server/climate/db';
import { countClimateEvents, latestClimateEventId, listClimateEvents } from '$lib/server/climate/store';

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

function parseAnchorId(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 0) return null;
  return n;
}

// `anchorId` freezes the row set so paging back through the log is not shifted by the ticks
// still being written underneath it.
export const GET: RequestHandler = ({ url }) => {
  const db = getClimateDb();
  const limit = clampLimit(url.searchParams.get('limit'));
  const offset = clampOffset(url.searchParams.get('offset'));
  const latestId = latestClimateEventId(db);
  const requested = parseAnchorId(url.searchParams.get('anchorId'));
  const anchorId = requested === null ? latestId : Math.min(requested, latestId);
  return json({
    ok: true,
    events: listClimateEvents(db, limit, offset, anchorId),
    total: countClimateEvents(db, anchorId),
    limit,
    offset,
    anchorId
  });
};
