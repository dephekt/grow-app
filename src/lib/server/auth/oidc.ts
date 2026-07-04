import * as client from 'openid-client';
import {
  getOidcConfigEnv,
  getOidcScopes,
  getOidcHttpTimeoutSeconds,
  getOidcAllowInsecureIssuer,
  isSecureRequest
} from '$lib/server/auth/config';

// Group names are flat (`/grow-admin`, `/grow-site-<slug>`) rather than a nested
// `/grow/...` tree: the site IdP (Keycloak) federates groups from a flat LDAP
// `groupOfNames` directory, so a nested path would be awkward to model there.
// The token's group claim carries these as full paths with a single segment.

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

// Memoise the discovered Configuration PROMISE (not the resolved value), so
// concurrent logins share one discovery. The promise is cleared on rejection so a
// transient Keycloak outage doesn't disable SSO until process restart (decision
// 31 — new logins fail cleanly, existing sessions are untouched since per-request
// validation never calls the IdP).
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

/**
 * The origin the current request arrived on, as `scheme://host`. Derived from
 * `x-forwarded-host` + the forwarded protocol (via isSecureRequest) — NOT
 * `event.url.origin`, which adapter-node defaults to `https` and mis-derives on
 * the plain-HTTP LAN. Falls back to the `Host` header for a direct LAN request
 * that never traversed the proxy. Returns null when no host is present.
 */
export function resolveRequestOrigin(headers: Pick<Headers, 'get'>): string | null {
  const forwardedHost = headers.get('x-forwarded-host') ?? headers.get('host');
  if (!forwardedHost) return null;
  const host = forwardedHost.split(',')[0].trim();
  if (!host) return null;
  const scheme = isSecureRequest(headers) ? 'https' : 'http';
  return `${scheme}://${host}`;
}

/**
 * Begin an auth-code login: generate PKCE + state + nonce and build the
 * authorization URL for the given origin. Returns the URL to redirect to plus the
 * transaction to stash in the tx cookie.
 */
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

/**
 * Complete the auth-code exchange for a callback. `currentUrl` MUST be built from
 * the stored redirectUri plus the incoming query — openid-client strips the query
 * and uses the remaining origin+path as the token-endpoint redirect_uri, which
 * must byte-match the one sent at authorize. The library validates state, nonce,
 * PKCE, the ID token signature (JWKS), iss, aud, and exp for us.
 */
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

/**
 * Authorization decision from group claims (decision 28). Membership in the
 * site's group OR the global admin group grants access; the admin group also
 * grants admin. Pure and side-effect-free so it unit-tests like the guard. Group
 * claims are full paths (Keycloak "Group Membership" mapper, Full group path ON).
 */
export function authorizeFromGroups(
  groups: string[],
  siteSlug: string
): { authorized: boolean; isAdmin: boolean } {
  const isAdmin = groups.includes(ADMIN_GROUP);
  const inSite = groups.includes(siteGroup(siteSlug));
  return { authorized: isAdmin || inSite, isAdmin };
}
