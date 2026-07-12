import { describe, it, expect } from 'vitest';
import { processSpectrum, pixelToWavelength, WAVELENGTHS, PIXEL_COUNT } from '$lib/spectrum/calibration';

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
    // 'raw' view — this tests the band-integration math, not the response transform.
    const p = processSpectrum(counts, { adcFullScale: 16383, dark: ZERO_DARK, view: 'raw' });
    // ePAR window is 350 nm: blue/green/red 100 nm each (~28.6%), far-red 50 nm (~14.3%)
    expect(p.bands.blue).toBeCloseTo(28.6, 0);
    expect(p.bands.green).toBeCloseTo(28.6, 0);
    expect(p.bands.red).toBeCloseTo(28.6, 0);
    expect(p.bands.farRed).toBeCloseTo(14.3, 0);
    expect(p.bands.blue + p.bands.green + p.bands.red + p.bands.farRed).toBeCloseTo(100, 3);
  });

  it('normalizes to 0..100 with the peak at 100 and finds a blue peak', () => {
    const counts = WAVELENGTHS.map((nm) => 500 + Math.round(3000 * Math.exp(-((nm - 450) ** 2) / (2 * 30 ** 2))));
    const p = processSpectrum(counts, { adcFullScale: 16383, view: 'raw' });
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

  it('reports a null peak (not a phantom ~320 nm) for an all-dark frame', () => {
    const p = processSpectrum(new Array(PIXEL_COUNT).fill(0), { adcFullScale: 16383 });
    expect(p.peakWavelengthNm).toBeNull();
    expect(Math.max(...p.relative)).toBe(0);
  });

  it('ignores saturation in the optically-black dummy pixels', () => {
    const counts = new Array(PIXEL_COUNT).fill(1000);
    counts[2] = 16383; // dummy region (0..4) — a dark-offset spike, not real saturation
    expect(processSpectrum(counts, { adcFullScale: 16383 }).saturated).toBe(false);
    counts[2] = 1000;
    counts[120] = 16383; // a real body pixel
    expect(processSpectrum(counts, { adcFullScale: 16383 }).saturated).toBe(true);
  });

  it('labels multiple prominent peaks — a blue and a red band, low→high', () => {
    const counts = WAVELENGTHS.map(
      (nm) =>
        600 +
        Math.round(3000 * Math.exp(-((nm - 450) ** 2) / (2 * 18 ** 2))) +
        Math.round(2600 * Math.exp(-((nm - 655) ** 2) / (2 * 14 ** 2)))
    );
    const p = processSpectrum(counts, { adcFullScale: 16383 });
    expect(p.peaks.length).toBeGreaterThanOrEqual(2);
    expect(p.peaks.some((nm) => nm > 430 && nm < 470)).toBe(true);
    expect(p.peaks.some((nm) => nm > 640 && nm < 675)).toBe(true);
    expect([...p.peaks].sort((a, b) => a - b)).toEqual(p.peaks);
  });

  it('applies the Hg-line wavelength correction (scale 1.01341, offset -0.55)', () => {
    for (const i of [10, 100, 200, 287]) {
      expect(WAVELENGTHS[i]).toBeCloseTo(1.01341 * pixelToWavelength(i + 1) - 0.55, 4);
    }
  });

  it('views: photon lifts red vs raw; energy pulls it back below photon', () => {
    // Equal raw counts at a blue and a red pixel — the only difference between views is the transform.
    const blueIdx = WAVELENGTHS.findIndex((nm) => nm >= 450);
    const redIdx = WAVELENGTHS.findIndex((nm) => nm >= 660);
    const counts = new Array(PIXEL_COUNT).fill(0);
    counts[blueIdx] = 1000;
    counts[redIdx] = 1000;
    const redOverBlue = (v: 'raw' | 'photon' | 'energy') => {
      const p = processSpectrum(counts, { adcFullScale: 16383, view: v });
      return { ratio: p.relative[redIdx] / p.relative[blueIdx], view: p.view };
    };
    const raw = redOverBlue('raw');
    const photon = redOverBlue('photon');
    const energy = redOverBlue('energy');
    expect(raw.ratio).toBeCloseTo(1, 5); // equal counts → equal in raw
    expect(photon.ratio).toBeGreaterThan(1.4); // ÷S lifts red (S(660)≈0.58 vs S(450)≈0.97)
    expect(energy.ratio).toBeLessThan(photon.ratio); // ÷λ pulls red back down
    expect(energy.ratio).toBeGreaterThan(1); // …but red still leads in energy here
    expect([raw.view, photon.view, energy.view]).toEqual(['raw', 'photon', 'energy']);
  });
});
