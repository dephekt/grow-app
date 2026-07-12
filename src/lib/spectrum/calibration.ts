/**
 * C12880MA spectral science — the single place all calibration/physics lives.
 *
 * The firmware ships raw ADC counts only; everything here (pixel→wavelength,
 * dark subtraction, optional response correction, normalization, band shares,
 * and — once anchored — absolute PPFD/PFD) is applied on ingest/read. Because
 * captures store the RAW counts, changing anything in SPECTRO_CONFIG reprocesses
 * all history rather than freezing it at placeholder calibration.
 *
 * Pure, dependency-free, client- and server-safe.
 *
 * Physics notes (verified numerically):
 *  - A grating-spectrometer pixel already integrates over its wavelength bin
 *    (count_i ∝ Φ(λ)·Δλ_i), and this unit's Δλ runs ~2.7 nm/px (blue) → ~1.2 nm/px
 *    (red). So band metrics are a PLAIN fractional sum of per-bin counts, NOT
 *    Σ counts·Δλ (which would double-count dispersion and inflate blue:red ~24%).
 *    Δλ is used ONLY to apportion the two boundary pixels of a band.
 *  - Metrics are photon-based (PPFD/PAR are µmol of photons). Counts (after any
 *    response correction) must be ∝ photon flux; if the correction is sourced from
 *    an A/W energy responsivity, set responseDomain:'energy' to multiply by λ.
 *  - Absolute integrals are per-µs normalized so frames at different exposures are
 *    comparable; a one-point anchor (Apogee reading) sets the scale.
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

export interface AnchorCalibration {
  /** Reference PPFD/ePAR reading, µmol·m⁻²·s⁻¹ (e.g. from an Apogee SQ-521). */
  referenceUmol: number;
  /** Window the reference integrated over. */
  referenceRange: 'par' | 'epar';
  /** This module's per-µs, response-corrected band integral over referenceRange
   *  for the anchor frame (units cancel into the scale factor). */
  rawIntegral: number;
}

export type ResponseDomain = 'photon' | 'energy';

/** The ONE place to edit when the real Hamamatsu sheet / Apogee anchor arrive. */
export interface SpectroConfig {
  coeffs: WavelengthCoeffs;
  /** Optional per-pixel sensitivity correction (datasheet typical curve). null = identity. */
  responseCorrection: number[] | null;
  responseDomain: ResponseDomain;
  /** Stored dark frame (LED off, same integration), subtracted per-pixel. null = auto baseline. */
  darkFrame: number[] | null;
  /** null ⇒ absolute PPFD/PFD stay null (relative-only). */
  anchor: AnchorCalibration | null;
}

// Placeholder wavelength coefficients from sample unit 24K00198 (same batch family,
// within ~1–2 nm). Swap for the real per-unit Hamamatsu final-inspection sheet.
export const WAVELENGTH_COEFFS: WavelengthCoeffs = {
  a0: 3.044679549e2,
  b1: 2.696353743,
  b2: -1.045712658e-3,
  b3: -8.28582189e-6,
  b4: 1.148981468e-8,
  b5: 1.809281229e-12
};

/** Pixel→wavelength (nm). p is 1-BASED per the Hamamatsu formula; counts[i] is pixel p=i+1. */
export function pixelToWavelength(p: number, c: WavelengthCoeffs = WAVELENGTH_COEFFS): number {
  return c.a0 + c.b1 * p + c.b2 * p * p + c.b3 * p ** 3 + c.b4 * p ** 4 + c.b5 * p ** 5;
}

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

// C12880MA relative spectral sensitivity S(λ), digitized from the Hamamatsu datasheet
// (KACC1226E, p.3 "Spectral response (typical example)", curve KACCB0381EA). The module is
// blue-green peaked (~100% at 460–500 nm) and falls through the red — ~58% at 660 nm —
// rolling off hard into the NIR (~20% at 800 nm). Anchor points read off the figure and
// linearly interpolated onto the pixel grid. It is a "typical example" (per-unit variance),
// so the correction is approximate — a reference-lamp calibration would refine it.
const C12880MA_SENSITIVITY: ReadonlyArray<readonly [number, number]> = [
  [340, 0.53], [360, 0.68], [380, 0.85], [400, 0.95], [420, 0.92], [440, 0.96],
  [460, 0.99], [480, 1.0], [500, 0.99], [520, 0.96], [540, 0.93], [560, 0.88],
  [580, 0.83], [600, 0.76], [620, 0.7], [640, 0.64], [660, 0.58], [680, 0.53],
  [700, 0.48], [720, 0.42], [740, 0.37], [760, 0.31], [780, 0.26], [800, 0.2],
  [820, 0.15], [840, 0.11], [850, 0.1]
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

// Per-pixel de-tilt multipliers = 1 / S(λ). Dividing measured counts by the sensor's
// blue-green-peaked response recovers the true relative spectrum — notably lifting the
// ~1.6× under-read red (S(660)≈0.58). Capped so the NIR tail (S→~0.1, no real signal there)
// can't amplify noise without bound; the cap only bites beyond ~800 nm, past ePAR.
const RESPONSE_CORRECTION_CAP = 4;
export const C12880MA_RESPONSE_CORRECTION: number[] = WAVELENGTHS.map((nm) =>
  Math.min(RESPONSE_CORRECTION_CAP, 1 / Math.max(sensitivityAt(nm), 1e-3))
);

// Runtime calibration/physics config. responseCorrection defaults ON (the datasheet C12880MA
// curve) so the displayed spectrum isn't tilted by the sensor's own response; because captures
// store raw counts, refining or disabling it reprocesses all history. responseDomain stays
// 'photon' — the correction removes the instrument response; if the datasheet curve is later
// confirmed to be an energy (per-watt) responsivity, flip to 'energy' to add the ×λ factor.
export const SPECTRO_CONFIG: SpectroConfig = {
  coeffs: WAVELENGTH_COEFFS,
  responseCorrection: C12880MA_RESPONSE_CORRECTION,
  responseDomain: 'photon',
  darkFrame: null,
  anchor: null
};

// Horticulture bands (nm), aligned to Pulse's Blue/Green/Red/IR tiles.
const BANDS = { blue: [400, 500], green: [500, 600], red: [600, 700], farRed: [700, 750] } as const;
const PAR: [number, number] = [400, 700];
const EPAR: [number, number] = [400, 750];

// First few pixels of the C12880MA are dummy/optically-black — never real signal.
const DUMMY_PIXELS = 5;

export interface ProcessedSpectrum {
  /** 0..100 relative power (dark-subtracted, response-corrected), max→100. Pulse's "Relative
   *  Power %". Index-aligned to the module's WAVELENGTHS constant — the x-axis is invariant for
   *  a given calibration, so consumers derive it from WAVELENGTHS rather than shipping it per frame. */
  relative: number[];
  /** Peak wavelength (nm), or null for a blank/all-dark frame (no signal above the baseline). */
  peakWavelengthNm: number | null;
  /** Wavelengths (nm) of the prominent local maxima, low→high (e.g. the blue and red peaks of a
   *  horticulture LED) — for chart labels. Empty for a blank frame. */
  peaks: number[];
  /** Photon-share %, summing to 100 across the four bands. */
  bands: { blue: number; green: number; red: number; farRed: number };
  /** Absolute µmol·m⁻²·s⁻¹ — null until an anchor is set (or when saturated). */
  par: number | null;
  epar: number | null;
  ppfd: number | null;
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

/** Raw counts → dark-subtracted, response-corrected, photon-domain per-pixel values
 *  (dummy pixels forced to 0). The single "raw → corrected" implementation, shared by
 *  processSpectrum and anchorIntegral so the baseline/correction logic can't drift
 *  between the live and anchor-calibration paths. `dark` overrides cfg.darkFrame; with
 *  neither set, an auto baseline (mean of the darkest 10% of the body) is subtracted. */
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
    if (i < DUMMY_PIXELS) {
      corrected[i] = 0;
      continue;
    }
    let c = Math.max(0, counts[i] - (darkFrame ? darkFrame[i] : baseline));
    if (cfg.responseCorrection) c *= cfg.responseCorrection[i] ?? 1;
    if (cfg.responseDomain === 'energy') c *= WAVELENGTHS[i];
    corrected[i] = c;
  }
  return corrected;
}

/** Prominent local maxima of the relative curve (the blue/red LED peaks, etc.), as wavelengths
 *  low→high. Noise-robust: a candidate must be the max within ±WINDOW pixels, clear a height
 *  floor, and sit ≥MIN_SEP_NM from any taller kept peak; capped at 3 so labels stay legible. */
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

/** Turn raw counts into a display-ready + (optionally) calibrated spectrum. */
export function processSpectrum(rawCounts: number[], opts: ProcessOptions = {}): ProcessedSpectrum {
  const cfg: SpectroConfig = { ...SPECTRO_CONFIG, ...opts.config };
  const adcFullScale = opts.adcFullScale ?? 16383;
  // Skip the optically-black dummy pixels — a dark-offset spike there is not real saturation.
  const saturated = opts.saturated || rawCounts.some((v, i) => i >= DUMMY_PIXELS && v >= adcFullScale);

  // 1+2. dark subtraction + response correction → photon-domain corrected counts
  const corrected = toCorrected(rawCounts, cfg, opts.dark);

  // 3. normalize (0..100) + peak
  let mx = 0;
  let peakIdx = DUMMY_PIXELS;
  for (let i = DUMMY_PIXELS; i < PIXEL_COUNT; i++) {
    if (corrected[i] > mx) {
      mx = corrected[i];
      peakIdx = i;
    }
  }
  const relative = corrected.map((c) => (mx > 0 ? (100 * c) / mx : 0));
  const peaks = findPeaks(relative);

  // 4. band photon-shares (denominator = ePAR total → four sum to 100, like Pulse)
  const iBlue = bandIntegral(corrected, BANDS.blue[0], BANDS.blue[1]);
  const iGreen = bandIntegral(corrected, BANDS.green[0], BANDS.green[1]);
  const iRed = bandIntegral(corrected, BANDS.red[0], BANDS.red[1]);
  const iFarRed = bandIntegral(corrected, BANDS.farRed[0], BANDS.farRed[1]);
  const total = iBlue + iGreen + iRed + iFarRed;
  const bands = {
    blue: total > 0 ? (100 * iBlue) / total : 0,
    green: total > 0 ? (100 * iGreen) / total : 0,
    red: total > 0 ? (100 * iRed) / total : 0,
    farRed: total > 0 ? (100 * iFarRed) / total : 0
  };

  // 5. absolute PPFD/ePAR via the one-point anchor (per-µs normalized)
  let par: number | null = null;
  let epar: number | null = null;
  const integ = opts.integrationUs;
  if (cfg.anchor && !saturated && integ && integ > 0) {
    const scale = cfg.anchor.referenceUmol / cfg.anchor.rawIntegral;
    par = (scale * bandIntegral(corrected, PAR[0], PAR[1])) / integ;
    epar = (scale * bandIntegral(corrected, EPAR[0], EPAR[1])) / integ;
  }

  return {
    relative,
    peakWavelengthNm: mx > 0 ? WAVELENGTHS[peakIdx] : null,
    peaks,
    bands,
    par,
    epar,
    ppfd: par, // PPFD ≡ the PAR integral
    calibrated: cfg.anchor != null && !saturated,
    saturated
  };
}

/** Compute the per-µs band integral needed to fill AnchorCalibration.rawIntegral
 *  from the anchor light's raw frame (run once when calibrating against a meter). */
export function anchorIntegral(
  rawCounts: number[],
  integrationUs: number,
  range: 'par' | 'epar',
  config: Partial<SpectroConfig> = {}
): number {
  const cfg: SpectroConfig = { ...SPECTRO_CONFIG, ...config };
  const corrected = toCorrected(rawCounts, cfg);
  const win = range === 'par' ? PAR : EPAR;
  return bandIntegral(corrected, win[0], win[1]) / integrationUs;
}
