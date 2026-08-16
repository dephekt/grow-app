// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { error, redirect } from '@sveltejs/kit';
import type { ClimateLiveState } from '../../api/climate/+server';
import type { ClimateEventJson } from '$lib/server/climate/store';

export type { ClimateLiveState, ClimateEventJson };

export const LOG_PAGE_SIZE = 25;

export const load = async ({ fetch }) => {
  const [stateRes, eventsRes] = await Promise.all([
    fetch('/api/climate'),
    fetch(`/api/climate/events?limit=${LOG_PAGE_SIZE}&offset=0`)
  ]);

  if (stateRes.status === 401 || stateRes.status === 403) {
    redirect(307, '/');
  }
  if (!stateRes.ok) {
    error(stateRes.status, 'Could not load climate state');
  }
  const state = (await stateRes.json()) as ClimateLiveState;

  // The log is non-critical for the page to render; degrade to empty on failure.
  let events: ClimateEventJson[] = [];
  let eventTotal = 0;
  let eventAnchorId = 0;
  if (eventsRes.ok) {
    const body = (await eventsRes.json()) as {
      events?: ClimateEventJson[];
      total?: number;
      anchorId?: number;
    };
    events = body.events ?? [];
    eventTotal = Number.isInteger(body.total) ? (body.total as number) : events.length;
    eventAnchorId =
      Number.isSafeInteger(body.anchorId) && (body.anchorId as number) >= 0
        ? (body.anchorId as number)
        : 0;
  }

  return { state, events, eventTotal, eventAnchorId };
};
