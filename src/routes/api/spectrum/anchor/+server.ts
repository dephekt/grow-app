import { json, error, type RequestHandler } from '@sveltejs/kit';
import { getSiteMqttService } from '$lib/server/mqtt/service';
import { getAnchors, setAnchor, clearAnchor } from '$lib/server/spectrum/anchor';
import { luxToAnchor, referenceAnchor, type AnchorCalibration, type AnchorSource } from '$lib/spectrum/calibration';

interface AnchorRequest {
  source?: AnchorSource;
  /** source:'lux' — explicit lux (else the live DLight/BH1750 reading is used). */
  lux?: number;
  /** source:'reference' — the quantum-meter µmol reading (e.g. Apogee SQ-521). */
  referenceUmol?: number;
  range?: 'par' | 'epar';
  tolerancePct?: number;
}

export const GET: RequestHandler = async () => {
  return json({ ok: true, anchors: getAnchors() });
};

// Anchor the absolute PPFD scale to the CURRENT live frame. Never trust a client-sent spectrum —
// we read the authoritative in-memory frame (and, for lux, the live illuminance) server-side.
export const POST: RequestHandler = async ({ request }) => {
  const live = getSiteMqttService().latestSpectrum();
  if (!live) throw error(404, 'No live spectrum to anchor against');
  if (live.saturated) throw error(409, 'Live frame is saturated — dim the light or shorten exposure, then retry');
  if (!live.integrationUs || live.integrationUs <= 0) throw error(409, 'Live frame has no integration time yet');

  const body = (await request.json().catch(() => ({}))) as AnchorRequest;
  const source: AnchorSource = body.source ?? 'lux';
  const capturedAt = new Date().toISOString();

  let anchor: AnchorCalibration;
  if (source === 'lux') {
    // Explicit lux wins (e.g. a handheld meter); otherwise use the fleet's live illuminance.
    let lux = Number(body.lux);
    let meter: string | undefined;
    if (!Number.isFinite(lux) || lux <= 0) {
      const live_lux = getSiteMqttService().latestIlluminance();
      if (!live_lux) throw error(409, 'No live illuminance available — pass an explicit `lux`');
      lux = live_lux.lux;
      meter = 'bh1750-dlight';
    }
    if (!(lux > 0)) throw error(400, 'lux must be a positive number');
    anchor = luxToAnchor(live.counts, live.integrationUs, lux, { capturedAt, meter, tolerancePct: body.tolerancePct });
  } else {
    const umol = Number(body.referenceUmol);
    if (!Number.isFinite(umol) || umol <= 0) throw error(400, 'referenceUmol must be a positive number');
    anchor = referenceAnchor(live.counts, live.integrationUs, umol, body.range ?? 'par', {
      capturedAt,
      tolerancePct: body.tolerancePct
    });
  }

  const anchors = setAnchor(anchor);
  return json({ ok: true, anchor, anchors }, { status: 201 });
};

// Clear one anchor by source (?source=lux|reference), default lux.
export const DELETE: RequestHandler = async ({ url }) => {
  const source = (url.searchParams.get('source') as AnchorSource) ?? 'lux';
  if (source !== 'lux' && source !== 'reference') throw error(400, 'source must be lux or reference');
  return json({ ok: true, anchors: clearAnchor(source) });
};
