/**
 * Live batch readings for the Mixing page — the hydro kit's EC + pH, pulled from the shared
 * snapshot. Matched by device_class (`conductivity` / `ph`) so it doesn't hinge on a specific
 * object id or node. EC is normalized to mS/cm so it compares like-for-like with the target EC
 * (the kit reports µS/cm; Athena targets are mS/cm).
 */
import type { Snapshot } from '$lib/server/mqtt/types';

export interface HydroReading {
  /** Numeric reading, as reported. */
  value: number;
  /** Original unit string from the entity (e.g. "µS/cm", "pH"). */
  unit: string;
  updatedAt: string | null;
}

export interface HydroReadings {
  /** EC normalized to mS/cm (`mScm`) alongside the raw reading. */
  ec: (HydroReading & { mScm: number }) | null;
  ph: HydroReading | null;
}

export interface BatchEcDisplay {
  value: string;
  unit: string;
}

/**
 * How to show a live batch EC next to the mS/cm mix target. At nutrient strength it reads in mS/cm
 * (matching the target), but below 0.1 mS/cm a fresh-water fill (a few µS/cm) would round to a
 * misleading "0.00 mS/cm" — so show the probe's own reading verbatim (e.g. "2.89 µS/cm"), matching
 * the water card. The target-delta stays in mS/cm regardless.
 */
export function formatBatchEc(reading: HydroReading & { mScm: number }): BatchEcDisplay {
  if (reading.mScm < 0.1) return { value: String(Math.round(reading.value * 100) / 100), unit: reading.unit };
  return { value: reading.mScm.toFixed(2), unit: 'mS/cm' };
}

/** µS/cm → mS/cm; pass mS/cm through. Unknown unit is assumed mS/cm. */
export function ecToMilliSiemens(raw: number, unit: string | undefined): number {
  const u = (unit ?? '').toLowerCase();
  if (u.includes('ms')) return raw; // already mS/cm
  // µS/cm — accept the micro sign (µ, U+00B5), the Greek mu (μ, U+03BC), and the ASCII "us" fallback.
  if (u.includes('µs') || u.includes('μs') || u.includes('us')) return raw / 1000;
  return raw;
}

/** Read the live EC + pH from the hydro kit's sensor entities. Null for absent/non-numeric. */
export function selectHydroReadings(snapshot: Snapshot): HydroReadings {
  const read = (deviceClass: string): HydroReading | null => {
    const entity = snapshot.entities.find((e) => e.component === 'sensor' && e.deviceClass === deviceClass);
    if (!entity) return null;
    const state = snapshot.states[entity.id];
    if (!state || state.value == null || state.value.trim() === '') return null;
    const value = Number(state.value);
    if (!Number.isFinite(value)) return null;
    return { value, unit: entity.unit ?? '', updatedAt: state.updatedAt };
  };

  const ec = read('conductivity');
  return {
    ec: ec ? { ...ec, mScm: ecToMilliSiemens(ec.value, ec.unit) } : null,
    ph: read('ph')
  };
}
