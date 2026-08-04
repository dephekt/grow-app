// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { env } from '$lib/server/env';

/** The site slug (`GROW_SITE`), defaulting to `daniel-home`. */
export function getSiteSlug(): string {
  return env('GROW_SITE') ?? 'daniel-home';
}
