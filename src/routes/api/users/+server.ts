import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthDb } from '$lib/server/auth/db';
import { createLocalUser, getUserByUsername, listUsers, toUserSummary } from '$lib/server/auth/users';
import { MIN_PASSWORD_LENGTH } from '$lib/server/auth/config';
import { requireAdmin } from '$lib/server/auth/authz';

// Admin: list all users (sanitised — no password hashes).
export const GET: RequestHandler = ({ locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;
  return json({ ok: true, users: listUsers(getAuthDb()).map(toUserSummary) });
};

interface CreateBody {
  username?: unknown;
  password?: unknown;
  isAdmin?: unknown;
  displayName?: unknown;
}

// Admin: create a pure-local account (username + password, no Keycloak).
export const POST: RequestHandler = async ({ request, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return json({ ok: false, error: 'Invalid request' }, { status: 400 });
  }

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const displayName = typeof body.displayName === 'string' && body.displayName.trim() ? body.displayName.trim() : null;
  const isAdmin = body.isAdmin === true;

  if (!username) {
    return json({ ok: false, error: 'Username is required' }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return json({ ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, { status: 400 });
  }

  const db = getAuthDb();
  if (getUserByUsername(db, username)) {
    return json({ ok: false, error: 'A user with that username already exists' }, { status: 409 });
  }

  let created;
  try {
    created = await createLocalUser(db, { username, password, isAdmin, displayName });
  } catch (err) {
    // A concurrent create can pass the pre-check above and still lose the race to
    // the UNIQUE(username) constraint — answer 409 like the pre-check, not a 500.
    // Only map the uniqueness violation; a genuine DB/infra failure (busy, disk,
    // hashing) must surface as a 500, not masquerade as a duplicate username.
    if (err instanceof Error && /UNIQUE constraint failed/i.test(err.message)) {
      return json({ ok: false, error: 'A user with that username already exists' }, { status: 409 });
    }
    throw err;
  }
  return json({ ok: true, user: toUserSummary(created) }, { status: 201 });
};
