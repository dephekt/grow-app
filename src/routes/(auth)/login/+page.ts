import { redirect } from '@sveltejs/kit';

/** Only allow same-site absolute paths as a post-login redirect target, to avoid
 *  an open redirect via `?next=`. Rejects protocol-relative (`//host`) and its
 *  backslash-normalised variant (`/\host` / `/%5Chost`) — browsers treat `\` as
 *  `/`, so both escape to a foreign origin. */
function sanitizeNext(raw: string | null): string {
  if (!raw || raw[0] !== '/' || raw[1] === '/' || raw[1] === '\\') return '/';
  return raw;
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
