import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthDb } from '$lib/server/auth/db';
import { getUserByUsername, touchLogin, toAuthenticatedUser } from '$lib/server/auth/users';
import { verifyPassword } from '$lib/server/auth/passwords';
import { createSession } from '$lib/server/auth/sessions';
import { recordAudit } from '$lib/server/auth/audit';
import { SESSION_COOKIE, isSecureRequest, sessionCookieOptions } from '$lib/server/auth/config';

interface LoginBody {
  username?: unknown;
  password?: unknown;
}

// Public: local username/password login. Always works regardless of IdP state.
export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
  let body: LoginBody;
  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return json({ ok: false, error: 'Invalid request' }, { status: 400 });
  }

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const ip = getClientAddress();

  if (!username || !password) {
    return json({ ok: false, error: 'Username and password are required' }, { status: 400 });
  }

  const db = getAuthDb();
  const user = getUserByUsername(db, username);

  // verifyPassword runs a scrypt even when the user is missing/passwordless, so
  // the three failure modes take similar time and don't leak account existence.
  const passwordOk = verifyPassword(password, user?.password_hash ?? null);

  if (!user || user.disabled === 1 || !passwordOk) {
    recordAudit(db, {
      event: user && user.disabled === 1 ? 'login.denied' : 'login.failed',
      username,
      userId: user?.id ?? null,
      ip,
      detail: user ? undefined : 'no such user'
    });
    return json({ ok: false, error: 'Invalid username or password' }, { status: 401 });
  }

  const { token } = createSession(db, {
    userId: user.id,
    loginMethod: 'local',
    userAgent: request.headers.get('user-agent'),
    ip
  });
  cookies.set(SESSION_COOKIE, token, sessionCookieOptions(isSecureRequest(request.headers)));
  touchLogin(db, user.id);
  recordAudit(db, { event: 'login.local', username: user.username, userId: user.id, ip });

  return json({ ok: true, user: toAuthenticatedUser(user) });
};
