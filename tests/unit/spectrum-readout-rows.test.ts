import { describe, it, expect } from 'vitest';
import type { ProcessedSpectrum, FluxReading } from '$lib/spectrum/calibration';
import { fluxRows, fluxBadge, shareRows, shareTitle, hasFlux } from '$lib/spectrum/readout-rows';

function processed(over: Partial<ProcessedSpectrum> = {}): ProcessedSpectrum {
  return {
    relative: [],
    peakWavelengthNm: 639,
    peaks: [448, 639],
    view: 'photon',
    bands: { blue: 17, green: 26, red: 51, farRed: 6 },
    lux: null,
    reference: null,
    ppfdSource: null,
    par: null,
    epar: null,
    ppfd: null,
    farRedRatio: null,
    calibrated: false,
    saturated: false,
    ...over
  };
}

const flux = (over: Partial<FluxReading> = {}): FluxReading => ({
  source: 'lux',
  ppfd: 336,
  par: 336,
  epar: 360,
  tolerancePct: 15,
  ...over
});

describe('shareRows / shareTitle', () => {
  it('lists peak + four bands and titles by view', () => {
    const rows = shareRows(processed());
    expect(rows.map((r) => r.label)).toEqual(['PEAK', 'BLUE', 'GREEN', 'RED', 'FAR-RED']);
    expect(rows[0].value).toBe('639 nm');
    expect(rows.find((r) => r.label === 'RED')?.value).toBe('51 %');
    expect(shareTitle(processed())).toBe('SPECTRUM · PHOTON SHARE');
    expect(shareTitle(processed({ view: 'energy' }))).toBe('SPECTRUM · ENERGY SHARE');
  });

  it('renders a dash for a blank frame with no peak', () => {
    expect(shareRows(processed({ peakWavelengthNm: null }))[0]).toMatchObject({ value: '—', status: 'none' });
  });
});

describe('fluxRows / fluxBadge', () => {
  it('is uncalibrated with no anchors', () => {
    const p = processed();
    expect(hasFlux(p)).toBe(false);
    expect(fluxBadge(p)).toEqual({ text: 'UNCALIBRATED', tone: 'muted' });
    const rows = fluxRows(p);
    expect(rows.map((r) => r.label)).toEqual(['PPFD (PAR)', 'PPFD (lux)', 'ePAR']);
    expect(rows.find((r) => r.label === 'PPFD (PAR)')?.value).toBe('—');
    expect(rows.find((r) => r.label === 'PPFD (lux)')?.value).toBe('—');
    expect(rows.find((r) => r.label === 'ePAR')?.value).toBe('—');
  });

  it('shows a lux estimate with ≈ (and a lux-derived ePAR) when only lux is anchored', () => {
    const p = processed({ lux: flux(), par: 336, epar: 360, ppfd: 336, ppfdSource: 'lux', calibrated: true });
    expect(fluxBadge(p)).toEqual({ text: 'EST · LUX', tone: 'amber' });
    const rows = fluxRows(p);
    expect(rows.find((r) => r.label === 'PPFD (PAR)')?.value).toBe('—'); // no reference-grade PAR yet
    expect(rows.find((r) => r.label === 'PPFD (lux)')?.value).toBe('≈336 ±15%');
    expect(rows.find((r) => r.label === 'PPFD (lux)')?.status).toBe('warn');
    expect(rows.find((r) => r.label === 'ePAR')?.value).toBe('≈360'); // lux-derived estimate
  });

  it('uses the spectrometer reference for PPFD (PAR) and shows the estimate delta vs it', () => {
    const p = processed({
      lux: flux({ ppfd: 336 }),
      reference: flux({ source: 'reference', ppfd: 320, par: 320, epar: 345, tolerancePct: 5 }),
      par: 320,
      epar: 345,
      ppfd: 320,
      ppfdSource: 'reference',
      calibrated: true
    });
    expect(fluxBadge(p)).toEqual({ text: 'REF', tone: 'ok' });
    const rows = fluxRows(p);
    expect(rows.find((r) => r.label === 'PPFD (PAR)')?.value).toBe('320');
    // estimate 336 vs reference 320 → +5.0%
    expect(rows.find((r) => r.label === 'PPFD (lux)')?.value).toBe('≈336 ±15% (+5.0%)');
    expect(rows.find((r) => r.label === 'ePAR')?.value).toBe('345'); // reference-grade, no ≈
  });

  it('prefers the live Apogee as PPFD (PAR) and extends ePAR by the far-red ratio', () => {
    // The stale spectrometer reference (12) is ignored in favour of the live Apogee (145).
    const p = processed({
      lux: flux({ ppfd: 128 }),
      reference: flux({ source: 'reference', ppfd: 12, par: 12, epar: 12, tolerancePct: 5 }),
      farRedRatio: 1.05,
      par: 12,
      epar: 12,
      ppfd: 12,
      ppfdSource: 'reference',
      calibrated: true
    });
    expect(fluxBadge(p, 145)).toEqual({ text: 'MEASURED', tone: 'ok' });
    const rows = fluxRows(p, 145);
    expect(rows.find((r) => r.label === 'PPFD (PAR)')?.value).toBe('145');
    expect(rows.find((r) => r.label === 'PPFD (lux)')?.value).toBe('≈128 ±15% (-11.7%)'); // vs Apogee 145
    expect(rows.find((r) => r.label === 'ePAR')?.value).toBe('152'); // 145 × 1.05 = 152.25
  });
});
