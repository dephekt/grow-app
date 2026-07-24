import { describe, it, expect } from 'vitest';
import { resolveCanopy, type CanopyInput } from '$lib/lights/canopy';
import type { AnchorCalibration, ProcessedSpectrum } from '$lib/spectrum/calibration';

function spectrum(over: Partial<ProcessedSpectrum> = {}): ProcessedSpectrum {
  return {
    relative: [],
    peakWavelengthNm: null,
    peaks: [],
    view: 'photon',
    bands: { blue: 0, green: 0, red: 0, farRed: 0 },
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

const base: CanopyInput = {
  selected: false,
  apogeePpfd: null,
  luxPar: null,
  active: null,
  luxAnchor: undefined,
  hasQuantumSensor: false
};

describe('resolveCanopy', () => {
  it('prefers the live Apogee — unbadged, ±5%, far-red-extended ePAR', () => {
    const r = resolveCanopy({ ...base, apogeePpfd: 146, active: spectrum({ farRedRatio: 1.05 }), hasQuantumSensor: true });
    expect(r.par).toBe(146);
    expect(r.prefix).toBe('');
    expect(r.dot).toBe('ok');
    expect(r.badge).toBeNull();
    expect(r.tol).toBe(5);
    expect(r.provenance).toBe('Apogee SQ-521');
    expect(r.epar).toBeCloseTo(153.3, 1); // 146 × 1.05
  });

  it('falls back to a badged DLight lux estimate when the Apogee is absent', () => {
    const anchor = { tolerancePct: 15 } as AnchorCalibration;
    const r = resolveCanopy({ ...base, luxPar: 128, active: spectrum({ farRedRatio: 1.04 }), luxAnchor: anchor });
    expect(r.par).toBe(128);
    expect(r.prefix).toBe('≈');
    expect(r.dot).toBe('warn');
    expect(r.badge).toEqual({ text: 'EST · LUX', tone: 'amber' });
    expect(r.tol).toBe(15);
    expect(r.provenance).toBe('estimated from DLight lux');
    expect(r.epar).toBeCloseTo(133.1, 1);
  });

  it('reports "Apogee offline" when the sensor is registered but has no live value', () => {
    const r = resolveCanopy({ ...base, hasQuantumSensor: true });
    expect(r.par).toBeNull();
    expect(r.badge).toEqual({ text: 'UNAVAILABLE', tone: 'muted' });
    expect(r.provenance).toBe('Apogee offline');
    expect(r.epar).toBeNull();
  });

  it('reports "no quantum sensor" when none is registered', () => {
    const r = resolveCanopy(base);
    expect(r.provenance).toBe('no quantum sensor');
    expect(r.badge?.text).toBe('UNAVAILABLE');
  });

  it('a saved reference reading shows plain + ok and uses its OWN anchored ePAR', () => {
    const active = spectrum({
      ppfd: 300,
      ppfdSource: 'reference',
      epar: 315,
      reference: { source: 'reference', ppfd: 300, par: 300, epar: 315, tolerancePct: 5 },
      farRedRatio: 1.2
    });
    const r = resolveCanopy({ ...base, selected: true, active, apogeePpfd: 999 /* ignored while a reading is selected */ });
    expect(r.par).toBe(300);
    expect(r.prefix).toBe('');
    expect(r.dot).toBe('ok');
    expect(r.badge).toBeNull();
    expect(r.provenance).toBe('saved reading');
    expect(r.epar).toBe(315); // its own ePAR, not 300 × 1.2
  });

  it('a saved LUX-estimated reading is badged EST · LUX with amber warn and ≈', () => {
    const active = spectrum({
      ppfd: 250,
      ppfdSource: 'lux',
      epar: 260,
      lux: { source: 'lux', ppfd: 250, par: 250, epar: 260, tolerancePct: 15 },
      farRedRatio: 1.04
    });
    const r = resolveCanopy({ ...base, selected: true, active });
    expect(r.prefix).toBe('≈');
    expect(r.dot).toBe('warn');
    expect(r.badge).toEqual({ text: 'EST · LUX', tone: 'amber' });
  });

  it('ePAR is null without a spectrometer frame (no farRedRatio)', () => {
    const r = resolveCanopy({ ...base, apogeePpfd: 146, active: null, hasQuantumSensor: true });
    expect(r.par).toBe(146);
    expect(r.epar).toBeNull();
  });
});
