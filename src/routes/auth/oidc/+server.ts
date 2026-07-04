import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  isSsoEnabled,
  getAllowedOrigins,
  OIDC_TX_COOKIE,
  oidcTxCookieOptions,
  isSecureRequest
} from '$lib/server/auth/config';
import { beginLogin, resolveRequestOrigin } from '$lib/server/auth/oidc';
import { sanitizeNext } from '$lib/auth-redirect';

/**
 * Public: initiate the OIDC auth-code flow. Builds the authorization URL (PKCE +
 * state + nonce), stashes the exchange state in a short-lived HttpOnly cookie, and
 * redirects to the IdP. Whitelisted pre-session in the auth guard.
 */
export const GET: RequestHandler = async ({ request, url, cookies }) => {
  if (!isSsoEnabled()) redirect(303, '/login');

  // Fail-closed origin check: the flow may only run on a configured origin, since
  // that origin becomes the callback redirect_uri.
  const origin = resolveRequestOrigin(request.headers);
  if (!origin || !getAllowedOrigins().includes(origin)) {
    redirect(303, '/login?error=sso');
  }

  const next = sanitizeNext(url.searchParams.get('next'));

  const begun = await beginLogin(origin, next).catch((err) => {
    // Discovery/network failure (e.g. IdP down) — fail the new login cleanly;
    // existing sessions are unaffected.
    console.error('[auth] OIDC initiate failed', err);
    return null;
  });
  if (!begun) redirect(303, '/login?error=sso');

  cookies.set(
    OIDC_TX_COOKIE,
    JSON.stringify(begun.transaction),
    oidcTxCookieOptions(isSecureRequest(request.headers))
  );
  redirect(303, begun.authorizationUrl);
};
