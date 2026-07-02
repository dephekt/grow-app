/**
 * Pure request classification for the auth guard. Kept free of SvelteKit/Request
 * types so it unit-tests as plain functions.
 */

export type PathClass = 'public' | 'device-token' | 'protected';

// Reachable with no session. `/api/me` is public so the login page can read
// capabilities (and learn it's already authed) before a session exists.
// `/auth/login`, `/auth/oidc`, `/auth/oidc/callback` must run pre-session;
// `/auth/logout` and `/auth/password` are protected.
const PUBLIC_EXACT = new Set([
  '/health',
  '/favicon.ico',
  '/login',
  '/api/me',
  '/auth/login',
  '/auth/oidc',
  '/auth/oidc/callback'
]);

// Firmware endpoints a device hits with its own `?token=` (no cookie). The
// endpoints enforce the token themselves; the guard just doesn't require a session.
const DEVICE_TOKEN_PATTERNS = [
  /^\/api\/firmware\/devices\/[^/]+\/manifest\/?$/,
  /^\/api\/firmware\/devices\/[^/]+\/binary\/[^/]+\/?$/
];

export function classifyPath(pathname: string): PathClass {
  if (PUBLIC_EXACT.has(pathname)) return 'public';
  if (DEVICE_TOKEN_PATTERNS.some((re) => re.test(pathname))) return 'device-token';
  return 'protected';
}

/** GET/HEAD/OPTIONS carry no CSRF risk and skip the same-origin check. */
export function isSafeMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
}

/** True when a request should get a JSON 401 rather than an HTML redirect. */
export function isApiOrAuthPath(pathname: string): boolean {
  return pathname.startsWith('/api/') || pathname.startsWith('/auth/');
}

/**
 * Reject cross-site state-changing requests. Every mutating endpoint here takes
 * a same-origin JSON `fetch`, so we require `application/json` and, when the
 * browser sends `Sec-Fetch-Site`, that it isn't `cross-site`. Combined with a
 * SameSite=Lax cookie this stands in for a CSRF token.
 */
export function isCsrfSafe(contentType: string | null, secFetchSite: string | null): boolean {
  const jsonBody = (contentType ?? '').toLowerCase().includes('application/json');
  if (!jsonBody) return false;
  if (secFetchSite !== null && secFetchSite !== 'same-origin' && secFetchSite !== 'none') return false;
  return true;
}
