// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

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
