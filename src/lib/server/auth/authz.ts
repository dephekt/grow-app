import { json } from '@sveltejs/kit';

/**
 * Admin gate for the user-management API. Returns a ready-to-send error Response
 * (401 when anonymous, 403 when authenticated but not an admin) or null when the
 * caller may proceed. Shared by /api/users and /api/users/[id] so both endpoints
 * answer denials identically.
 */
export function requireAdmin(locals: App.Locals): Response | null {
  if (!locals.user) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  if (!locals.user.isAdmin) return json({ ok: false, error: 'Admin access required' }, { status: 403 });
  return null;
}
