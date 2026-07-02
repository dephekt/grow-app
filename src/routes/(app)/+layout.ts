import { redirect } from '@sveltejs/kit';
import type { Snapshot } from '$lib/server/mqtt/types';
import type { AuthenticatedUser } from '$lib/server/auth/users';

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

  let snapshot: Snapshot | null = null;
  try {
    const response = await fetch('/api/snapshot');
    snapshot = (await response.json()) as Snapshot;
  } catch {
    snapshot = null;
  }

  return { user, snapshot };
};
