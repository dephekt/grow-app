import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthDb } from '$lib/server/auth/db';
import { deleteSession } from '$lib/server/auth/sessions';
import { recordAudit } from '$lib/server/auth/audit';
import { SESSION_COOKIE } from '$lib/server/auth/config';

// Protected. App-only logout: destroys the app session but does not end the
// upstream Keycloak SSO session (documented tradeoff — SSO may silently re-auth).
export const POST: RequestHandler = ({ cookies, locals }) => {
  const token = cookies.get(SESSION_COOKIE);
  if (token) {
    deleteSession(getAuthDb(), token);
    cookies.delete(SESSION_COOKIE, { path: '/' });
  }
  recordAudit(getAuthDb(), { event: 'logout', userId: locals.user?.id ?? null, username: locals.user?.username ?? null });
  return json({ ok: true });
};
