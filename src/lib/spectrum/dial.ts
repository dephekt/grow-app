// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/**
 * Compact spectrum payload for the M5Dial controller's chart screen.
 *
 * Pure and dependency-free, like `calibration.ts` — the MQTT publish lives in the mqtt service.
 */
import { WAVELENGTHS, type ProcessedSpectrum } from './calibration';

/** Bin count: 60 over 400–750 nm ≈ 5.8 nm/bin, finer than the round panel's ~200px of usable chart
 *  width. */
export const DIAL_BIN_COUNT = 60;

/** Plot window (nm), matching calibration.ts's EPAR window so the far-red tail stays on screen. */
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
 * Bins take the **max** of the pixels falling in them, NOT the mean, which flattens the narrow blue
 * and red LED peaks.
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

  // Renormalize to the in-window peak: `relative` is normalized over the full sensor range.
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
