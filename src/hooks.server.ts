// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import type { Handle } from '@sveltejs/kit';
import { json, redirect } from '@sveltejs/kit';
import { getSiteMqttService } from '$lib/server/mqtt/service';
import { startOpenSprinklerDriver } from '$lib/server/opensprinkler/controller';
import { startIrrigationScheduler } from '$lib/server/opensprinkler/scheduler';
import { startRunoffMonitor } from '$lib/server/opensprinkler/runoff-monitor';
import { startIrrigationEnergyBackfill } from '$lib/server/opensprinkler/energy-backfill';
import { startClimateLoop } from '$lib/server/climate/loop';
import { warmSiteTimeZone } from '$lib/server/settings/site-timezone';
import { startSiteTimezoneReconciler } from '$lib/server/mqtt/tz-reconciler';
import { getAuthDb } from '$lib/server/auth/db';
import { ensureBootstrapAdmin, toAuthenticatedUser } from '$lib/server/auth/users';
import { lookupSession, renewIfNeeded } from '$lib/server/auth/sessions';
import { classifyPath, isApiOrAuthPath, isSafeMethod, isCsrfSafe } from '$lib/server/auth/guard';
import {
  SESSION_COOKIE,
  getBootstrapAdmin,
  isSecureRequest,
  sessionCookieOptions
} from '$lib/server/auth/config';

// SvelteKit awaits this module before handling any request, so the top-level await
// below completes bootstrap before the first login can arrive.
getSiteMqttService();
// Web app only — the read-only recorder warms the same MQTT singleton but must never
// publish/drive.
startOpenSprinklerDriver();
// Web app only; no-op unless the site is OpenSprinkler-enabled.
startIrrigationScheduler();
// Not gated on OpenSprinkler: the runoff plug is an independent ESPHome device.
startRunoffMonitor();
// Web app only; runs on a timer off the request path.
startIrrigationEnergyBackfill();
// Inert until armed: the shipped config leaves the fan to its firmware and only observes.
startClimateLoop();
// Web app only — the read-only recorder never opens the settings DB nor publishes.
try {
  warmSiteTimeZone();
} catch (error) {
  console.error('[tz] warming site time zone failed', error);
}
startSiteTimezoneReconciler();
const authDb = getAuthDb();
await ensureBootstrapAdmin(authDb, getBootstrapAdmin());

export const handle: Handle = async ({ event, resolve }) => {
  const { pathname, search } = event.url;

  // Best-effort session resolution for every request, so public endpoints like
  // /api/me and /login can see an already-authenticated user.
  const token = event.cookies.get(SESSION_COOKIE);
  const lookup = token ? lookupSession(authDb, token) : null;
  if (token && !lookup) {
    // Must match the per-request Secure flag used on set; SvelteKit's default Secure
    // deletion cookie is dropped by the browser on the plain-HTTP LAN origin.
    event.cookies.delete(SESSION_COOKIE, {
      path: '/',
      secure: isSecureRequest(event.request.headers)
    });
  }
  event.locals.user = lookup ? toAuthenticatedUser(lookup.user) : null;

  // CSRF: any mutating request to an /api or /auth endpoint must be same-origin JSON.
  if (isApiOrAuthPath(pathname) && !isSafeMethod(event.request.method)) {
    const contentType = event.request.headers.get('content-type');
    const secFetchSite = event.request.headers.get('sec-fetch-site');
    if (!isCsrfSafe(contentType, secFetchSite)) {
      return json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }
  }

  const cls = classifyPath(pathname);
  if (cls === 'protected' && !lookup) {
    if (isApiOrAuthPath(pathname)) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    const next = pathname + search;
    redirect(303, `/login?next=${encodeURIComponent(next)}`);
  }

  // Rolling renewal for an authenticated session near the end of its window.
  if (lookup) {
    const renewed = renewIfNeeded(authDb, lookup.sessionId, lookup.expiresAt);
    if (renewed && token) {
      event.cookies.set(
        SESSION_COOKIE,
        token,
        sessionCookieOptions(isSecureRequest(event.request.headers))
      );
    }
  }

  return resolve(event);
};
