import { describe, it, expect } from 'vitest';
import { processSpectrum, WAVELENGTHS, PIXEL_COUNT } from '$lib/spectrum/calibration';

const ZERO_DARK = new Array(PIXEL_COUNT).fill(0);

describe('spectrum calibration', () => {
  it('maps 288 monotonically increasing wavelengths across the sensor range', () => {
    expect(WAVELENGTHS.length).toBe(PIXEL_COUNT);
    for (let i = 1; i < WAVELENGTHS.length; i++) {
      expect(WAVELENGTHS[i]).toBeGreaterThan(WAVELENGTHS[i - 1]);
    }
    expect(WAVELENGTHS[0]).toBeLessThan(340);
    expect(WAVELENGTHS[PIXEL_COUNT - 1]).toBeGreaterThan(840);
  });

  it('band shares are a plain fractional sum ⇒ match nm spans for a flat-photon source', () => {
    // Flat photon flux ⇒ per-bin count ∝ Δλ. Approximate Δλ by neighbour spacing.
    // If bands were Σ counts·Δλ (the bug) blue:red would skew ~24%; the plain sum
    // makes the 100 nm bands equal and the 50 nm far-red band ~half.
    const counts = WAVELENGTHS.map((_, i) => {
      const lo = WAVELENGTHS[Math.max(0, i - 1)];
      const hi = WAVELENGTHS[Math.min(PIXEL_COUNT - 1, i + 1)];
      return Math.round(2000 * ((hi - lo) / 2));
    });
    const p = processSpectrum(counts, { adcFullScale: 16383, dark: ZERO_DARK });
    // ePAR window is 350 nm: blue/green/red 100 nm each (~28.6%), far-red 50 nm (~14.3%)
    expect(p.bands.blue).toBeCloseTo(28.6, 0);
    expect(p.bands.green).toBeCloseTo(28.6, 0);
    expect(p.bands.red).toBeCloseTo(28.6, 0);
    expect(p.bands.farRed).toBeCloseTo(14.3, 0);
    expect(p.bands.blue + p.bands.green + p.bands.red + p.bands.farRed).toBeCloseTo(100, 3);
  });

  it('normalizes to 0..100 with the peak at 100 and finds a blue peak', () => {
    const counts = WAVELENGTHS.map((nm) => 500 + Math.round(3000 * Math.exp(-((nm - 450) ** 2) / (2 * 30 ** 2))));
    const p = processSpectrum(counts, { adcFullScale: 16383 });
    expect(Math.max(...p.relative)).toBeCloseTo(100, 5);
    expect(Math.min(...p.relative)).toBeGreaterThanOrEqual(0);
    expect(p.peakWavelengthNm).toBeGreaterThan(430);
    expect(p.peakWavelengthNm).toBeLessThan(470);
  });

  it('leaves absolute PPFD/PAR/ePAR null and calibrated=false without an anchor', () => {
    const p = processSpectrum(new Array(PIXEL_COUNT).fill(2000), { adcFullScale: 16383, integrationUs: 20000 });
    expect(p.ppfd).toBeNull();
    expect(p.par).toBeNull();
    expect(p.epar).toBeNull();
    expect(p.calibrated).toBe(false);
  });

  it('flags saturation from a pinned pixel', () => {
    const counts = new Array(PIXEL_COUNT).fill(1000);
    counts[120] = 16383;
    const p = processSpectrum(counts, { adcFullScale: 16383 });
    expect(p.saturated).toBe(true);
  });
});
