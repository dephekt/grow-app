import { redirect } from '@sveltejs/kit';
import { sanitizeNext } from '$lib/auth-redirect';

/** Map a `?error=` code from the OIDC callback to a user-facing message. */
function errorMessage(code: string | null): string | null {
  switch (code) {
    case 'sso':
      return 'SSO sign-in failed. Try again, or use your local password.';
    case 'forbidden':
      return "Your account isn't authorized for this site.";
    default:
      return null;
  }
}

export const load = async ({ fetch, url }) => {
  const next = sanitizeNext(url.searchParams.get('next'));
  const error = errorMessage(url.searchParams.get('error'));

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

  return { next, ssoEnabled, error };
};
