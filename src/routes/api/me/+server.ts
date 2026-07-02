import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isSsoEnabled } from '$lib/server/auth/config';

// Public: reports the current user (or null) plus auth capabilities, so the
// login page can render the right controls and the app shell can detect a lost
// session. The guard sets locals.user for every request.
export const GET: RequestHandler = ({ locals }) => {
  return json({ user: locals.user, ssoEnabled: isSsoEnabled() });
};
