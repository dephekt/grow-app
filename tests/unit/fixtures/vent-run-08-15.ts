// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/**
 * The 13:05 vent run of 2026-08-15, at the rig's 10 s publish cadence: [tempC, rhPct].
 *
 * Pulled from InfluxDB (`daniel-home`, node `atoms3u-sensor-rig`). This is the run that put the
 * tent at 1.42 kPa while the loop's 5 min median still read 1.14 — it starts at air VPD 0.899,
 * the reading that triggered the start, and peaks at 1.45.
 *
 * Shared so the law-level replay and the loop-level one cannot drift onto different traces.
 */
export const VENT_RUN_08_15: ReadonlyArray<readonly [number, number]> = [
  [29.18, 77.77],
  [29.21, 77.76],
  [29.17, 77.82],
  [29.18, 77.81],
  [29.19, 77.88],
  [29.19, 77.82],
  [29.2, 77.81],
  [29.2, 77.88],
  [29.19, 77.85],
  [29.2, 77.89],
  [29.21, 77.84],
  [29.2, 77.81],
  [29.2, 77.87],
  [29.19, 77.66],
  [29.21, 76.57],
  [29.17, 75.36],
  [29.2, 73.51],
  [29.18, 72.72],
  [29.19, 72.17],
  [29.17, 70.36],
  [29.14, 69.52],
  [29.17, 69.1],
  [29.13, 67.64],
  [29.11, 66.99],
  [29.11, 66.62],
  [29.08, 65.75],
  [29.05, 65.46],
  [29.04, 64.74],
  [29.04, 65.32],
  [29.01, 65.29],
  [28.98, 63.71],
  [28.91, 64.33],
  [28.94, 64.04],
  [28.88, 64.04],
  [28.87, 65.51],
  [28.83, 66.68],
  [28.78, 66.92],
  [28.77, 67.24],
  [28.71, 67.46],
  [28.67, 67.61]
];
