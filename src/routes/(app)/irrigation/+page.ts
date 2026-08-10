// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { error, redirect } from '@sveltejs/kit';
import type { SubstrateProbeBinding } from '$lib/substrate';
import type { Zone } from '$lib/server/opensprinkler/zones';
import type { ScheduleJson } from '$lib/server/opensprinkler/schedules';
import type { IrrigationEventJson } from '$lib/server/opensprinkler/events';

export type ZoneJson = Zone & { stationEntityId: string };
export type { ScheduleJson, IrrigationEventJson };

const HISTORY_PAGE_SIZE = 25;

export const load = async ({ fetch }) => {
  // Zones, schedules, and the history feed are independent reads; fetch them in parallel.
  const [zonesRes, schedulesRes, eventsRes] = await Promise.all([
    fetch('/api/irrigation/zones'),
    fetch('/api/irrigation/schedules'),
    fetch(`/api/irrigation/events?limit=${HISTORY_PAGE_SIZE}&offset=0`)
  ]);

  if (zonesRes.status === 401 || zonesRes.status === 403) {
    redirect(307, '/');
  }
  if (!zonesRes.ok) {
    error(zonesRes.status, 'Could not load irrigation zones');
  }

  const zonesBody = (await zonesRes.json()) as { zones: ZoneJson[]; probes?: SubstrateProbeBinding[] };
  const zones = zonesBody.zones ?? [];
  const probes = zonesBody.probes ?? [];

  // Schedules are non-critical for the page to render; degrade to empty on failure. The
  // response also carries the resolved schedule tz so "Next run" renders in schedule-
  // local time regardless of the viewer's browser zone.
  let schedules: ScheduleJson[] = [];
  let scheduleTimeZone = 'UTC';
  if (schedulesRes.ok) {
    const body = (await schedulesRes.json()) as { schedules?: ScheduleJson[]; tz?: string };
    schedules = body.schedules ?? [];
    scheduleTimeZone = body.tz ?? 'UTC';
  }

  // History is non-critical too; degrade to empty on failure.
  let events: IrrigationEventJson[] = [];
  let eventTotal = 0;
  if (eventsRes.ok) {
    const body = (await eventsRes.json()) as { events?: IrrigationEventJson[]; total?: number };
    events = body.events ?? [];
    eventTotal = Number.isInteger(body.total) ? (body.total as number) : events.length;
  }

  return { zones, probes, schedules, scheduleTimeZone, events, eventTotal };
};
