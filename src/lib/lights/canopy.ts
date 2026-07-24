/**
 * Pure resolution of the Lights-page Canopy PAR card from the available sources, in descending
 * order of trust. Extracted from the page component so the fallback/badging logic is unit-testable
 * (it used to live in the deleted `fluxRows`).
 *
 * A measurement is presumed the reference and shown plain; only an estimate (lux) is badged.
 */
import type { AnchorCalibration, ProcessedSpectrum } from '$lib/spectrum/calibration';

export type CanopyTone = 'amber' | 'ok' | 'muted';

export interface CanopyReading {
  /** Canopy PAR (µmol·m⁻²·s⁻¹, 400–700 nm), or null when nothing can measure it. */
  par: number | null;
  /** '≈' when the value is an estimate (lux). */
  prefix: '' | '≈';
  /** Status dot: 'ok' for a measurement, 'warn' for an estimate, '' when unavailable. */
  dot: '' | 'ok' | 'warn';
  /** A badge, shown ONLY for an estimate or an unavailable state (measurements go unbadged). */
  badge: { text: string; tone: CanopyTone } | null;
  /** ± tolerance (%) to surface, or null. */
  tol: number | null;
  /** Human-readable source line. */
  provenance: string;
  /** ePAR (400–750 nm), the PAR extended by the spectrometer's far-red share, or null without a frame. */
  epar: number | null;
}

export interface CanopyInput {
  /** A saved reading is being viewed — populate from its `active` frame rather than the live sources. */
  selected: boolean;
  /** Live Apogee PPFD (µmol), already availability-gated and dark-clamped; null if absent/offline. */
  apogeePpfd: number | null;
  /** PAR estimated from a live DLight lux reading (µmol); null when no lux/anchor. */
  luxPar: number | null;
  /** The processed spectrum for the active frame (live or the saved reading), if any. */
  active: ProcessedSpectrum | null;
  /** The stored lux anchor, for its tolerance. */
  luxAnchor: AnchorCalibration | undefined;
  /** Whether a quantum sensor entity is registered at all — distinguishes "offline" from "absent". */
  hasQuantumSensor: boolean;
}

export function resolveCanopy(input: CanopyInput): CanopyReading {
  const { selected, apogeePpfd, luxPar, active, luxAnchor, hasQuantumSensor } = input;

  // ePAR from a PAR value + the current frame's (dimming-independent) far-red share.
  const extend = (par: number | null): number | null =>
    par != null && active?.farRedRatio != null ? par * active.farRedRatio : null;

  if (selected) {
    const isLux = active?.ppfdSource === 'lux';
    const par = active?.ppfd ?? null;
    return {
      par,
      prefix: isLux ? '≈' : '',
      dot: par == null ? '' : isLux ? 'warn' : 'ok',
      badge: isLux ? { text: 'EST · LUX', tone: 'amber' } : null,
      tol: active?.reference?.tolerancePct ?? active?.lux?.tolerancePct ?? null,
      provenance: 'saved reading',
      // The saved reading carries its own anchored ePAR; only fall back to a derived one if absent.
      epar: active?.epar ?? extend(par)
    };
  }

  if (apogeePpfd != null) {
    return {
      par: apogeePpfd,
      prefix: '',
      dot: 'ok',
      badge: null,
      tol: 5,
      provenance: 'Apogee SQ-521',
      epar: extend(apogeePpfd)
    };
  }

  if (luxPar != null) {
    return {
      par: luxPar,
      prefix: '≈',
      dot: 'warn',
      badge: { text: 'EST · LUX', tone: 'amber' },
      tol: luxAnchor?.tolerancePct ?? 15,
      provenance: 'estimated from DLight lux',
      epar: extend(luxPar)
    };
  }

  return {
    par: null,
    prefix: '',
    dot: '',
    badge: { text: 'UNAVAILABLE', tone: 'muted' },
    tol: null,
    // Distinguish a registered-but-offline sensor from no sensor at all.
    provenance: hasQuantumSensor ? 'Apogee offline' : 'no quantum sensor',
    epar: null
  };
}
