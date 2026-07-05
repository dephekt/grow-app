import { error, redirect } from '@sveltejs/kit';
import type { Zone } from '$lib/server/opensprinkler/zones';
import type { ScheduleJson } from '$lib/server/opensprinkler/schedules';

export type ZoneJson = Zone & { stationEntityId: string };
export type { ScheduleJson };

export const load = async ({ fetch }) => {
  // Zones and their schedules are independent reads; fetch them in parallel.
  const [zonesRes, schedulesRes] = await Promise.all([
    fetch('/api/irrigation/zones'),
    fetch('/api/irrigation/schedules')
  ]);

  if (zonesRes.status === 401 || zonesRes.status === 403) {
    redirect(307, '/');
  }
  if (!zonesRes.ok) {
    error(zonesRes.status, 'Could not load irrigation zones');
  }

  const zones = ((await zonesRes.json()) as { zones: ZoneJson[] }).zones ?? [];
  // Schedules are non-critical for the page to render; degrade to empty on failure.
  const schedules = schedulesRes.ok ? ((await schedulesRes.json()) as { schedules: ScheduleJson[] }).schedules ?? [] : [];

  return { zones, schedules };
};
