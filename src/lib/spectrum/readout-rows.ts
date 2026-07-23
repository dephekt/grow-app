/**
 * Pure derivation of the Lights-page readout rows from a ProcessedSpectrum (+ the live Apogee PPFD).
 * The flux panel shows three numbers: PPFD (PAR) — the reference-grade 400–700 nm flux, the live Apogee
 * when present else the spectrometer's own reference anchor; PPFD (lux) — the DLight-scaled estimate,
 * marked ≈ with its delta vs the reference; and ePAR — the 400–750 nm flux, a trusted PAR extended by
 * the spectrometer's (dimming-independent) far-red shape ratio. This keeps the absolute number on the
 * Apogee and uses the spectrometer only for the far-red the Apogee can't see.
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

export function fluxRows(p: ProcessedSpectrum, apogeePpfd: number | null = null): ReadoutRow[] {
  const est = p.lux;
  const ref = p.reference;
  // PPFD (PAR): reference-grade 400–700 nm flux — the live Apogee (trusted, time-averaging) first, else
  // the spectrometer's own reference anchor. PPFD ≡ PAR: the same photon flux over 400–700 nm.
  const parPpfd = apogeePpfd ?? ref?.ppfd ?? null;
  // ePAR (400–750 nm): extend the reference PAR by the spectrometer's far-red shape ratio (dimming- and
  // exposure-independent) so a trusted Apogee PAR gains the 700–750 nm packets it can't see. Without a
  // live Apogee, fall back to the spectrometer's own anchored ePAR (reference or lux estimate).
  const epar = apogeePpfd != null ? (p.farRedRatio != null ? apogeePpfd * p.farRedRatio : null) : p.epar;

  const deltaPct = est && parPpfd != null && parPpfd > 0 ? ((est.ppfd - parPpfd) / parPpfd) * 100 : null;
  const estValue =
    est == null
      ? '—'
      : `≈${est.ppfd.toFixed(0)} ±${est.tolerancePct.toFixed(0)}%` +
        (deltaPct == null ? '' : ` (${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%)`);

  // ePAR is an estimate (≈) only when it derives from the lux path — no Apogee and no reference anchor.
  const eparIsEstimate = apogeePpfd == null && ref == null && est != null;
  const fmtEpar = (v: number | null) => (v == null ? '—' : `${eparIsEstimate ? '≈' : ''}${v.toFixed(0)}`);

  return [
    { label: 'PPFD (PAR)', value: parPpfd == null ? '—' : parPpfd.toFixed(0), status: parPpfd != null ? 'ok' : 'none' },
    { label: 'PPFD (lux)', value: estValue, status: est ? 'warn' : 'none' },
    { label: 'ePAR', value: fmtEpar(epar), status: epar == null ? 'none' : eparIsEstimate ? 'warn' : 'ok' }
  ];
}

export function fluxBadge(p: ProcessedSpectrum, apogeePpfd: number | null = null): { text: string; tone: BadgeTone } {
  if (apogeePpfd != null) return { text: 'MEASURED', tone: 'ok' };
  if (p.reference) return { text: 'REF', tone: 'ok' };
  if (p.lux) return { text: 'EST · LUX', tone: 'amber' };
  return { text: 'UNCALIBRATED', tone: 'muted' };
}
