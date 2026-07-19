/**
 * Pure derivation of the Lights-page readout rows from a ProcessedSpectrum. Extracted from the old
 * SpectrumTiles component so the flux and share panels can live in separate cards (the redesign
 * splits them) and so the row logic is unit-testable. Two flux sources are always shown so an
 * estimate is never mistaken for a reference: the lux estimate (≈, ±tolerance) and the Apogee
 * reference (plain). When both exist, the estimate carries its delta vs the reference.
 */
import type { ProcessedSpectrum } from '$lib/spectrum/calibration';

export type RowStatus = 'ok' | 'warn' | 'alert' | 'none';
export interface ReadoutRow {
  label: string;
  value: string;
  status?: RowStatus;
}
export type BadgeTone = 'amber' | 'ok' | 'muted';

/** True once either flux source (lux estimate or Apogee reference) is available. */
export function hasFlux(p: ProcessedSpectrum): boolean {
  return p.lux != null || p.reference != null;
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

export function fluxRows(p: ProcessedSpectrum): ReadoutRow[] {
  const est = p.lux;
  const ref = p.reference;
  const anyFlux = est != null || ref != null;
  const primary = ref ?? est;
  const deltaPct = est && ref && ref.ppfd > 0 ? ((est.ppfd - ref.ppfd) / ref.ppfd) * 100 : null;

  const fmtRef = (v: number | null) => (v == null ? '—' : v.toFixed(0));
  const estValue =
    est == null
      ? '—'
      : `≈${est.ppfd.toFixed(0)} ±${est.tolerancePct.toFixed(0)}%` +
        (deltaPct == null ? '' : ` (${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%)`);
  const primPrefix = primary?.source === 'lux' ? '≈' : '';
  const fmtPrim = (v: number | null) => (v == null ? '—' : `${primPrefix}${v.toFixed(0)}`);
  const primStatus: RowStatus = !anyFlux ? 'none' : primary?.source === 'lux' ? 'warn' : 'ok';

  return [
    { label: 'PPFD (ref)', value: fmtRef(ref?.ppfd ?? null), status: ref ? 'ok' : 'none' },
    { label: 'PPFD (lux)', value: estValue, status: est ? 'warn' : 'none' },
    { label: 'PAR', value: fmtPrim(p.par), status: primStatus },
    { label: 'ePAR', value: fmtPrim(p.epar), status: primStatus }
  ];
}

export function fluxBadge(p: ProcessedSpectrum): { text: string; tone: BadgeTone } {
  if (p.reference) return { text: 'REF', tone: 'ok' };
  if (p.lux) return { text: 'EST · LUX', tone: 'amber' };
  return { text: 'UNCALIBRATED', tone: 'muted' };
}
