// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/**
 * C12880MA calibration and physics, applied on read so stored raw counts reprocess with it.
 * Band metrics are a plain fractional sum of counts, NOT Σ counts·Δλ — a grating pixel already
 * integrates over its bin.
 */

export const PIXEL_COUNT = 288;

export interface WavelengthCoeffs {
  a0: number;
  b1: number;
  b2: number;
  b3: number;
  b4: number;
  b5: number;
}

/** Where an anchor's absolute scale came from — a co-incident lux meter (an ESTIMATE,
 *  ~±15%) or a quantum reference like the Apogee SQ-521 (~±5%). */
export type AnchorSource = 'lux' | 'reference';

export interface AnchorCalibration {
  /** Reference PPFD/ePAR reading, µmol·m⁻²·s⁻¹ (measured by the Apogee, or DERIVED from a
   *  lux reading via V(λ) for source:'lux'). */
  referenceUmol: number;
  /** Window the reference integrated over. */
  referenceRange: 'par' | 'epar';
  /** This module's per-µs PHOTON band integral over referenceRange for the anchor frame
   *  (units cancel into the scale factor). */
  rawIntegral: number;
  /** Provenance of the scale. */
  source: AnchorSource;
  /** ISO time this anchor was captured. */
  capturedAt: string;
  /** For source:'lux' — the illuminance (lux) it was derived from. */
  luxValue?: number;
  /** Instrument label, e.g. 'bh1750-dlight' | 'apogee-sq521'. */
  meter?: string;
  /** ± tolerance (%) to surface in the UI (lux ≈15, reference ≈5). */
  tolerancePct?: number;
}

/** One absolute flux reading, tagged by which anchor produced it. */
export interface FluxReading {
  source: AnchorSource;
  /** µmol·m⁻²·s⁻¹ over PAR (≡ ppfd). */
  ppfd: number;
  par: number;
  epar: number;
  tolerancePct: number;
}

/** How to express the spectrum: raw sensor counts, photon flux (÷S), or energy (÷S·λ). */
export type SpectrumView = 'raw' | 'photon' | 'energy';

/** The ONE place to edit when the real Hamamatsu sheet / Apogee anchor arrive. */
export interface SpectroConfig {
  coeffs: WavelengthCoeffs;
  /** Stored dark frame (LED off, same integration), subtracted per-pixel; null = auto baseline. */
  darkFrame: number[] | null;
  /** Absolute-scale anchors, by source; an absent anchor leaves that flux reading null. */
  anchors: { lux?: AnchorCalibration; reference?: AnchorCalibration };
}

// Per-unit wavelength calibration from THIS sensor's Hamamatsu final-inspection sheet
// (C12880MA serial 24K00807): Wavelength[nm] = A0 + B1·pix + B2·pix² + B3·pix³ + B4·pix⁴ + B5·pix⁵,
// pix 1-based.
export const WAVELENGTH_COEFFS: WavelengthCoeffs = {
  a0: 3.150586915e2,
  b1: 2.69975988,
  b2: -1.273387434e-3,
  b3: -5.969853279e-6,
  b4: 8.036360792e-10,
  b5: 1.888117397e-11
};

// Runtime calibration config — the single place to swap in real per-unit calibration (the
// wavelength sheet into WAVELENGTH_COEFFS, the Apogee anchor into `anchor`).
export const SPECTRO_CONFIG: SpectroConfig = {
  coeffs: WAVELENGTH_COEFFS,
  darkFrame: null,
  anchors: {}
};

/** Pixel→wavelength (nm); p is 1-BASED per the Hamamatsu formula, so counts[i] is pixel p=i+1. */
export function pixelToWavelength(p: number, c: WavelengthCoeffs = WAVELENGTH_COEFFS): number {
  return c.a0 + c.b1 * p + c.b2 * p * p + c.b3 * p ** 3 + c.b4 * p ** 4 + c.b5 * p ** 5;
}

// The per-unit Hamamatsu coefficients are authoritative, so the wavelength axis is a direct
// application of pixelToWavelength — no empirical post-fit.
export const WAVELENGTHS: number[] = Array.from({ length: PIXEL_COUNT }, (_, i) =>
  pixelToWavelength(i + 1)
);

// Per-pixel bin edges (midpoints between neighbouring wavelengths; extrapolated at
// the two ends) and widths — the correct use of Δλ: boundary apportionment.
const LOWER_EDGE: number[] = new Array(PIXEL_COUNT);
const UPPER_EDGE: number[] = new Array(PIXEL_COUNT);
const DELTA_LAMBDA: number[] = new Array(PIXEL_COUNT);
for (let i = 0; i < PIXEL_COUNT; i++) {
  const w = WAVELENGTHS[i];
  const prev = i > 0 ? WAVELENGTHS[i - 1] : w - (WAVELENGTHS[i + 1] - w);
  const next = i < PIXEL_COUNT - 1 ? WAVELENGTHS[i + 1] : w + (w - WAVELENGTHS[i - 1]);
  LOWER_EDGE[i] = (prev + w) / 2;
  UPPER_EDGE[i] = (w + next) / 2;
  DELTA_LAMBDA[i] = UPPER_EDGE[i] - LOWER_EDGE[i];
}

// C12880MA relative spectral sensitivity S(λ), digitized from Hamamatsu KACC1226E p.3 and
// validated on this unit to ~4% against an incandescent blackbody fit.
const C12880MA_SENSITIVITY: ReadonlyArray<readonly [number, number]> = [
  [340, 0.53],
  [360, 0.68],
  [380, 0.85],
  [400, 0.95],
  [420, 0.92],
  [440, 0.96],
  [460, 0.99],
  [480, 1.0],
  [500, 0.99],
  [520, 0.96],
  [540, 0.93],
  [560, 0.88],
  [580, 0.83],
  [600, 0.76],
  [620, 0.7],
  [640, 0.64],
  [660, 0.58],
  [680, 0.53],
  [700, 0.48],
  [720, 0.42],
  [740, 0.37],
  [760, 0.31],
  [780, 0.26],
  [800, 0.2],
  [820, 0.15],
  [840, 0.11],
  [850, 0.1]
];

function sensitivityAt(nm: number): number {
  const pts = C12880MA_SENSITIVITY;
  if (nm <= pts[0][0]) return pts[0][1];
  const last = pts[pts.length - 1];
  if (nm >= last[0]) return last[1];
  for (let i = 1; i < pts.length; i++) {
    if (nm <= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return y0 + ((y1 - y0) * (nm - x0)) / (x1 - x0);
    }
  }
  return last[1];
}

// Per-pixel response boost 1/S(λ), capped so the low-response NIR tail can't amplify noise.
const RESPONSE_BOOST_CAP = 4;
const RESPONSE_BOOST: number[] = WAVELENGTHS.map((nm) =>
  Math.min(RESPONSE_BOOST_CAP, 1 / Math.max(sensitivityAt(nm), 1e-3))
);

/** Re-express dark-subtracted counts in a view: raw (sensor counts), photon (÷S — µmol domain,
 *  what plants count), or energy (÷(S·λ) — W/nm, matches manufacturer SPD charts). */
function applyView(corrected: number[], view: SpectrumView): number[] {
  if (view === 'raw') return corrected;
  const out = new Array<number>(PIXEL_COUNT);
  for (let i = 0; i < PIXEL_COUNT; i++) {
    const photon = corrected[i] * RESPONSE_BOOST[i];
    out[i] = view === 'energy' ? photon / WAVELENGTHS[i] : photon;
  }
  return out;
}

// Horticulture bands (nm), aligned to Pulse's Blue/Green/Red/IR tiles.
const BANDS = { blue: [400, 500], green: [500, 600], red: [600, 700], farRed: [700, 750] } as const;
const PAR: [number, number] = [400, 700];
const EPAR: [number, number] = [400, 750];

// First few pixels of the C12880MA are dummy/optically-black — never real signal.
const DUMMY_PIXELS = 5;

// The firmware reports `integration_us` as the ADDED delay only, so 0 is a valid short exposure
// rather than a missing one.
export const MIN_INTEGRATION_US = 500;

/** Integration time to normalize by: the reported value, or the sensor minimum when firmware reports 0. */
function effectiveIntegrationUs(us: number | undefined): number {
  return us && us > 0 ? us : MIN_INTEGRATION_US;
}

// CIE 1931 2° photopic V(λ), which is what a lux meter integrates — so lux converts to µmol
// using this spectrum's own shape.
const PHOTOPIC_V: ReadonlyArray<readonly [number, number]> = [
  [380, 0.00004],
  [400, 0.0004],
  [420, 0.004],
  [440, 0.023],
  [460, 0.06],
  [480, 0.139],
  [500, 0.323],
  [520, 0.71],
  [540, 0.954],
  [555, 1.0],
  [560, 0.995],
  [580, 0.87],
  [600, 0.631],
  [620, 0.381],
  [640, 0.175],
  [660, 0.061],
  [680, 0.017],
  [700, 0.0041],
  [720, 0.00105],
  [740, 0.00025],
  [760, 0.00006],
  [780, 0.000015]
];

function photopicAt(nm: number): number {
  const pts = PHOTOPIC_V;
  if (nm <= pts[0][0]) return pts[0][1];
  const last = pts[pts.length - 1];
  if (nm >= last[0]) return last[1];
  for (let i = 1; i < pts.length; i++) {
    if (nm <= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return y0 + ((y1 - y0) * (nm - x0)) / (x1 - x0);
    }
  }
  return last[1];
}

// lux = LUMENS_PER_WATT · (N_A·h·c) · 1e3 · Σ(photon·V/λ[nm]) / (sensor_gain·integ), whose Σ is
// scale-invariant so the ratio lux/PPFD is fixed by the spectrum alone.
const LUMENS_PER_WATT = 683; // peak luminous efficacy of radiation (at 555 nm)
const NA_HC = 0.11962656; // N_A·h·c, J·m·mol⁻¹ — energy per mole of photons, times λ[m]
const LUX_PER_UMOL_K = LUMENS_PER_WATT * NA_HC * 1e3; // ≈ 81705; the 1e3 folds µmol→mol (1e-6) and λ nm→m (1e9)

/** Σ photon·V(λ)/λ over the frame — the luminous (photopic) weight whose ratio to the PAR photon
 *  sum fixes lux↔µmol for this spectrum. */
function photopicSum(photon: number[]): number {
  let s = 0;
  for (let i = DUMMY_PIXELS; i < PIXEL_COUNT; i++)
    s += (photon[i] * photopicAt(WAVELENGTHS[i])) / WAVELENGTHS[i];
  return s;
}

export interface ProcessedSpectrum {
  /** 0..100 relative power in the active `view`, max→100, index-aligned to the module's
   *  WAVELENGTHS constant. */
  relative: number[];
  /** Peak wavelength (nm), or null for a blank/all-dark frame (no signal above the baseline). */
  peakWavelengthNm: number | null;
  /** Wavelengths (nm) of the prominent local maxima, low→high (e.g. the blue and red peaks of a
   *  horticulture LED) — for chart labels. */
  peaks: number[];
  /** Which lens `relative`/`peaks`/`bands` are expressed in. */
  view: SpectrumView;
  /** Band shares (%) in the active view, summing to 100 across the four bands. */
  bands: { blue: number; green: number; red: number; farRed: number };
  /** Estimated flux from the lux anchor (~±15%) — null until a lux anchor is set / when saturated. */
  lux: FluxReading | null;
  /** Reference flux from the Apogee anchor (~±5%) — null until a reference anchor is set / when saturated. */
  reference: FluxReading | null;
  /** Which source drives the primary (`par`/`epar`/`ppfd`) fields — reference wins when present. */
  ppfdSource: AnchorSource | null;
  /** Primary absolute µmol·m⁻²·s⁻¹ (reference if set, else lux estimate) — null until anchored/when saturated. */
  par: number | null;
  epar: number | null;
  ppfd: number | null;
  /** Far-red extension factor ∫photon(400–750)/∫photon(400–700) for this frame (≥ 1); null when
   *  saturated or there's no PAR-band signal. */
  farRedRatio: number | null;
  calibrated: boolean;
  saturated: boolean;
}

export interface ProcessOptions {
  /** Per-call dark frame override (else config.darkFrame else auto baseline). */
  dark?: number[];
  /** Required for ABSOLUTE outputs (per-µs normalization); ignored for relative/shares. */
  integrationUs?: number;
  /** Firmware saturation flag; also auto-detected from adcFullScale. */
  saturated?: boolean;
  /** Full-scale ADC value ((1<<adc_bits)-1). Default 16383 (14-bit R4). */
  adcFullScale?: number;
  /** Lens for relative/peaks/bands: 'photon' (default, µmol), 'energy' (W/nm), or 'raw' — absolute
   *  PPFD is always photon regardless. */
  view?: SpectrumView;
  /** Live DLight illuminance (lux); with a lux anchor set, the lux flux reading is derived from
   *  lux × (µmol/lux factor) instead of frame counts. */
  liveLux?: number;
  /** Re-process a stored raw frame under a different calibration without mutating the global. */
  config?: Partial<SpectroConfig>;
}

/** Fractional-overlap sum of per-bin counts over [a,b]: interior pixels contribute
 *  in full, the two boundary pixels by the fraction of their bin inside [a,b]. */
function bandIntegral(corrected: number[], a: number, b: number): number {
  let sum = 0;
  for (let i = DUMMY_PIXELS; i < PIXEL_COUNT; i++) {
    const overlap = Math.min(UPPER_EDGE[i], b) - Math.max(LOWER_EDGE[i], a);
    if (overlap > 0) sum += corrected[i] * (overlap / DELTA_LAMBDA[i]);
  }
  return sum;
}

/** The single dark-subtraction path, so live and anchor calibration cannot drift apart. */
function toCorrected(rawCounts: number[], cfg: SpectroConfig, dark?: number[]): number[] {
  const counts =
    rawCounts.length === PIXEL_COUNT
      ? rawCounts
      : Array.from({ length: PIXEL_COUNT }, (_, i) => rawCounts[i] ?? 0);

  const darkFrame = dark ?? cfg.darkFrame;
  let baseline = 0;
  if (!darkFrame) {
    const body = counts.slice(DUMMY_PIXELS).sort((a, b) => a - b);
    const n = Math.max(1, Math.floor(body.length / 10));
    baseline = body.slice(0, n).reduce((s, v) => s + v, 0) / n;
  }

  const corrected = new Array<number>(PIXEL_COUNT);
  for (let i = 0; i < PIXEL_COUNT; i++) {
    corrected[i] =
      i < DUMMY_PIXELS ? 0 : Math.max(0, counts[i] - (darkFrame ? darkFrame[i] : baseline));
  }
  return corrected;
}

/** Prominent local maxima of the relative curve (the blue/red LED peaks, etc.), as wavelengths
 *  low→high. */
function findPeaks(relative: number[]): number[] {
  const MIN_HEIGHT = 20;
  const MIN_SEP_NM = 30;
  const WINDOW = 6;
  const candidates: Array<{ nm: number; h: number }> = [];
  for (let i = DUMMY_PIXELS; i < relative.length; i++) {
    const h = relative[i];
    if (h < MIN_HEIGHT) continue;
    const lo = Math.max(DUMMY_PIXELS, i - WINDOW);
    const hi = Math.min(relative.length - 1, i + WINDOW);
    let isMax = true;
    for (let j = lo; j <= hi; j++) {
      if (relative[j] > h) {
        isMax = false;
        break;
      }
    }
    if (isMax) candidates.push({ nm: WAVELENGTHS[i], h });
  }
  candidates.sort((a, b) => b.h - a.h);
  const kept: Array<{ nm: number; h: number }> = [];
  for (const c of candidates) {
    if (kept.every((k) => Math.abs(k.nm - c.nm) >= MIN_SEP_NM)) kept.push(c);
    if (kept.length >= 3) break;
  }
  return kept.map((k) => k.nm).sort((a, b) => a - b);
}

/** PAR PPFD (µmol·m⁻²·s⁻¹) implied by a live lux reading via a lux anchor's banked µmol/lux factor,
 *  or null when the anchor/lux can't supply it. */
export function luxToPpfd(
  lux: number | null | undefined,
  anchor: AnchorCalibration | undefined
): number | null {
  if (!anchor || !(anchor.luxValue != null && anchor.luxValue > 0) || !(anchor.referenceUmol > 0))
    return null;
  if (lux == null || lux <= 0) return null;
  return lux * (anchor.referenceUmol / anchor.luxValue);
}

/** Turn raw counts into a display-ready + (optionally) calibrated spectrum. */
export function processSpectrum(rawCounts: number[], opts: ProcessOptions = {}): ProcessedSpectrum {
  const cfg: SpectroConfig = { ...SPECTRO_CONFIG, ...opts.config };
  const adcFullScale = opts.adcFullScale ?? 16383;
  const view = opts.view ?? 'photon';
  // Skip the optically-black dummy pixels — a dark-offset spike there is not real saturation.
  const saturated =
    opts.saturated || rawCounts.some((v, i) => i >= DUMMY_PIXELS && v >= adcFullScale);

  const corrected = toCorrected(rawCounts, cfg, opts.dark);
  const display = applyView(corrected, view);

  let mx = 0;
  let peakIdx = DUMMY_PIXELS;
  for (let i = DUMMY_PIXELS; i < PIXEL_COUNT; i++) {
    if (display[i] > mx) {
      mx = display[i];
      peakIdx = i;
    }
  }
  const relative = display.map((c) => (mx > 0 ? (100 * c) / mx : 0));
  const peaks = findPeaks(relative);

  const iBlue = bandIntegral(display, BANDS.blue[0], BANDS.blue[1]);
  const iGreen = bandIntegral(display, BANDS.green[0], BANDS.green[1]);
  const iRed = bandIntegral(display, BANDS.red[0], BANDS.red[1]);
  const iFarRed = bandIntegral(display, BANDS.farRed[0], BANDS.farRed[1]);
  const total = iBlue + iGreen + iRed + iFarRed;
  const bands = {
    blue: total > 0 ? (100 * iBlue) / total : 0,
    green: total > 0 ? (100 * iGreen) / total : 0,
    red: total > 0 ? (100 * iRed) / total : 0,
    farRed: total > 0 ? (100 * iFarRed) / total : 0
  };

  // Absolute PPFD/ePAR is always the PHOTON view (µmol), per-µs normalized.
  let lux: FluxReading | null = null;
  let reference: FluxReading | null = null;
  let farRedRatio: number | null = null;
  const integ = effectiveIntegrationUs(opts.integrationUs);
  if (!saturated) {
    const photon = view === 'photon' ? display : applyView(corrected, 'photon');
    // ePAR/PAR shape ratio — scale-invariant, so exposure and dimming cancel.
    const parPhoton = bandIntegral(photon, PAR[0], PAR[1]);
    farRedRatio = parPhoton > 0 ? bandIntegral(photon, EPAR[0], EPAR[1]) / parPhoton : null;
    // Absolute flux from an anchor using THIS frame's per-µs photon rate (counts ÷ exposure).
    const flux = (a: AnchorCalibration): FluxReading | null => {
      if (!(a.rawIntegral > 0)) return null;
      const scale = a.referenceUmol / a.rawIntegral;
      const par = (scale * bandIntegral(photon, PAR[0], PAR[1])) / integ;
      const epar = (scale * bandIntegral(photon, EPAR[0], EPAR[1])) / integ;
      return {
        source: a.source,
        ppfd: par,
        par,
        epar,
        tolerancePct: a.tolerancePct ?? (a.source === 'lux' ? 15 : 5)
      };
    };
    if (cfg.anchors.lux) {
      const a = cfg.anchors.lux;
      const liveLuxPpfd = luxToPpfd(opts.liveLux, a);
      if (liveLuxPpfd != null) {
        // From live lux × the anchor's µmol/lux, not this frame's counts, so a stuck auto-exposure
        // frame cannot drag the reading toward zero.
        const pPar = bandIntegral(photon, PAR[0], PAR[1]);
        const eparRatio = pPar > 0 ? bandIntegral(photon, EPAR[0], EPAR[1]) / pPar : 1;
        lux = {
          source: 'lux',
          ppfd: liveLuxPpfd,
          par: liveLuxPpfd,
          epar: liveLuxPpfd * eparRatio,
          tolerancePct: a.tolerancePct ?? 15
        };
      } else {
        lux = flux(a);
      }
    }
    if (cfg.anchors.reference) reference = flux(cfg.anchors.reference);
  }
  const primary = reference ?? lux;

  return {
    relative,
    peakWavelengthNm: mx > 0 ? WAVELENGTHS[peakIdx] : null,
    peaks,
    view,
    bands,
    lux,
    reference,
    ppfdSource: primary?.source ?? null,
    par: primary?.par ?? null,
    epar: primary?.epar ?? null,
    ppfd: primary?.ppfd ?? null, // PPFD ≡ the PAR integral
    farRedRatio,
    calibrated: primary != null,
    saturated
  };
}

/** Compute the per-µs PHOTON band integral needed to fill AnchorCalibration.rawIntegral
 *  from the anchor light's raw frame (run once when calibrating against a meter). */
export function anchorIntegral(
  rawCounts: number[],
  integrationUs: number,
  range: 'par' | 'epar',
  config: Partial<SpectroConfig> = {}
): number {
  const cfg: SpectroConfig = { ...SPECTRO_CONFIG, ...config };
  const photon = applyView(toCorrected(rawCounts, cfg), 'photon');
  const win = range === 'par' ? PAR : EPAR;
  return bandIntegral(photon, win[0], win[1]) / effectiveIntegrationUs(integrationUs);
}

/** Provenance metadata for a freshly-built anchor. */
export interface AnchorMeta {
  /** ISO time the anchor frame + reading were captured. */
  capturedAt: string;
  /** Instrument label (defaults per source). */
  meter?: string;
  /** Override the displayed ± tolerance (%). */
  tolerancePct?: number;
  /** Reprocess against a non-default calibration. */
  config?: Partial<SpectroConfig>;
}

/** A lux-anchored calibration; the lux and the frame MUST be measured at the same point and time. */
export function luxToAnchor(
  rawCounts: number[],
  integrationUs: number,
  lux: number,
  meta: AnchorMeta
): AnchorCalibration {
  const cfg: SpectroConfig = { ...SPECTRO_CONFIG, ...meta.config };
  const photon = applyView(toCorrected(rawCounts, cfg), 'photon');
  const pPar = bandIntegral(photon, PAR[0], PAR[1]);
  const lumSum = photopicSum(photon);
  // referenceUmol = true PPFD = lux · (PAR photon sum) / (K · luminous sum).
  const referenceUmol = lumSum > 0 ? (lux * pPar) / (LUX_PER_UMOL_K * lumSum) : 0;
  return {
    referenceUmol,
    referenceRange: 'par',
    rawIntegral: pPar / effectiveIntegrationUs(integrationUs),
    source: 'lux',
    capturedAt: meta.capturedAt,
    luxValue: lux,
    meter: meta.meter ?? 'bh1750-dlight',
    tolerancePct: meta.tolerancePct ?? 15
  };
}

/** Build a reference-grade anchor from a quantum-meter µmol reading (e.g. Apogee SQ-521). */
export function referenceAnchor(
  rawCounts: number[],
  integrationUs: number,
  referenceUmol: number,
  range: 'par' | 'epar',
  meta: AnchorMeta
): AnchorCalibration {
  return {
    referenceUmol,
    referenceRange: range,
    rawIntegral: anchorIntegral(rawCounts, integrationUs, range, meta.config),
    source: 'reference',
    capturedAt: meta.capturedAt,
    meter: meta.meter ?? 'apogee-sq521',
    tolerancePct: meta.tolerancePct ?? 5
  };
}
