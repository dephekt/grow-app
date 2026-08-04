// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

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
 * Public: initiate the OIDC auth-code flow; whitelisted pre-session in the auth guard.
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
    // Discovery/network failure (e.g. IdP down) — fail the new login cleanly.
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
