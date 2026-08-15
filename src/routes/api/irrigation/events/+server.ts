// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getIrrigationDb } from '$lib/server/opensprinkler/db';
import { countEvents, latestEventId, listEvents } from '$lib/server/opensprinkler/events';
import { eventPageParams } from '$lib/server/paged-events';

// Pump energy is filled in off the request path by the background backfill loop
// (startIrrigationEnergyBackfill), so this handler never touches Influx.
export const GET: RequestHandler = ({ url }) => {
  const db = getIrrigationDb();
  const { limit, offset, anchorId } = eventPageParams(url, latestEventId(db));
  return json({
    ok: true,
    events: listEvents(db, limit, offset, anchorId),
    total: countEvents(db, anchorId),
    limit,
    offset,
    anchorId
  });
};
