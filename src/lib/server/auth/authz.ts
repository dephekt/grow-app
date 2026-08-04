// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { json } from '@sveltejs/kit';

/**
 * Admin gate for the user-management API, returning a ready-to-send error Response
 * (401 anonymous, 403 non-admin) or null when the caller may proceed.
 */
export function requireAdmin(locals: App.Locals): Response | null {
  if (!locals.user) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  if (!locals.user.isAdmin) return json({ ok: false, error: 'Admin access required' }, { status: 403 });
  return null;
}
