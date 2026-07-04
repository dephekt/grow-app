import { error, redirect } from '@sveltejs/kit';
import type { Zone } from '$lib/server/opensprinkler/zones';

export type ZoneJson = Zone & { stationEntityId: string };

export const load = async ({ fetch }) => {
  const response = await fetch('/api/irrigation/zones');
  if (response.status === 401 || response.status === 403) {
    redirect(307, '/');
  }
  if (!response.ok) {
    error(response.status, 'Could not load irrigation zones');
  }
  const body = (await response.json()) as { zones: ZoneJson[] };
  return { zones: body.zones ?? [] };
};
