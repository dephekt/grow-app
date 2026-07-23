import { describe, it, expect } from 'vitest';
import {
  processSpectrum,
  pixelToWavelength,
  luxToAnchor,
  referenceAnchor,
  WAVELENGTHS,
  PIXEL_COUNT
} from '$lib/spectrum/calibration';

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

  it('applies the per-unit Hamamatsu 24K00807 coefficients directly (fit is identity)', () => {
    for (const i of [0, 10, 100, 200, 287]) {
      expect(WAVELENGTHS[i]).toBeCloseTo(pixelToWavelength(i + 1), 6);
    }
    // Anchored against the 24K00807 sheet: pixel 1 ≈ 317.76 nm.
    expect(WAVELENGTHS[0]).toBeCloseTo(317.76, 1);
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

const AT = '2026-07-18T00:00:00Z';
const BASELINE = 100;

function nearest(nm: number): number {
  let idx = 0;
  let best = Infinity;
  for (let i = 0; i < PIXEL_COUNT; i++) {
    const d = Math.abs(WAVELENGTHS[i] - nm);
    if (d < best) {
      best = d;
      idx = i;
    }
  }
  return idx;
}

/** A near-monochromatic raw frame: flat dark baseline + one bright pixel at `nm`. */
function monoFrame(nm: number, peak = 8000): number[] {
  const counts = new Array<number>(PIXEL_COUNT).fill(BASELINE);
  counts[nearest(nm)] = peak;
  return counts;
}

describe('luxToAnchor — the lux↔µmol bridge', () => {
  it('reproduces the textbook ~147 lux per µmol at 555 nm', () => {
    // At 555 nm, 1 W/m² = 683 lux = 4.64 µmol·m⁻²·s⁻¹ ⇒ 147.2 lux per µmol. The whole constant
    // (683 · N_A·h·c · unit factors) is pinned by this one physical fact.
    const anchor = luxToAnchor(monoFrame(555), 8000, 10_000, { capturedAt: AT });
    expect(anchor.source).toBe('lux');
    expect(anchor.referenceUmol).toBeGreaterThan(0);
    const luxPerUmol = 10_000 / anchor.referenceUmol;
    expect(luxPerUmol).toBeGreaterThan(144);
    expect(luxPerUmol).toBeLessThan(151);
  });

  it('carries lux provenance (source, meter, tolerance, the lux used)', () => {
    const anchor = luxToAnchor(monoFrame(450), 8000, 20_000, { capturedAt: AT });
    expect(anchor.source).toBe('lux');
    expect(anchor.meter).toBe('bh1750-dlight');
    expect(anchor.tolerancePct).toBe(15);
    expect(anchor.luxValue).toBe(20_000);
  });
});

describe('processSpectrum — absolute flux from an anchor', () => {
  const frame = monoFrame(555);
  const anchor = luxToAnchor(frame, 8000, 10_000, { capturedAt: AT });

  it('reads back the anchor PPFD on the anchor frame', () => {
    const p = processSpectrum(frame, { integrationUs: 8000, config: { anchors: { lux: anchor } } });
    expect(p.ppfd).not.toBeNull();
    expect(p.ppfd!).toBeCloseTo(anchor.referenceUmol, 5);
  });

  it('scales PPFD linearly with brightness (2× counts ⇒ 2× PPFD)', () => {
    const p1 = processSpectrum(frame, { integrationUs: 8000, config: { anchors: { lux: anchor } } });
    const p2 = processSpectrum(
      frame.map((c) => c * 2),
      { integrationUs: 8000, config: { anchors: { lux: anchor } } }
    );
    expect(p2.ppfd! / p1.ppfd!).toBeCloseTo(2, 1);
  });

  it('is exposure-independent (half the counts at half the integration ⇒ same PPFD)', () => {
    const p1 = processSpectrum(frame, { integrationUs: 8000, config: { anchors: { lux: anchor } } });
    const half = frame.map((c) => (c > BASELINE ? BASELINE + (c - BASELINE) / 2 : c));
    const pHalf = processSpectrum(half, { integrationUs: 4000, config: { anchors: { lux: anchor } } });
    expect(pHalf.ppfd! / p1.ppfd!).toBeCloseTo(1, 1);
  });

  it('handles a bright-light frame whose auto-exposure bottomed out to integration_us=0', () => {
    // Firmware halves the exposure under strong light down to 0 ms; the frame is still valid.
    const anchor0 = luxToAnchor(frame, 0, 10_000, { capturedAt: AT });
    expect(anchor0.referenceUmol).toBeGreaterThan(0);
    expect(anchor0.rawIntegral).toBeGreaterThan(0);
    const p = processSpectrum(frame, { integrationUs: 0, config: { anchors: { lux: anchor0 } } });
    expect(p.ppfd).not.toBeNull();
    expect(p.ppfd!).toBeCloseTo(anchor0.referenceUmol, 5);
    expect(10_000 / p.ppfd!).toBeGreaterThan(144); // still the 555 nm ~147 lux/µmol identity
    expect(10_000 / p.ppfd!).toBeLessThan(151);
  });

  it('gates flux to null on a saturated frame even with an anchor', () => {
    const p = processSpectrum(frame, {
      integrationUs: 8000,
      saturated: true,
      config: { anchors: { lux: anchor } }
    });
    expect(p.ppfd).toBeNull();
    expect(p.calibrated).toBe(false);
  });
});

describe('processSpectrum — estimate vs reference differentiation', () => {
  const frame = monoFrame(555);
  const luxAnchor = luxToAnchor(frame, 8000, 10_000, { capturedAt: AT });
  const refAnchor = referenceAnchor(frame, 8000, 300, 'par', { capturedAt: AT });

  it('exposes lux-only as the primary, tagged as an estimate', () => {
    const p = processSpectrum(frame, { integrationUs: 8000, config: { anchors: { lux: luxAnchor } } });
    expect(p.ppfdSource).toBe('lux');
    expect(p.lux?.source).toBe('lux');
    expect(p.lux?.tolerancePct).toBe(15);
    expect(p.reference).toBeNull();
    expect(p.calibrated).toBe(true);
  });

  it('lets the reference win as primary while keeping the lux estimate visible', () => {
    const p = processSpectrum(frame, {
      integrationUs: 8000,
      config: { anchors: { lux: luxAnchor, reference: refAnchor } }
    });
    expect(p.reference?.ppfd).toBeCloseTo(300, 5); // reference reads back its input on its own frame
    expect(p.lux).not.toBeNull();
    expect(p.ppfdSource).toBe('reference');
    expect(p.par).toBeCloseTo(300, 5);
    expect(p.reference?.tolerancePct).toBe(5);
    expect(p.lux?.tolerancePct).toBe(15);
  });

  it('derives a frame-robust lux PPFD from live lux × factor (survives a bad/stuck frame)', () => {
    const factor = luxAnchor.referenceUmol / 10_000; // µmol per lux

    // Same frame, live lux = anchor lux ⇒ PPFD ≈ the anchor's derived PPFD.
    const same = processSpectrum(frame, { integrationUs: 8000, liveLux: 10_000, config: { anchors: { lux: luxAnchor } } });
    expect(same.ppfd).toBeCloseTo(luxAnchor.referenceUmol, 6);
    expect(same.ppfdSource).toBe('lux');

    // Live lux halved ⇒ PPFD halves — dimming tracked via the lux sensor, not the frame.
    const dim = processSpectrum(frame, { integrationUs: 8000, liveLux: 5_000, config: { anchors: { lux: luxAnchor } } });
    expect(dim.ppfd).toBeCloseTo(luxAnchor.referenceUmol / 2, 6);

    // A near-dark frame collapses the counts-based PPFD toward 0 (the stuck-reading symptom), but the
    // live-lux path holds. Same integration time; only the counts are bad.
    const badFrame = new Array(PIXEL_COUNT).fill(50);
    const countsPath = processSpectrum(badFrame, { integrationUs: 8000, config: { anchors: { lux: luxAnchor } } });
    expect(countsPath.ppfd ?? 0).toBeLessThan(luxAnchor.referenceUmol * 0.1);
    const luxPath = processSpectrum(badFrame, { integrationUs: 8000, liveLux: 10_000, config: { anchors: { lux: luxAnchor } } });
    expect(luxPath.ppfd).toBeCloseTo(10_000 * factor, 6);
  });
});
