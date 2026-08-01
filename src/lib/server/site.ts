// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { env } from '$lib/server/env';

/** The site slug (`GROW_SITE`), defaulting to `daniel-home`. Single source of
 *  the default shared by MQTT topic prefixes, the InfluxDB bucket fallback, and
 *  the history recorder client id — and, once OIDC lands, the group scope
 *  (`/grow-site-<slug>`). */
export function getSiteSlug(): string {
  return env('GROW_SITE') ?? 'daniel-home';
}
