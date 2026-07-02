import type { AuthenticatedUser } from '$lib/server/auth/users';

declare global {
  namespace App {
    interface Locals {
      /** The authenticated user for this request, or null when anonymous. Set by
       *  the auth guard in hooks.server.ts. */
      user: AuthenticatedUser | null;
    }
  }
}

export {};
