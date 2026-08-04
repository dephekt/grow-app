// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import * as client from 'openid-client';
import {
  getOidcConfigEnv,
  getOidcScopes,
  getOidcHttpTimeoutSeconds,
  getOidcAllowInsecureIssuer,
  isSecureRequest
} from '$lib/server/auth/config';

// Flat rather than nested, because the IdP federates from a flat LDAP groupOfNames directory.

/** Global admin group — full control across the deployment (decision 28). */
export const ADMIN_GROUP = '/grow-admin';

/** The site-scope group for a given slug (`/grow-site-<slug>`). */
export function siteGroup(siteSlug: string): string {
  return `/grow-site-${siteSlug}`;
}

/** Validated claims we read off the ID token. */
export interface OidcClaims {
  iss: string;
  sub: string;
  groups: string[];
  preferredUsername: string | null;
  name: string | null;
  email: string | null;
}

/** The in-flight auth-code exchange state, stashed in the tx cookie between the
 *  initiate redirect and the callback. */
export interface OidcTransaction {
  verifier: string;
  state: string;
  nonce: string;
  /** The exact redirect_uri sent at authorize; replayed at token exchange. */
  redirectUri: string;
  /** Sanitised post-login destination. */
  next: string;
}

// The PROMISE is memoised, not the value, so concurrent logins share one discovery; cleared
// on rejection so a transient IdP outage doesn't disable SSO until restart.
let configPromise: Promise<client.Configuration> | null = null;

export function getOidcConfiguration(): Promise<client.Configuration> {
  if (configPromise) return configPromise;

  const { issuer, clientId, clientSecret } = getOidcConfigEnv();
  if (!issuer || !clientId || !clientSecret) {
    // Callers gate on isSsoEnabled(); reaching here means misconfiguration.
    return Promise.reject(new Error('OIDC is not configured'));
  }

  const promise = client.discovery(new URL(issuer), clientId, clientSecret, undefined, {
    timeout: getOidcHttpTimeoutSeconds(),
    // Opt-in escape hatch for a plain-HTTP issuer (tests / trusted LAN IdP).
    execute: getOidcAllowInsecureIssuer() ? [client.allowInsecureRequests] : undefined
  });
  configPromise = promise;
  promise.catch(() => {
    // Only clear if nothing else replaced the memo in the meantime.
    if (configPromise === promise) configPromise = null;
  });
  return promise;
}

/** Reset the discovery memo. Exposed for tests. */
export function resetOidcConfiguration(): void {
  configPromise = null;
}

/** The request's origin from the forwarded headers, NOT `event.url.origin`, which
 *  adapter-node defaults to https and mis-derives on the plain-HTTP LAN. */
export function resolveRequestOrigin(headers: Pick<Headers, 'get'>): string | null {
  const forwardedHost = headers.get('x-forwarded-host') ?? headers.get('host');
  if (!forwardedHost) return null;
  const host = forwardedHost.split(',')[0].trim();
  if (!host) return null;
  const scheme = isSecureRequest(headers) ? 'https' : 'http';
  return `${scheme}://${host}`;
}

/** Begin an auth-code login, returning the authorize URL and the transaction to stash. */
export async function beginLogin(
  origin: string,
  next: string
): Promise<{ authorizationUrl: string; transaction: OidcTransaction }> {
  const config = await getOidcConfiguration();
  const verifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(verifier);
  const state = client.randomState();
  const nonce = client.randomNonce();
  const redirectUri = `${origin}/auth/oidc/callback`;

  const authorizationUrl = client.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope: getOidcScopes(),
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  });

  return {
    authorizationUrl: authorizationUrl.href,
    transaction: { verifier, state, nonce, redirectUri, next }
  };
}

function stringClaim(claims: Record<string, unknown>, key: string): string | null {
  const value = claims[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Complete the auth-code exchange; `currentUrl` MUST come from the stored redirectUri, since
 *  openid-client derives the token-endpoint redirect_uri from it and it must byte-match. */
export async function completeLogin(currentUrl: URL, tx: OidcTransaction): Promise<OidcClaims> {
  const config = await getOidcConfiguration();
  const tokens = await client.authorizationCodeGrant(config, currentUrl, {
    expectedState: tx.state,
    expectedNonce: tx.nonce,
    pkceCodeVerifier: tx.verifier
  });

  const claims = tokens.claims();
  if (!claims) throw new Error('OIDC response carried no ID token');

  const raw = claims as unknown as Record<string, unknown>;
  const groups = Array.isArray(raw.groups)
    ? (raw.groups as unknown[]).filter((g): g is string => typeof g === 'string')
    : [];

  return {
    iss: claims.iss,
    sub: claims.sub,
    groups,
    preferredUsername: stringClaim(raw, 'preferred_username'),
    name: stringClaim(raw, 'name'),
    email: stringClaim(raw, 'email')
  };
}

/** Authorization from group claims, which arrive as full paths from Keycloak's mapper. */
export function authorizeFromGroups(
  groups: string[],
  siteSlug: string
): { authorized: boolean; isAdmin: boolean } {
  const isAdmin = groups.includes(ADMIN_GROUP);
  const inSite = groups.includes(siteGroup(siteSlug));
  return { authorized: isAdmin || inSite, isAdmin };
}
