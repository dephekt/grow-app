import { env, secretEnv } from '$lib/server/env';

/** Session cookie name. Distinct per app; not `__Host-` prefixed because the LAN
 *  origin is plain HTTP and a `__Host-` cookie requires Secure. */
export const SESSION_COOKIE = 'grow_session';

/** Rolling session lifetime — 30 days. Renewed on use (see sessions.ts). */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** Minimum length for a local/fallback password. */
export const MIN_PASSWORD_LENGTH = 8;

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

export function getBootstrapAdmin(): BootstrapAdmin {
  return {
    username: env('GROW_AUTH_ADMIN_USERNAME') ?? 'admin',
    password: secretEnv('GROW_AUTH_ADMIN_PASSWORD'),
    passwordHash: secretEnv('GROW_AUTH_ADMIN_PASSWORD_HASH')
  };
}

/** Whether the "Sign in with SSO" path is available. OIDC is wired in PR2; until
 *  then there is no callback route, so keep the button hidden even if an issuer
 *  env leaks onto a local-auth-only image. */
export function isSsoEnabled(): boolean {
  return false;
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
