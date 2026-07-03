import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthDb } from '$lib/server/auth/db';
import { getUserById, setPassword } from '$lib/server/auth/users';
import { verifyPassword } from '$lib/server/auth/passwords';
import { MIN_PASSWORD_LENGTH } from '$lib/server/auth/config';

interface PasswordBody {
  currentPassword?: unknown;
  newPassword?: unknown;
}

/**
 * Protected. Set or change the current user's local password. This is how an
 * OIDC user opts in to a fallback password (they have no password yet, so no
 * currentPassword is required) and how a local user changes theirs (must supply
 * the current one).
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const sessionUser = locals.user;
  if (!sessionUser) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: PasswordBody;
  try {
    body = (await request.json()) as PasswordBody;
  } catch {
    return json({ ok: false, error: 'Invalid request' }, { status: 400 });
  }

  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return json({ ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, { status: 400 });
  }

  const db = getAuthDb();
  const row = getUserById(db, sessionUser.id);
  if (!row) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Changing an existing password requires proving the old one; first-time
  // opt-in (no password yet) is authorised by the active session alone.
  if (row.password_hash) {
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    if (!(await verifyPassword(currentPassword, row.password_hash))) {
      return json({ ok: false, error: 'Current password is incorrect' }, { status: 400 });
    }
  }

  await setPassword(db, row.id, newPassword);
  return json({ ok: true, hasLocalPassword: true });
};
