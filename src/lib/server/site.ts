import { env } from '$lib/server/env';

/** The site slug (`GROW_SITE`), defaulting to `daniel-home`. Single source of
 *  the default shared by MQTT topic prefixes, the InfluxDB bucket fallback, and
 *  the history recorder client id — and, once OIDC lands, the group scope
 *  (`/grow/sites/<slug>`). */
export function getSiteSlug(): string {
  return env('GROW_SITE') ?? 'daniel-home';
}
