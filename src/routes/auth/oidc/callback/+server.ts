// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthDb } from '$lib/server/auth/db';
import { upsertOidcUser, touchLogin } from '$lib/server/auth/users';
import { createSession } from '$lib/server/auth/sessions';
import { recordAudit } from '$lib/server/auth/audit';
import {
  SESSION_COOKIE,
  OIDC_TX_COOKIE,
  isSecureRequest,
  sessionCookieOptions
} from '$lib/server/auth/config';
import {
  completeLogin,
  authorizeFromGroups,
  type OidcClaims,
  type OidcTransaction
} from '$lib/server/auth/oidc';
import { getLoginThrottle } from '$lib/server/auth/login-throttle';
import { getSiteSlug } from '$lib/server/site';
import { sanitizeNext } from '$lib/auth-redirect';

/**
 * Public: OIDC redirect_uri, exempt from the hooks CSRF check as a GET — the state
 * and nonce bound to the tx cookie are this flow's CSRF/replay defenses.
 */
export const GET: RequestHandler = async ({ request, url, cookies, getClientAddress }) => {
  const secure = isSecureRequest(request.headers);
  const db = getAuthDb();

  let ip: string;
  try {
    ip = getClientAddress();
  } catch {
    ip = 'unknown';
  }

  // One-time use: always clear the tx cookie, whatever the outcome.
  const rawTx = cookies.get(OIDC_TX_COOKIE);
  cookies.delete(OIDC_TX_COOKIE, { path: '/', secure });

  let tx: OidcTransaction | null = null;
  if (rawTx) {
    try {
      tx = JSON.parse(rawTx) as OidcTransaction;
    } catch {
      tx = null;
    }
  }
  if (!tx || !tx.state || !tx.verifier || !tx.redirectUri) {
    redirect(303, '/login?error=sso');
  }

  // Per-IP throttle before the token exchange: the tx cookie is client-forgeable and reusable.
  // Deliberately not audited — a shed request must not hand an attacker a cheap audit write.
  if (!getLoginThrottle().checkRate(ip).allowed) {
    redirect(303, '/login?error=sso');
  }

  let claims: OidcClaims;
  try {
    // Rebuild from the stored redirect_uri, NOT the incoming request origin, so it
    // byte-matches the one sent at authorize even behind the plain-HTTP LAN proxy.
    const currentUrl = new URL(tx.redirectUri);
    currentUrl.search = url.search;
    claims = await completeLogin(currentUrl, tx);
  } catch (err) {
    console.error('[auth] OIDC callback exchange failed', err);
    recordAudit(db, { event: 'login.failed', ip, detail: 'oidc: code exchange/validation failed' });
    redirect(303, '/login?error=sso');
  }

  const { authorized, isAdmin } = authorizeFromGroups(claims.groups, getSiteSlug());
  if (!authorized) {
    recordAudit(db, {
      event: 'login.denied',
      username: claims.preferredUsername ?? claims.sub,
      ip,
      detail: 'oidc: no authorized group'
    });
    redirect(303, '/login?error=forbidden');
  }

  const user = await upsertOidcUser(db, {
    issuer: claims.iss,
    sub: claims.sub,
    username: claims.preferredUsername ?? claims.email ?? claims.sub,
    displayName: claims.name,
    isAdmin
  });

  // A locally-disabled account is denied even with a valid group — `disabled` is
  // the immediate local kill-switch.
  if (user.disabled === 1) {
    recordAudit(db, {
      event: 'login.denied',
      username: user.username,
      userId: user.id,
      ip,
      detail: 'oidc: user disabled'
    });
    redirect(303, '/login?error=forbidden');
  }

  const { token } = createSession(db, {
    userId: user.id,
    loginMethod: 'oidc',
    userAgent: request.headers.get('user-agent'),
    ip
  });
  cookies.set(SESSION_COOKIE, token, sessionCookieOptions(secure));
  touchLogin(db, user.id);
  recordAudit(db, { event: 'login.oidc', username: user.username, userId: user.id, ip });

  redirect(303, sanitizeNext(tx.next));
};
