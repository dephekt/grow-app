import { error, redirect } from '@sveltejs/kit';
import type { TimeZoneSource } from '$lib/server/settings/site-timezone';

interface SettingsBody {
  timezone: string;
  source: TimeZoneSource;
  stored: string | null;
  zones: string[];
}

export const load = async ({ fetch }) => {
  const response = await fetch('/api/settings');
  if (response.status === 401 || response.status === 403) {
    // Non-admins have no business here; the API is the real gate.
    redirect(307, '/');
  }
  if (!response.ok) {
    // Any other failure would leave the zone list undefined and crash the <select>.
    error(response.status, 'Could not load site settings');
  }
  const body = (await response.json()) as SettingsBody;
  return {
    timezone: body.timezone,
    source: body.source,
    stored: body.stored,
    zones: body.zones ?? []
  };
};
