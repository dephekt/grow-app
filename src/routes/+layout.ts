import type { Snapshot } from '$lib/server/mqtt/types';

// One client-rendered shell for the whole app: load the snapshot once here, then
// the layout keeps a single live MQTT/SSE session that every page shares.
export const ssr = false;

export const load = async ({ fetch }) => {
  try {
    const response = await fetch('/api/snapshot');
    const snapshot = (await response.json()) as Snapshot;
    return { snapshot };
  } catch {
    return { snapshot: null };
  }
};
