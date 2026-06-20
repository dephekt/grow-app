import type { Snapshot } from '$lib/server/mqtt/types';

export const ssr = false;

export const load = async ({ fetch, url }) => {
  const response = await fetch('/api/snapshot');
  const snapshot = (await response.json()) as Snapshot;

  return {
    snapshot,
    selectedDeviceId: url.searchParams.get('device'),
    selectedSectionId: url.searchParams.get('section')
  };
};
