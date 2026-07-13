import { error, redirect } from '@sveltejs/kit';
import type { Zone } from '$lib/server/opensprinkler/zones';
import type { ScheduleJson } from '$lib/server/opensprinkler/schedules';
import type { IrrigationEventJson } from '$lib/server/opensprinkler/events';

export type ZoneJson = Zone & { stationEntityId: string };
export type { ScheduleJson, IrrigationEventJson };

export const load = async ({ fetch }) => {
  // Zones, schedules, and the history feed are independent reads; fetch them in parallel.
  const [zonesRes, schedulesRes, eventsRes] = await Promise.all([
    fetch('/api/irrigation/zones'),
    fetch('/api/irrigation/schedules'),
    fetch('/api/irrigation/events')
  ]);

  if (zonesRes.status === 401 || zonesRes.status === 403) {
    redirect(307, '/');
  }
  if (!zonesRes.ok) {
    error(zonesRes.status, 'Could not load irrigation zones');
  }

  const zones = ((await zonesRes.json()) as { zones: ZoneJson[] }).zones ?? [];

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
  if (eventsRes.ok) {
    events = ((await eventsRes.json()) as { events?: IrrigationEventJson[] }).events ?? [];
  }

  return { zones, schedules, scheduleTimeZone, events };
};
