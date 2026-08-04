// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { getInfluxConfig, getInfluxDB } from './client';
import { READING_MEASUREMENT, escapeFluxString } from './query';

/**
 * Per-event pump energy from InfluxDB: raw power samples over a run's window, integrated to
 * watt-hours plus the peak watts.
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

/** Trapezoidal integral (→ Wh) and peak of a power series. */
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

/**
 * Integrate the pump plug's power over [startIso, stopIso]; null when InfluxDB is not
 * configured, the query errors, or the window held no samples (left unmeasured so it retries).
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
  // No samples ⇒ a data gap, not a measured zero: stay unmeasured so it retries.
  if (samples.length === 0) return null;
  return integratePower(samples);
}
