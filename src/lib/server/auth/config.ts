import { env, intEnv, secretEnv } from '$lib/server/env';

/** Session cookie name. Distinct per app; not `__Host-` prefixed because the LAN
 *  origin is plain HTTP and a `__Host-` cookie requires Secure. */
export const SESSION_COOKIE = 'grow_session';

/** Rolling session lifetime — 30 days. Renewed on use (see sessions.ts). */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** Minimum length for a local/fallback password. */
export const MIN_PASSWORD_LENGTH = 8;

/** Days of `auth_audit` history to keep. The daily maintenance timer deletes
 *  older rows. 0 disables age pruning (retain indefinitely). */
export const DEFAULT_AUTH_AUDIT_RETENTION_DAYS = 90;

/** Hard cap on `auth_audit` rows — the newest N survive the daily sweep, so the
 *  table stays bounded even if an unauthenticated client floods `login.failed`
 *  within the retention window. 0 disables the cap. */
export const DEFAULT_AUTH_AUDIT_MAX_ROWS = 50_000;

/** Max `POST /auth/login` attempts allowed per client IP within the rate window
 *  before the endpoint answers 429 without running scrypt. 0 disables per-IP
 *  throttling. See login-throttle.ts and #34. */
export const DEFAULT_LOGIN_RATE_MAX = 10;

/** Length of the fixed per-IP login rate window, in seconds. */
export const DEFAULT_LOGIN_RATE_WINDOW_SECONDS = 60;

/** Cap on concurrent scrypt derivations the login path will run at once. The
 *  libuv threadpool defaults to 4 threads, so this bounds how much of it a login
 *  burst can occupy even when every attempt shares one proxy IP. 0 disables the
 *  cap. */
export const DEFAULT_LOGIN_MAX_INFLIGHT = 8;

export interface BootstrapAdmin {
  username: string;
  /** Plaintext bootstrap password (hashed on first boot). Mutually exclusive
   *  with `passwordHash` in practice; if both are set the hash wins. */
  password?: string;
  /** Pre-computed `scrypt$…` hash, for deployments that don't want to hand the
   *  app a plaintext password even once. */
  passwordHash?: string;
}

export function getAuthDbPath(): string {
  return env('GROW_AUTH_DB') ?? './data/auth.db';
}

export function getAuthAuditRetentionDays(): number {
  return intEnv('GROW_AUTH_AUDIT_RETENTION_DAYS', DEFAULT_AUTH_AUDIT_RETENTION_DAYS);
}

export function getAuthAuditMaxRows(): number {
  return intEnv('GROW_AUTH_AUDIT_MAX_ROWS', DEFAULT_AUTH_AUDIT_MAX_ROWS);
}

export function getLoginRateMax(): number {
  return intEnv('GROW_AUTH_LOGIN_RATE_MAX', DEFAULT_LOGIN_RATE_MAX);
}

export function getLoginRateWindowSeconds(): number {
  return intEnv('GROW_AUTH_LOGIN_RATE_WINDOW_SECONDS', DEFAULT_LOGIN_RATE_WINDOW_SECONDS);
}

export function getLoginMaxInflight(): number {
  return intEnv('GROW_AUTH_LOGIN_MAX_INFLIGHT', DEFAULT_LOGIN_MAX_INFLIGHT);
}

export function getBootstrapAdmin(): BootstrapAdmin {
  return {
    username: env('GROW_AUTH_ADMIN_USERNAME') ?? 'admin',
    password: secretEnv('GROW_AUTH_ADMIN_PASSWORD'),
    passwordHash: secretEnv('GROW_AUTH_ADMIN_PASSWORD_HASH')
  };
}

export interface OidcConfigEnv {
  issuer?: string;
  clientId?: string;
  clientSecret?: string;
}

/** OIDC client settings from the environment. Absent values => OIDC disabled. */
export function getOidcConfigEnv(): OidcConfigEnv {
  return {
    issuer: env('GROW_OIDC_ISSUER'),
    clientId: env('GROW_OIDC_CLIENT_ID'),
    clientSecret: secretEnv('GROW_OIDC_CLIENT_SECRET', { optional: true })
  };
}

/** Space-separated OIDC scopes requested at authorize. `openid` is mandatory;
 *  `profile`/`email` populate display name + a username fallback. */
export function getOidcScopes(): string {
  return env('GROW_OIDC_SCOPES') ?? 'openid profile email';
}

/**
 * Allowed origins the OIDC flow may run on — the public site URL plus any LAN
 * origins, comma-separated in `GROW_AUTH_ORIGINS`. This is the access control for
 * the callback `redirect_uri`, so it is enforced fail-closed: an empty list means
 * no origin is accepted and SSO stays disabled (see `isSsoEnabled`). Each entry is
 * a bare scheme://host[:port] with any trailing slash trimmed.
 */
export function getAllowedOrigins(): string[] {
  return (env('GROW_AUTH_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/** Per-request HTTP timeout (seconds) for the IdP calls openid-client makes
 *  (discovery, token, JWKS). Kept short so a hung IdP fails the login fast instead
 *  of stalling the request. `GROW_OIDC_HTTP_TIMEOUT_MS` is in milliseconds. */
export function getOidcHttpTimeoutSeconds(): number {
  return intEnv('GROW_OIDC_HTTP_TIMEOUT_MS', 5000) / 1000;
}

/** Allow OIDC over plain HTTP (skip openid-client's HTTPS-only check for the
 *  issuer). Default false. Only for development/testing or a trusted LAN-only IdP;
 *  a public issuer must be HTTPS. */
export function getOidcAllowInsecureIssuer(): boolean {
  return env('GROW_OIDC_ALLOW_INSECURE_ISSUER') === 'true';
}

/** Whether the "Sign in with SSO" path is available. True only when the issuer,
 *  client id, and client secret are all set AND at least one allowed origin is
 *  configured — the origin allowlist is mandatory (fail-closed) because it gates
 *  the callback redirect_uri. `/api/me` and the login page read this to show/hide
 *  the SSO button. */
export function isSsoEnabled(): boolean {
  const { issuer, clientId, clientSecret } = getOidcConfigEnv();
  return Boolean(issuer && clientId && clientSecret) && getAllowedOrigins().length > 0;
}

/** Short-lived cookie holding the in-flight OIDC auth-code exchange state (PKCE
 *  verifier, state, nonce, the exact redirect_uri, and the post-login `next`).
 *  HttpOnly + one-time-use: deleted on callback. */
export const OIDC_TX_COOKIE = 'grow_oidc_tx';

/** Lifetime of the OIDC transaction cookie — long enough for a user to complete
 *  the IdP login, short enough to bound replay of an abandoned flow. */
export const OIDC_TX_MAX_AGE_SECONDS = 10 * 60;

/** Cookie options for the OIDC transaction cookie. Same per-request `secure`
 *  reasoning as the session cookie; SameSite=Lax so it survives the top-level
 *  redirect back from the IdP. */
export function oidcTxCookieOptions(secure: boolean): SessionCookieOptions {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: OIDC_TX_MAX_AGE_SECONDS
  };
}

/** Cookie options for the session cookie. `secure` is decided per-request from
 *  the URL protocol: the public origin is HTTPS (behind Pangolin, seen via
 *  x-forwarded-proto) and the LAN origin is plain HTTP — a hard-coded
 *  `secure: true` would make the browser silently drop the LAN cookie. */
export interface SessionCookieOptions {
  path: string;
  httpOnly: boolean;
  sameSite: 'lax';
  secure: boolean;
  maxAge: number;
}

/**
 * Whether the client reached us over HTTPS. TLS always terminates upstream
 * (Pangolin/Traefik) — the app itself only ever speaks plain HTTP — so the
 * forwarded protocol header is the only trustworthy signal. Do NOT use
 * `event.url.protocol` for this: adapter-node defaults it to `https:` when no
 * ORIGIN/PROTOCOL_HEADER is configured, so plain-HTTP LAN requests would get a
 * Secure cookie the browser then silently drops. A LAN client spoofing the
 * header only mis-flags its own cookie.
 */
export function isSecureRequest(headers: Pick<Headers, 'get'>): boolean {
  const forwarded = headers.get('x-forwarded-proto');
  if (!forwarded) return false;
  return forwarded.split(',')[0].trim().toLowerCase() === 'https';
}

export function sessionCookieOptions(secure: boolean): SessionCookieOptions {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: SESSION_MAX_AGE_SECONDS
  };
}
