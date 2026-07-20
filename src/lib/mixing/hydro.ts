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
