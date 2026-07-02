import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthDb } from '$lib/server/auth/db';
import { clearPassword, getUserById, setDisabled, toUserSummary } from '$lib/server/auth/users';
import { deleteSessionsForUser } from '$lib/server/auth/sessions';
import { recordAudit } from '$lib/server/auth/audit';

function requireAdmin(locals: App.Locals): Response | null {
  if (!locals.user) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  if (!locals.user.isAdmin) return json({ ok: false, error: 'Admin access required' }, { status: 403 });
  return null;
}

interface PatchBody {
  disabled?: unknown;
  clearPassword?: unknown;
  revokeSessions?: unknown;
}

/**
 * Admin user management: disable/enable, clear a local/fallback password, and
 * revoke sessions. Disabling a user also revokes their sessions so they're
 * kicked immediately rather than on next request.
 */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return json({ ok: false, error: 'Invalid user id' }, { status: 400 });
  }

  const db = getAuthDb();
  const target = getUserById(db, id);
  if (!target) {
    return json({ ok: false, error: 'User not found' }, { status: 404 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return json({ ok: false, error: 'Invalid request' }, { status: 400 });
  }

  // Guard against self-lockout: an admin can't disable their own account.
  if (body.disabled === true && target.id === locals.user!.id) {
    return json({ ok: false, error: 'You cannot disable your own account' }, { status: 400 });
  }

  if (typeof body.disabled === 'boolean') {
    setDisabled(db, id, body.disabled);
    if (body.disabled) deleteSessionsForUser(db, id);
  }

  if (body.clearPassword === true) {
    clearPassword(db, id);
  }

  if (body.revokeSessions === true) {
    const removed = deleteSessionsForUser(db, id);
    recordAudit(db, { event: 'sessions.revoked', userId: id, detail: `${removed} session(s)` });
  }

  return json({ ok: true, user: toUserSummary(getUserById(db, id)!) });
};
