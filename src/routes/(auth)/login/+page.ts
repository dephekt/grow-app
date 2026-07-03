import { redirect } from '@sveltejs/kit';

/** Only allow same-site absolute paths as a post-login redirect target, to avoid
 *  an open redirect via `?next=`. Rejects protocol-relative (`//host`) and its
 *  backslash-normalised variant (`/\host` / `/%5Chost`) — browsers treat `\` as
 *  `/`, so both escape to a foreign origin. Also strips ASCII tab/newline first:
 *  the WHATWG URL parser removes `\t`, `\n`, `\r` while resolving a URL, so a
 *  value like `/<tab>/host` (`?next=/%09/host`) would otherwise collapse to
 *  `//host` after this check and escape too. Validating the stripped string
 *  matches exactly what the browser will navigate to. */
function sanitizeNext(raw: string | null): string {
  if (!raw) return '/';
  const path = raw.replace(/[\t\n\r]/g, '');
  if (path[0] !== '/' || path[1] === '/' || path[1] === '\\') return '/';
  return path;
}

export const load = async ({ fetch, url }) => {
  const next = sanitizeNext(url.searchParams.get('next'));

  let user: unknown = null;
  let ssoEnabled = false;
  try {
    const response = await fetch('/api/me');
    if (response.ok) {
      const body = (await response.json()) as { user: unknown; ssoEnabled?: boolean };
      user = body.user;
      ssoEnabled = body.ssoEnabled === true;
    }
  } catch {
    // treat as anonymous
  }

  // Note: redirect() throws — keep it out of the try/catch above.
  if (user) redirect(307, next);

  return { next, ssoEnabled };
};
