import { redirect } from '@sveltejs/kit';
import type { UserSummary } from '$lib/server/auth/users';

export const load = async ({ fetch }) => {
  const response = await fetch('/api/users');
  if (response.status === 401 || response.status === 403) {
    // Non-admins have no business here; the API is the real gate.
    redirect(307, '/');
  }
  const body = (await response.json()) as { users: UserSummary[] };
  return { users: body.users };
};
