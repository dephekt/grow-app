// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { error, redirect } from '@sveltejs/kit';
import type { PageLoadEvent } from './$types';
import type { UserSummary } from '$lib/server/auth/users';

export const load = async ({ fetch }: PageLoadEvent) => {
  const response = await fetch('/api/users');
  if (response.status === 401 || response.status === 403) {
    // Non-admins have no business here; the API is the real gate.
    redirect(307, '/');
  }
  if (!response.ok) {
    // Any other failure (e.g. a DB error) would otherwise leave users undefined
    // and crash the {#each} — show the error page instead.
    error(response.status, 'Could not load users');
  }
  const body = (await response.json()) as { users: UserSummary[] };
  return { users: body.users ?? [] };
};
