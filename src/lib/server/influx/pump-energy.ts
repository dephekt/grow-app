import { getInfluxConfig, getInfluxDB } from './client';
import { READING_MEASUREMENT } from './query';

/**
 * Per-event pump energy from InfluxDB (grow-app #81). The recorder writes each pump-power
 * reading as measurement `reading`, float field `value`, tags node/entity (see recorder.ts
 * + query.ts). Here we pull the raw power samples over a run's time window and integrate
 * them into watt-hours, plus the peak watts (used to decide whether the pump drew at all).
 *
 * Integration is done in JS rather than Flux `integral()` so the trapezoidal math, the
 * empty-window → measured-zero mapping, and the peak are all under our control and unit
 * testable without a live InfluxDB.
 */

export interface PowerSample {
  tMs: number;
  watts: number;
}

export interface PumpWindowResult {
  /** Trapezoidal integral of power over the window, in watt-hours. */
  energyWh: number;
  /** Highest sampled power in the window, in watts. 0 for an empty window. */
  peakW: number;
  sampleCount: number;
}

/** Trapezoidal integral (→ Wh) and peak of a power series. Sorts defensively; a single
 *  sample yields 0 Wh (no interval) but a real peak; an empty series is a measured zero. */
export function integratePower(samples: PowerSample[]): PumpWindowResult {
  if (samples.length === 0) return { energyWh: 0, peakW: 0, sampleCount: 0 };
  const sorted = [...samples].sort((a, b) => a.tMs - b.tMs);
  let peakW = 0;
  let wattMs = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].watts > peakW) peakW = sorted[i].watts;
    if (i > 0) {
      const dtMs = sorted[i].tMs - sorted[i - 1].tMs;
      wattMs += ((sorted[i].watts + sorted[i - 1].watts) / 2) * dtMs;
    }
  }
  return { energyWh: wattMs / 3_600_000, peakW, sampleCount: sorted.length };
}

function escapeFluxString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Integrate the pump plug's power over [startIso, stopIso]. Returns null when InfluxDB is
 * not configured, the query errors (transient), OR the window held no samples at all — an
 * empty window means the recorder had no pump-power data (a gap / the plug offline), not a
 * measured zero: a healthy plug reports readings even at idle, so a genuinely dry short shot
 * still yields near-zero samples (peak below the draw floor → no-draw warning). Null in every
 * case leaves the row unmeasured so it retries and never caches a false "no draw".
 *
 * `startIso`/`stopIso` are our own toISOString() values interpolated as bare RFC3339 time
 * literals (Flux accepts them unquoted); node/entity are fixed constants but escaped anyway.
 */
export async function queryPumpWindow(
  node: string,
  entity: string,
  startIso: string,
  stopIso: string
): Promise<PumpWindowResult | null> {
  const config = getInfluxConfig();
  const db = getInfluxDB(config);
  if (!config || !db) return null;

  const flux = `from(bucket: "${escapeFluxString(config.bucket)}")
  |> range(start: ${startIso}, stop: ${stopIso})
  |> filter(fn: (r) => r._measurement == "${READING_MEASUREMENT}" and r._field == "value")
  |> filter(fn: (r) => r.node == "${escapeFluxString(node)}" and r.entity == "${escapeFluxString(entity)}")
  |> keep(columns: ["_time", "_value"])`;

  const samples: PowerSample[] = [];
  const queryApi = db.getQueryApi(config.org);
  try {
    for await (const { values, tableMeta } of queryApi.iterateRows(flux)) {
      const row = tableMeta.toObject(values) as Record<string, unknown>;
      const watts = Number(row._value);
      const tMs = Date.parse(String(row._time));
      if (Number.isFinite(watts) && Number.isFinite(tMs)) samples.push({ tMs, watts });
    }
  } catch (err) {
    console.warn('[influx] queryPumpWindow error:', err);
    return null;
  }
  // No samples ⇒ a data gap, not a measured zero. Stay unmeasured (retry later) rather than
  // caching a 0-peak that would render as a permanent, un-retryable false no-draw warning.
  if (samples.length === 0) return null;
  return integratePower(samples);
}
