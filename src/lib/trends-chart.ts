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

/** Legend show-state by series key; a key the legend has not spoken for falls back to `hidden`. */
export type ShowState = ReadonlyMap<string, boolean>;

/** The legend outranks `hidden`, which only seeds it. */
export function isSeriesShown(ser: Pick<TrendSeries, 'key' | 'hidden'>, show?: ShowState): boolean {
  return show?.get(ser.key) ?? !ser.hidden;
}

/** True once the legend has switched off every series there is. */
export function allSeriesHidden(
  series: readonly Pick<TrendSeries, 'key' | 'hidden'>[],
  show?: ShowState
): boolean {
  return series.length > 0 && !series.some((ser) => isSeriesShown(ser, show));
}

/**
 * Which series actually draw a line: legend on, samples present, and — once the plot exists — on a
 * scale uPlot really ranged, which is its own test for whether an axis can show anything.
 */
export function drawnSeries(
  series: readonly TrendSeries[],
  show: ShowState | undefined,
  rangedScales: ReadonlySet<string> | null
): boolean[] {
  return series.map(
    (ser) =>
      isSeriesShown(ser, show) &&
      ser.points.length > 0 &&
      (rangedScales === null || rangedScales.has(seriesScale(ser)))
  );
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
 * One axis per distinct unit, in the order the units first appear, counting only the series
 * `drawn` admits. Units past the cap still autorange correctly — uPlot ranges scales from series,
 * not axes — they just go unlabelled, which is what every unit gets today.
 */
export function yAxisPlans(
  series: TrendSeries[],
  width: number,
  drawn?: readonly boolean[]
): YAxisPlan[] {
  if (series.length === 0) return [];
  const firstIndex = new Map<string, number>();
  let firstDrawn = -1;
  series.forEach((ser, i) => {
    if (drawn && !drawn[i]) return;
    if (firstDrawn < 0) firstDrawn = i;
    const scale = seriesScale(ser);
    if (!firstIndex.has(scale)) firstIndex.set(scale, i);
  });

  const united = [...firstIndex.keys()].filter((scale) => series[firstIndex.get(scale)!].unit);
  // Nothing drawn declared a unit, so one zero-width axis still lays down the horizontal grid.
  if (united.length === 0) {
    const i = firstDrawn < 0 ? 0 : firstDrawn;
    return [{ scale: seriesScale(series[i]), unit: '', side: 3, grid: true, seriesIndex: i }];
  }

  return united.slice(0, maxYAxes(width)).map((scale, i) => ({
    scale,
    unit: scale,
    side: i % 2 === 0 ? 3 : 1,
    grid: i === 0,
    seriesIndex: firstIndex.get(scale)!
  }));
}

/** One fixed axis slot and what it renders now; an empty unit parks it. */
export interface YAxisSlot {
  /** Always a declared scale key, so `u.scales[scale]` exists even while parked. */
  scale: string;
  unit: string;
  /** Index into the declared series array — the component colours the axis to match. */
  seriesIndex: number;
  side: 1 | 3;
  grid: boolean;
}

/**
 * uPlot cannot add axes after construction, so the declared plan fixes how many slots there are
 * and which side each takes, and the drawn plan decides what each one currently shows.
 */
export function yAxisSlots(
  series: TrendSeries[],
  width: number,
  drawn?: readonly boolean[]
): YAxisSlot[] {
  const declared = yAxisPlans(series, width);
  // Without a mask the two plans are the same walk, and this runs once per settled scale.
  const live = drawn ? yAxisPlans(series, width, drawn) : declared;
  return declared.map((slot, i) => {
    const plan: YAxisPlan | undefined = live[i];
    return {
      scale: plan?.scale ?? slot.scale,
      unit: plan?.unit ?? '',
      seriesIndex: plan?.seriesIndex ?? slot.seriesIndex,
      side: slot.side,
      grid: slot.grid
    };
  });
}

/** A ctrl-click fires the legend hook once per series, so the reconcile needs a cheap guard. */
export function yAxisSlotSignature(slots: readonly YAxisSlot[]): string {
  return slots.map((s) => `${s.scale}:${s.unit}:${s.seriesIndex}`).join('|');
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
