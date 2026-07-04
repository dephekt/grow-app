/**
 * Only allow same-site absolute paths as a post-login redirect target, to avoid
 * an open redirect via `?next=`. Rejects protocol-relative (`//host`) and its
 * backslash-normalised variant (`/\host` / `/%5Chost`) — browsers treat `\` as
 * `/`, so both escape to a foreign origin. Also strips ASCII tab/newline first:
 * the WHATWG URL parser removes `\t`, `\n`, `\r` while resolving a URL, so a value
 * like `/<tab>/host` (`?next=/%09/host`) would otherwise collapse to `//host`
 * after this check and escape too. Validating the stripped string matches exactly
 * what the browser will navigate to.
 *
 * Kept in `$lib` (not `$lib/server`) and free of any secret/server import so it is
 * shared by both the universal login `load` and the server-only OIDC routes.
 */
export function sanitizeNext(raw: string | null): string {
  if (!raw) return '/';
  const path = raw.replace(/[\t\n\r]/g, '');
  if (path[0] !== '/' || path[1] === '/' || path[1] === '\\') return '/';
  return path;
}
