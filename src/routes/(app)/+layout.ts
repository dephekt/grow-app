import { redirect } from '@sveltejs/kit';
import type { Snapshot } from '$lib/server/mqtt/types';
import type { AuthenticatedUser } from '$lib/server/auth/users';

// (app)/+layout.svelte seeds the live snapshot once at mount, and the SSE stream
// (/api/events) both keeps it current and re-delivers a full snapshot on connect.
// This load, however, reruns on every client-side navigation because it reads
// `url` to build the login redirect — so the snapshot only needs fetching on the
// first run. Cache it to drop a wasted /api/snapshot round-trip (plus full JSON
// parse) per nav for a value that's never read again. Safe as module state: ssr
// is false, so this is a per-browser-session client module, reset on full reload.
let snapshotFetched = false;
let initialSnapshot: Snapshot | null = null;

// The authenticated shell. Runs client-side (ssr=false). If /api/me reports no
// user (session missing/expired), bounce to the login page before loading any
// site data. Server endpoints are guarded independently in hooks.server.ts —
// this is UX, not the security boundary.
export const load = async ({ fetch, url }) => {
  let user: AuthenticatedUser | null = null;
  try {
    const meResponse = await fetch('/api/me');
    if (meResponse.ok) {
      user = ((await meResponse.json()) as { user: AuthenticatedUser | null }).user;
    }
  } catch {
    user = null;
  }

  if (!user) {
    const next = url.pathname + url.search;
    redirect(307, `/login?next=${encodeURIComponent(next)}`);
  }

  if (!snapshotFetched) {
    try {
      const response = await fetch('/api/snapshot');
      // A session revoked between the /api/me probe and here returns a 401 JSON
      // body; without the ok check it would be cast to Snapshot and crash the shell.
      initialSnapshot = response.ok ? ((await response.json()) as Snapshot) : null;
    } catch {
      initialSnapshot = null;
    }
    snapshotFetched = true;
  }

  return { user, snapshot: initialSnapshot };
};
