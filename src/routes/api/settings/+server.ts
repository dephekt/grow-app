import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/authz';
import { isValidTimeZone } from '$lib/server/tz/valid';
import {
  resolveSiteTimeZone,
  setSiteTimeZone,
  storedSiteTimeZone
} from '$lib/server/settings/site-timezone';
import { reconcileSiteTimezone } from '$lib/server/mqtt/tz-reconciler';
import { getSiteMqttService } from '$lib/server/mqtt/service';

// Admin: report the effective site zone, where it came from, the persisted override (if
// any), and the full IANA list the picker offers. IANA is the single source of truth; the
// derived POSIX never surfaces here.
export const GET: RequestHandler = ({ locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  const { zone, source } = resolveSiteTimeZone();
  return json({
    ok: true,
    timezone: zone,
    source,
    stored: storedSiteTimeZone() ?? null,
    zones: Intl.supportedValuesOf('timeZone')
  });
};

interface UpdateBody {
  timezone?: unknown;
}

// Admin: persist a new site zone, then immediately reconcile the derived POSIX onto every
// tz-capable device and re-emit a snapshot so connected clients see the new zone. The
// reconcile is best-effort — a down broker still returns 200 with a per-device report
// (failed entities bucketed), never a 500, so saving the setting can't be blocked on MQTT.
export const PUT: RequestHandler = async ({ request, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  let body: UpdateBody;
  try {
    body = (await request.json()) as UpdateBody;
  } catch {
    return json({ ok: false, error: 'Invalid request' }, { status: 400 });
  }

  const iana = typeof body.timezone === 'string' ? body.timezone.trim() : '';
  if (!iana || !isValidTimeZone(iana)) {
    return json({ ok: false, error: 'Invalid time zone' }, { status: 400 });
  }

  setSiteTimeZone(iana);
  const report = await reconcileSiteTimezone();
  getSiteMqttService().emitClientSnapshot();

  return json({ ok: true, timezone: iana, report });
};
