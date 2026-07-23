import { describe, it, expect } from 'vitest';
import type { ProcessedSpectrum } from '$lib/spectrum/calibration';
import { shareRows, shareTitle } from '$lib/spectrum/readout-rows';

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
