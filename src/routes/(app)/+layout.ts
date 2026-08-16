// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { redirect } from '@sveltejs/kit';
import type { LayoutLoadEvent } from './$types';
import type { Snapshot } from '$lib/server/mqtt/types';
import type { AuthenticatedUser } from '$lib/server/auth/users';

// Safe as module state because ssr is false: this is a per-browser-session client
// module, reset on full reload.
let snapshotFetched = false;
let initialSnapshot: Snapshot | null = null;

// The authenticated shell, running client-side (ssr=false).
// Server endpoints are guarded in hooks.server.ts — this is UX, not the security boundary.
export const load = async ({ fetch, url }: LayoutLoadEvent) => {
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
      // A session revoked between the /api/me probe and here returns a 401 JSON body,
      // not a Snapshot.
      initialSnapshot = response.ok ? ((await response.json()) as Snapshot) : null;
    } catch {
      initialSnapshot = null;
    }
    snapshotFetched = true;
  }

  return { user, snapshot: initialSnapshot };
};
