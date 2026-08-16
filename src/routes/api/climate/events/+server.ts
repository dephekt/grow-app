// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getClimateDb } from '$lib/server/climate/db';
import {
  countClimateEvents,
  latestClimateEventId,
  listClimateEvents
} from '$lib/server/climate/store';
import { eventPageParams } from '$lib/server/paged-events';

export const GET: RequestHandler = ({ url }) => {
  const db = getClimateDb();
  const { limit, offset, anchorId } = eventPageParams(url, latestClimateEventId(db));
  return json({
    ok: true,
    events: listClimateEvents(db, limit, offset, anchorId),
    total: countClimateEvents(db, anchorId),
    limit,
    offset,
    anchorId
  });
};
