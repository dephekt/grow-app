/**
 * Pure derivation of the Lights-page "spectrum photon-share" readout rows from a ProcessedSpectrum —
 * the peak wavelength and the blue/green/red/far-red band shares. Kept out of the components so the
 * row logic is unit-testable.
 */
import type { ProcessedSpectrum } from '$lib/spectrum/calibration';

export type RowStatus = 'ok' | 'warn' | 'alert' | 'none';
export interface ReadoutRow {
  label: string;
  value: string;
  status?: RowStatus;
}

export function shareTitle(p: ProcessedSpectrum): string {
  return p.view === 'energy'
    ? 'SPECTRUM · ENERGY SHARE'
    : p.view === 'raw'
      ? 'SPECTRUM · RAW SHARE'
      : 'SPECTRUM · PHOTON SHARE';
}

export function shareRows(p: ProcessedSpectrum): ReadoutRow[] {
  return [
    {
      label: 'PEAK',
      value: p.peakWavelengthNm == null ? '—' : `${p.peakWavelengthNm.toFixed(0)} nm`,
      status: p.peakWavelengthNm == null ? 'none' : 'ok'
    },
    { label: 'BLUE', value: `${p.bands.blue.toFixed(0)} %`, status: 'ok' },
    { label: 'GREEN', value: `${p.bands.green.toFixed(0)} %`, status: 'ok' },
    { label: 'RED', value: `${p.bands.red.toFixed(0)} %`, status: 'ok' },
    { label: 'FAR-RED', value: `${p.bands.farRed.toFixed(0)} %`, status: 'ok' }
  ];
}
