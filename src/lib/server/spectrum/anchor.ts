import { getSettingsDb } from '$lib/server/settings/db';
import type { AnchorCalibration, AnchorSource, SpectroConfig } from '$lib/spectrum/calibration';

// The active PPFD calibration anchors, persisted in the generic app_settings key/value store
// (one row per source). Kept out of the module-level SPECTRO_CONFIG so the anchor survives
// restarts and so history reprocesses against the CURRENT calibration — and so the lux estimate
// and the Apogee reference coexist rather than overwrite. Threaded into processSpectrum via
// `opts.config.anchors` at every call site (ingest, capture reprocess, client re-derive).

type Anchors = SpectroConfig['anchors'];

const KEY: Record<AnchorSource, string> = {
  lux: 'spectrum.anchor.lux',
  reference: 'spectrum.anchor.reference'
};

// Cache the parsed anchors; invalidated on every write. One process owns the web app.
let cache: Anchors | null = null;

function readAnchor(source: AnchorSource): AnchorCalibration | undefined {
  const row = getSettingsDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(KEY[source]) as
    | { value: string }
    | undefined;
  if (!row) return undefined;
  try {
    return JSON.parse(row.value) as AnchorCalibration;
  } catch {
    return undefined;
  }
}

/** The active anchors ({} when uncalibrated). Pass straight into `processSpectrum({ config: { anchors } })`. */
export function getAnchors(): Anchors {
  if (cache) return cache;
  const lux = readAnchor('lux');
  const reference = readAnchor('reference');
  cache = { ...(lux ? { lux } : {}), ...(reference ? { reference } : {}) };
  return cache;
}

/** Persist (upsert) one anchor by its source, returning the full anchor set. */
export function setAnchor(anchor: AnchorCalibration): Anchors {
  getSettingsDb()
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(KEY[anchor.source], JSON.stringify(anchor), new Date().toISOString());
  cache = null;
  return getAnchors();
}

/** Drop one anchor by source, returning the remaining set. */
export function clearAnchor(source: AnchorSource): Anchors {
  getSettingsDb().prepare('DELETE FROM app_settings WHERE key = ?').run(KEY[source]);
  cache = null;
  return getAnchors();
}
