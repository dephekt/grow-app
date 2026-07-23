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
  // integrationUs may be 0 when the firmware's auto-exposure bottoms out under a bright light; that's a
  // valid short exposure (calibration treats 0 as the sensor minimum), so it is NOT a blocker here.

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
    // Explicit µmol wins (a typed reading); otherwise read the live Apogee SQ-521 server-side —
    // never trust a client-sent value, mirroring the lux branch's latestIlluminance() fallback.
    let umol = Number(body.referenceUmol);
    let meter: string | undefined;
    // A typed reading may be against either window; the live Apogee value is definitionally PAR.
    let range: 'par' | 'epar' = body.range ?? 'par';
    if (!Number.isFinite(umol) || umol <= 0) {
      const live_ppfd = getSiteMqttService().latestQuantumPpfd();
      if (!live_ppfd) throw error(409, 'No live Apogee reading available — pass an explicit `referenceUmol`');
      umol = live_ppfd.ppfd;
      meter = 'apogee-sq521';
      range = 'par'; // the SQ-521 is a PAR (400–700 nm) sensor — never bind it to a client ePAR window
    }
    if (!(umol > 0)) {
      throw error(
        400,
        meter ? 'Live Apogee reading is not positive (sensor dark?) — anchor under light' : 'referenceUmol must be a positive number'
      );
    }
    anchor = referenceAnchor(live.counts, live.integrationUs, umol, range, {
      capturedAt,
      meter,
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
