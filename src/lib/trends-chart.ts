// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/**
 * The parts of the trends chart decidable without a DOM — y-axis layout, the rebuild
 * signature and the zoom window — kept out of `TrendsChart.svelte` so they can be
 * unit-tested. Client-safe: no `$lib/server` imports.
 */
import type { TrendSeries } from '$lib/trends';

/** A series with no declared unit gets a private scale, so it still autoranges alone. */
export function seriesScale(ser: Pick<TrendSeries, 'key' | 'unit'>): string {
  return ser.unit || ser.key;
}

/** Each labelled axis costs ~55px of plot width, so a narrow panel gets fewer of them. */
export function maxYAxes(width: number): number {
  return width < 480 ? 1 : width < 760 ? 2 : 3;
}

export interface YAxisPlan {
  scale: string;
  /** Empty means grid-only: no label, no values, no width. */
  unit: string;
  /** 3 = left, 1 = right; same-side axes stack outward in array order. */
  side: 1 | 3;
  /** Only the innermost y axis draws horizontal grid, or the grids overlap. */
  grid: boolean;
  /** First series on this scale — the component colours the axis to match it. */
  seriesIndex: number;
}

/**
 * One axis per distinct unit, in the order the units first appear. Units past the cap
 * still autorange correctly — uPlot ranges scales from series, not axes — they just go
 * unlabelled, which is what every unit gets today.
 */
export function yAxisPlans(series: TrendSeries[], width: number): YAxisPlan[] {
  const firstIndex = new Map<string, number>();
  series.forEach((ser, i) => {
    const scale = seriesScale(ser);
    if (!firstIndex.has(scale)) firstIndex.set(scale, i);
  });

  const united = [...firstIndex.keys()].filter((scale) => series[firstIndex.get(scale)!].unit);
  // Nothing declared a unit, so one zero-width axis still lays down the horizontal grid.
  if (united.length === 0) {
    return series.length === 0
      ? []
      : [{ scale: seriesScale(series[0]), unit: '', side: 3, grid: true, seriesIndex: 0 }];
  }

  return united.slice(0, maxYAxes(width)).map((scale, i) => ({
    scale,
    unit: scale,
    side: i % 2 === 0 ? 3 : 1,
    grid: i === 0,
    seriesIndex: firstIndex.get(scale)!
  }));
}

/** Everything `buildOpts` reads — a change here needs a rebuild, not just `setData`. */
export function structureSignature(series: TrendSeries[], width: number): string {
  const axes = yAxisPlans(series, width)
    .map((a) => `${a.scale}@${a.side}`)
    .join('|');
  return `${axes};${series.map((s) => `${s.key}:${s.unit}:${s.hidden ? 'h' : ''}`).join(',')}`;
}

export interface ZoomWindow {
  min: number;
  max: number;
}

/** uPlot's time x scale ranges to the data exactly, so a window at the bounds is unzoomed. */
export function zoomedWindow(
  xs: readonly number[],
  min: number | null | undefined,
  max: number | null | undefined
): ZoomWindow | null {
  if (min == null || max == null || xs.length === 0) return null;
  if (min <= xs[0] && max >= xs[xs.length - 1]) return null;
  return { min, max };
}

/** A window inside one day needs only clock time; a wider one needs the date. */
export function zoomWindowLabel(minSec: number, maxSec: number, timeZone?: string): string {
  const fmt = new Intl.DateTimeFormat(undefined, {
    ...(maxSec - minSec < 86400 ? {} : { month: 'short', day: 'numeric' }),
    hour: '2-digit',
    minute: '2-digit',
    timeZone
  });
  return `${fmt.format(minSec * 1000)} → ${fmt.format(maxSec * 1000)}`;
}
