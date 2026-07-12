/**
 * C12880MA spectral science — the single place all calibration/physics lives.
 *
 * The firmware ships raw ADC counts only; everything here (pixel→wavelength, dark
 * subtraction, the energy/photon response transforms, band shares, and — once anchored —
 * absolute PPFD) is applied on ingest/read. Because captures store the RAW counts, changing
 * anything here reprocesses all history rather than freezing it at old calibration.
 *
 * Pure, dependency-free, client- and server-safe (the client re-derives views from raw counts).
 *
 * Physics notes (measured on this unit against reference lamps):
 *  - A grating pixel already integrates over its wavelength bin (count_i ∝ Φ(λ)·Δλ_i), so band
 *    metrics are a PLAIN fractional sum of per-bin counts, NOT Σ counts·Δλ. Δλ is used ONLY to
 *    apportion the two boundary pixels of a band.
 *  - The sensor reads counts ∝ photon-flux × S(λ), S = the C12880MA's blue-green-peaked response
 *    (datasheet KACC1226E; confirmed here to ~4% by fitting an incandescent blackbody). So the
 *    same frame has three views: RAW (counts — the sensor's tilted view), PHOTON (÷S — µmol, what
 *    plants count and what PPFD/PAR use), ENERGY (÷(S·λ) — W/nm, what maker SPD charts show).
 *  - Absolute PPFD/PAR are photon quantities: always computed from the PHOTON view, per-µs
 *    normalized so frames at different exposures compare; a one-point anchor (Apogee) sets scale.
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
  /** This module's per-µs PHOTON band integral over referenceRange for the anchor frame
   *  (units cancel into the scale factor). */
  rawIntegral: number;
}

/** How to express the spectrum: raw sensor counts, photon flux (÷S), or energy (÷S·λ). */
export type SpectrumView = 'raw' | 'photon' | 'energy';

/** The ONE place to edit when the real Hamamatsu sheet / Apogee anchor arrive. */
export interface SpectroConfig {
  coeffs: WavelengthCoeffs;
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

// Runtime calibration config — the single place to swap in real per-unit calibration (the
// wavelength sheet into WAVELENGTH_COEFFS, the Apogee anchor into `anchor`). The sensor response
// S(λ) that powers the photon/energy views lives just below WAVELENGTHS.
export const SPECTRO_CONFIG: SpectroConfig = {
  coeffs: WAVELENGTH_COEFFS,
  darkFrame: null,
  anchor: null
};

/** Pixel→wavelength (nm). p is 1-BASED per the Hamamatsu formula; counts[i] is pixel p=i+1. */
export function pixelToWavelength(p: number, c: WavelengthCoeffs = WAVELENGTH_COEFFS): number {
  return c.a0 + c.b1 * p + c.b2 * p * p + c.b3 * p ** 3 + c.b4 * p ** 4 + c.b5 * p ** 5;
}

// Per-unit wavelength correction from the Coleman fluorescent's mercury lines (365/405/436/546/577):
// the placeholder coeffs (borrowed from sibling 24K00198) read ~5 nm low with a slight stretch; this
// linear fit lands all five Hg lines within ±0.6 nm (and the grow light's blue pump→451, red diode→660).
// Reset to {scale:1, offset:0} once this unit's real Hamamatsu coefficient sheet is loaded above.
const WAVELENGTH_FIT = { scale: 1.01341, offset: -0.55 };

export const WAVELENGTHS: number[] = Array.from({ length: PIXEL_COUNT }, (_, i) =>
  WAVELENGTH_FIT.scale * pixelToWavelength(i + 1) + WAVELENGTH_FIT.offset
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

// C12880MA relative spectral sensitivity S(λ), digitized from the Hamamatsu datasheet (KACC1226E,
// p.3 "Spectral response", curve KACCB0381EA) — blue-green peaked, ~0.58 at 660 nm, ~0.20 at 800 nm.
// VALIDATED on this unit: dividing raw counts by S fits an incandescent to a clean ~2470 K blackbody
// (~4% residual). Powers the photon (÷S) and energy (÷S·λ) views.
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

// Per-pixel response boost 1/S(λ), capped so the low-response NIR tail can't amplify noise (the cap
// only bites past ~750 nm, where real signal is scarce anyway).
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

export interface ProcessedSpectrum {
  /** 0..100 relative power in the active `view`, max→100. Pulse's "Relative Power %". Index-aligned
   *  to the module's WAVELENGTHS constant — the x-axis is invariant for a given calibration, so
   *  consumers derive it from WAVELENGTHS rather than shipping it per frame. */
  relative: number[];
  /** Peak wavelength (nm), or null for a blank/all-dark frame (no signal above the baseline). */
  peakWavelengthNm: number | null;
  /** Wavelengths (nm) of the prominent local maxima, low→high (e.g. the blue and red peaks of a
   *  horticulture LED) — for chart labels. Empty for a blank frame. */
  peaks: number[];
  /** Which lens `relative`/`peaks`/`bands` are expressed in. */
  view: SpectrumView;
  /** Band shares (%) in the active view, summing to 100 across the four bands. */
  bands: { blue: number; green: number; red: number; farRed: number };
  /** Absolute µmol·m⁻²·s⁻¹ (photon) — null until an anchor is set (or when saturated). */
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
  /** Lens for relative/peaks/bands: 'photon' (default, µmol), 'energy' (W/nm), or 'raw'. Absolute
   *  PPFD is always photon regardless. */
  view?: SpectrumView;
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

/** Raw counts → dark-subtracted per-pixel values (dummy pixels forced to 0). The single
 *  dark-subtraction implementation, shared by processSpectrum and anchorIntegral so the
 *  baseline logic can't drift between the live and anchor-calibration paths. `dark` overrides
 *  cfg.darkFrame; with neither set, an auto baseline (mean of the darkest 10% of the body). */
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
    corrected[i] = i < DUMMY_PIXELS ? 0 : Math.max(0, counts[i] - (darkFrame ? darkFrame[i] : baseline));
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
  const view = opts.view ?? 'photon';
  // Skip the optically-black dummy pixels — a dark-offset spike there is not real saturation.
  const saturated = opts.saturated || rawCounts.some((v, i) => i >= DUMMY_PIXELS && v >= adcFullScale);

  // 1. dark subtraction, then the view transform (raw / photon=÷S / energy=÷S·λ)
  const corrected = toCorrected(rawCounts, cfg, opts.dark);
  const display = applyView(corrected, view);

  // 2. normalize (0..100) + peak, in the active view
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

  // 3. band shares in the active view (denominator = ePAR total → four sum to 100, like Pulse)
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

  // 4. absolute PPFD/ePAR — always the PHOTON view (µmol), per-µs normalized, anchor-gated
  let par: number | null = null;
  let epar: number | null = null;
  const integ = opts.integrationUs;
  if (cfg.anchor && !saturated && integ && integ > 0) {
    const photon = view === 'photon' ? display : applyView(corrected, 'photon');
    const scale = cfg.anchor.referenceUmol / cfg.anchor.rawIntegral;
    par = (scale * bandIntegral(photon, PAR[0], PAR[1])) / integ;
    epar = (scale * bandIntegral(photon, EPAR[0], EPAR[1])) / integ;
  }

  return {
    relative,
    peakWavelengthNm: mx > 0 ? WAVELENGTHS[peakIdx] : null,
    peaks,
    view,
    bands,
    par,
    epar,
    ppfd: par, // PPFD ≡ the PAR integral
    calibrated: cfg.anchor != null && !saturated,
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
  return bandIntegral(photon, win[0], win[1]) / integrationUs;
}
