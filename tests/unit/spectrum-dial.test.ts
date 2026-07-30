import { describe, it, expect } from 'vitest';
import { WAVELENGTHS, PIXEL_COUNT } from '$lib/spectrum/calibration';
import { toDialSpectrum, DIAL_BIN_COUNT, DIAL_RANGE_NM } from '$lib/spectrum/dial';

const [LO, HI] = DIAL_RANGE_NM;

/** A `relative` array (0–100, index-aligned to WAVELENGTHS) built from a per-wavelength function. */
function relativeFrom(f: (nm: number) => number): number[] {
  return WAVELENGTHS.map((nm) => f(nm));
}

/** The bin a wavelength lands in, mirroring the module's mapping. */
function binOf(nm: number): number {
  return Math.min(DIAL_BIN_COUNT - 1, Math.floor(((nm - LO) / (HI - LO)) * DIAL_BIN_COUNT));
}

const frame = (relative: number[], extra: { peak?: number | null; sat?: boolean } = {}) => ({
  relative,
  peakWavelengthNm: extra.peak ?? null,
  saturated: extra.sat ?? false
});

describe('dial spectrum binning', () => {
  it('emits a fixed-width payload with the plot window and integer bins', () => {
    const out = toDialSpectrum(frame(relativeFrom((nm) => (nm > 600 && nm < 620 ? 100 : 0))), 42);

    expect(out.bins.length).toBe(DIAL_BIN_COUNT);
    expect(out.lo).toBe(LO);
    expect(out.hi).toBe(HI);
    expect(out.seq).toBe(42);
    for (const v of out.bins) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it('places a narrow peak in the bin its wavelength maps to, and leaves neighbours dark', () => {
    const peakNm = 660;
    const out = toDialSpectrum(
      frame(relativeFrom((nm) => (Math.abs(nm - peakNm) < 2 ? 100 : 0))),
      1
    );

    const b = binOf(peakNm);
    expect(out.bins[b]).toBe(100);
    // Everything more than one bin away must be dark — a smeared peak means the mapping is wrong.
    for (let i = 0; i < out.bins.length; i++) {
      if (Math.abs(i - b) > 1) expect(out.bins[i]).toBe(0);
    }
  });

  it('takes the max, not the mean, so narrow LED peaks keep full height', () => {
    // One bin spans ~4-5 pixels. Light exactly one pixel inside a bin: max ⇒ 100, mean ⇒ ~20-25.
    const target = 500;
    let idx = 0;
    for (let i = 0; i < PIXEL_COUNT; i++) if (Math.abs(WAVELENGTHS[i] - target) < Math.abs(WAVELENGTHS[idx] - target)) idx = i;

    const relative = new Array(PIXEL_COUNT).fill(0);
    relative[idx] = 100;

    const out = toDialSpectrum(frame(relative), 1);
    expect(out.bins[binOf(WAVELENGTHS[idx])]).toBe(100);
  });

  it('renormalizes to the in-window peak so a curve always reaches the top of the chart', () => {
    // True max sits at 900 nm — outside the plot window. Without renormalization the in-window
    // signal would render at 40% of chart height forever.
    const out = toDialSpectrum(
      frame(relativeFrom((nm) => (nm > 890 ? 100 : nm > 650 && nm < 670 ? 40 : 0))),
      1
    );

    expect(Math.max(...out.bins)).toBe(100);
    expect(out.bins[binOf(660)]).toBe(100);
  });

  it('excludes signal outside the plot window entirely', () => {
    // UV below 400 and IR above 750 must not leak into the edge bins.
    const out = toDialSpectrum(frame(relativeFrom((nm) => (nm < LO || nm >= HI ? 100 : 0))), 1);
    expect(out.bins.every((v) => v === 0)).toBe(true);
  });

  it('returns all-zero bins for a blank frame rather than dividing by zero', () => {
    const out = toDialSpectrum(frame(new Array(PIXEL_COUNT).fill(0)), 7);
    expect(out.bins).toHaveLength(DIAL_BIN_COUNT);
    expect(out.bins.every((v) => v === 0)).toBe(true);
    expect(out.peak).toBeNull();
  });

  it('carries the peak wavelength and saturation flag through untouched', () => {
    const out = toDialSpectrum(
      frame(relativeFrom((nm) => (nm > 600 && nm < 620 ? 100 : 0)), { peak: 662.5, sat: true }),
      9
    );
    expect(out.peak).toBe(662.5);
    expect(out.sat).toBe(true);
  });

  it('stays small enough for a constrained MQTT subscriber', () => {
    const out = toDialSpectrum(relativeSpectrumFixture(), 41822);
    expect(JSON.stringify(out).length).toBeLessThan(400);
  });
});

/** A realistic horticulture-LED shape: blue peak, green trough, broad red peak, far-red tail. */
function relativeSpectrumFixture(): { relative: number[]; peakWavelengthNm: number; saturated: boolean } {
  const gauss = (nm: number, mu: number, sigma: number, h: number) =>
    h * Math.exp(-((nm - mu) ** 2) / (2 * sigma ** 2));
  return {
    relative: relativeFrom(
      (nm) => gauss(nm, 450, 12, 70) + gauss(nm, 660, 18, 100) + gauss(nm, 730, 15, 25) + 4
    ),
    peakWavelengthNm: 660,
    saturated: false
  };
}
