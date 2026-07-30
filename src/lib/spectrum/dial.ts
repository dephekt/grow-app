/**
 * Compact spectrum payload for the M5Dial controller's chart screen.
 *
 * The dial is a "dumb" display like the spectrometer firmware is a dumb sensor: it renders what it
 * is handed and owns no calibration. grow-app already processes every raw frame on ingest (see
 * `processSpectrum`), so this reduces that result to a ~200-byte, fixed-width payload the dial can
 * plot directly onto a 240px-wide round panel — instead of shipping 288 raw counts to an ESP32 that
 * would then need this unit's Hamamatsu coefficients baked into its firmware.
 *
 * Pure and dependency-free, like `calibration.ts` — the MQTT publish lives in the mqtt service.
 */
import { WAVELENGTHS, type ProcessedSpectrum } from './calibration';

/** Bin count. 60 over 400–750 nm ≈ 5.8 nm/bin — finer than the ~200px of usable chart width on the
 *  round 240×240 panel, so the dial never has to interpolate upward. */
export const DIAL_BIN_COUNT = 60;

/** Plot window (nm). Matches calibration.ts's EPAR window so the far-red tail growers care about
 *  stays on screen; the C12880MA reads well past 750 but nothing above it is actionable here. */
export const DIAL_RANGE_NM: [number, number] = [400, 750];

export interface DialSpectrum {
  /** Relative power per bin, 0–100, peak-normalized across the plotted window. */
  bins: number[];
  /** Plot window bounds (nm) — sent so the dial labels its axis without hardcoding our constants. */
  lo: number;
  hi: number;
  /** Peak wavelength (nm), or null for a blank/dark frame. */
  peak: number | null;
  /** Firmware/derived saturation flag — the dial warns rather than showing a clipped curve as real. */
  sat: boolean;
  /** Source frame sequence, so the dial can spot a stalled publisher. */
  seq: number;
}

/**
 * Reduce a processed frame to the dial payload.
 *
 * `processed.relative` is already 0–100 relative power in the photon view (what plants count —
 * deliberately not the energy view that maker SPD charts use) and is index-aligned to `WAVELENGTHS`,
 * so this is a pure reduction with no physics of its own.
 *
 * Bins take the **max** of the pixels falling in them, not the mean: at 60 bins over 288 pixels each
 * bin spans ~4-5 pixels, and averaging visibly flattens the narrow blue and red LED peaks that are
 * the entire point of glancing at this chart. Max preserves peak height and position.
 *
 * Renormalizes to the peak *within the plotted window*. `relative` is normalized over the full
 * sensor range, so a frame whose true max sits outside 400–750 nm would otherwise render as a curve
 * that never reaches the top of the chart.
 */
export function toDialSpectrum(
  processed: Pick<ProcessedSpectrum, 'relative' | 'peakWavelengthNm' | 'saturated'>,
  seq: number
): DialSpectrum {
  const [lo, hi] = DIAL_RANGE_NM;
  const span = hi - lo;
  const bins = new Array<number>(DIAL_BIN_COUNT).fill(0);

  for (let i = 0; i < processed.relative.length; i++) {
    const nm = WAVELENGTHS[i];
    if (nm < lo || nm >= hi) continue;
    const b = Math.min(DIAL_BIN_COUNT - 1, Math.floor(((nm - lo) / span) * DIAL_BIN_COUNT));
    const v = processed.relative[i];
    if (v > bins[b]) bins[b] = v;
  }

  // Renormalize to the in-window peak, then round to ints — the dial plots into ~150px of height,
  // so fractional percent is wasted payload.
  const peakValue = bins.reduce((m, v) => (v > m ? v : m), 0);
  const scale = peakValue > 0 ? 100 / peakValue : 0;
  for (let b = 0; b < bins.length; b++) bins[b] = Math.round(bins[b] * scale);

  return {
    bins,
    lo,
    hi,
    peak: processed.peakWavelengthNm,
    sat: processed.saturated,
    seq
  };
}
