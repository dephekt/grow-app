import { redirect } from '@sveltejs/kit';

/** Only allow same-site absolute paths as a post-login redirect target, to avoid
 *  an open redirect via `?next=`. */
function sanitizeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
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
