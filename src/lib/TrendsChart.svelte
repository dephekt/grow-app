<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Daniel Snider -->

<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import uPlot from 'uplot';
  import 'uplot/dist/uPlot.min.css';
  import {
    structureSignature,
    yAxisPlans,
    zoomWindowLabel,
    zoomedWindow,
    type ZoomWindow
  } from '$lib/trends-chart';
  import type { TrendSeries } from '$lib/trends';

  let { series = [], height = 320 } = $props<{ series?: TrendSeries[]; height?: number }>();

  let el: HTMLDivElement;
  let plot: uPlot | null = null;
  let structureSig = '';

  let zoom = $state<ZoomWindow | null>(null);

  function cssVar(name: string, fallback: string): string {
    if (typeof document === 'undefined') return fallback;
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  function palette(): string[] {
    return [
      cssVar('--amber', '#ffb000'),
      cssVar('--cyan', '#38d6c8'),
      cssVar('--ok', '#3fb950'),
      cssVar('--alert', '#f0563a'),
      '#a06bff',
      '#e4c441',
      '#ff8a5c',
      '#6bb3ff'
    ];
  }

  // The theme CSS vars are constant for the page lifetime.
  let themeCache: { colors: string[]; axis: string } | null = null;
  function theme() {
    if (!themeCache) themeCache = { colors: palette(), axis: cssVar('--muted', '#8a9099') };
    return themeCache;
  }

  function secs(t: string): number {
    return Math.floor(new Date(t).getTime() / 1000);
  }

  function buildData(s: TrendSeries[]): uPlot.AlignedData {
    const times = new Set<number>();
    for (const ser of s) for (const p of ser.points) times.add(secs(p.t));
    const xs = [...times].sort((a, b) => a - b);
    const idx = new Map(xs.map((t, i) => [t, i]));
    const ys = s.map((ser) => {
      const arr = new Array<number | null>(xs.length).fill(null);
      for (const p of ser.points) {
        const i = idx.get(secs(p.t));
        if (i != null) arr[i] = p.v;
      }
      return arr;
    });
    return [xs, ...ys] as uPlot.AlignedData;
  }

  function buildOpts(s: TrendSeries[], width: number): uPlot.Options {
    const { colors, axis: axisColor } = theme();
    const grid = 'rgba(255,255,255,0.06)';
    const mono = '11px "IBM Plex Mono", ui-monospace, monospace';
    const labelFont = '600 10px "IBM Plex Mono", ui-monospace, monospace';
    const plans = yAxisPlans(s, width);

    return {
      width,
      height,
      cursor: { drag: { x: true, y: false }, points: { size: 6 } },
      legend: { live: true },
      hooks: {
        // Fires per scale; only x is draggable, so only x can be zoomed.
        setScale: [
          (u: uPlot, key: string) => {
            if (key === 'x')
              zoom = zoomedWindow(u.data[0] as number[], u.scales.x.min, u.scales.x.max);
          }
        ]
      },
      series: [
        {},
        ...s.map((ser, i) => ({
          label: ser.unit ? `${ser.label} (${ser.unit})` : ser.label,
          scale: ser.unit || ser.key,
          stroke: colors[i % colors.length],
          width: 1.5,
          show: !ser.hidden,
          points: { show: false },
          spanGaps: true
        }))
      ],
      axes: [
        {
          stroke: axisColor,
          grid: { stroke: grid, width: 1 },
          ticks: { stroke: grid, width: 1 },
          font: mono
        },
        ...plans.map((p) => ({
          scale: p.scale,
          side: p.side,
          // An empty-string label still reserves labelSize, so an unlabelled axis omits it.
          label: p.unit || undefined,
          labelSize: p.unit ? 15 : 0,
          labelFont,
          values: p.unit ? undefined : () => [],
          size: p.unit ? 42 : 0,
          // One axis owns the horizontal grid; a second set would overlap it.
          grid: { show: p.grid, stroke: grid, width: 1 },
          ticks: { show: false },
          // With several axes the colour is what pairs one with its lines.
          stroke: plans.length > 1 ? colors[p.seriesIndex % colors.length] : axisColor,
          font: mono
        }))
      ]
    };
  }

  function render(s: TrendSeries[]) {
    if (!el) return;
    if (!s.length || !s.some((x) => x.points.length > 0)) {
      plot?.destroy();
      plot = null;
      structureSig = '';
      zoom = null;
      return;
    }
    const width = el.clientWidth || 600;
    const data = buildData(s);
    const sig = structureSignature(s, width);
    if (!plot || sig !== structureSig) {
      plot?.destroy();
      plot = new uPlot(buildOpts(s, width), data, el);
      structureSig = sig;
    } else {
      plot.setData(data);
    }
  }

  /** uPlot's own dblclick reset, which reaches an `autoScaleX` we cannot call. */
  function resetZoom() {
    const xs = plot?.data[0];
    if (!plot || !xs?.length) return;
    plot.setScale('x', { min: xs[0], max: xs[xs.length - 1] });
    plot.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
  }

  onMount(() => {
    const ro = new ResizeObserver(() => {
      if (!plot || !el) return;
      // Crossing a width class adds or drops an axis, which only a rebuild can do.
      if (structureSignature(series, el.clientWidth) !== structureSig) render(series);
      else plot.setSize({ width: el.clientWidth, height });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      plot?.destroy();
      plot = null;
    };
  });

  $effect(() => {
    const s = series;
    untrack(() => render(s));
  });

  let isEmpty = $derived(
    series.length === 0 || series.every((x: TrendSeries) => x.points.length === 0)
  );
</script>

<div class="trends-chart" style="min-height:{height}px">
  <div bind:this={el} class="uplot-host"></div>
  {#if isEmpty}
    <div class="empty-state">No history yet</div>
  {:else if zoom}
    <button
      type="button"
      class="zoom-chip mono"
      title="Reset zoom (or double-click the chart)"
      onclick={resetZoom}
    >
      {zoomWindowLabel(zoom.min, zoom.max)} ✕
    </button>
  {:else}
    <span class="zoom-hint mono">drag to zoom</span>
  {/if}
</div>

<style>
  /* The empty-state overlays the chart host rather than stacking under it; the top strip
     keeps the zoom control clear of the axes' topmost tick. */
  .trends-chart {
    width: 100%;
    position: relative;
    padding-top: 18px;
  }
  .uplot-host {
    width: 100%;
  }

  /* Both sit over the plot's top-right, where uPlot leaves margin above the grid. */
  .zoom-chip,
  .zoom-hint {
    position: absolute;
    top: 0;
    right: 0;
    font-size: 0.62rem;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }
  .zoom-hint {
    color: var(--faint);
  }
  .zoom-chip {
    padding: 2px 7px;
    color: var(--cyan);
    background: transparent;
    border: 1px solid var(--cyan);
    border-radius: var(--r-pill);
    cursor: pointer;
  }
  .zoom-chip:hover {
    background: var(--panel-2);
  }

  /* uPlot draws the drag region already, but its default 7% black is invisible on a dark
     panel. The edges are what tell you where the zoom will land, so they get full colour. */
  :global(.trends-chart .u-select) {
    background: color-mix(in srgb, var(--cyan) 12%, transparent);
    border-left: 1px solid var(--cyan);
    border-right: 1px solid var(--cyan);
  }

  .empty-state {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--faint);
    font-size: 0.85rem;
    font-family: var(--font-mono);
  }

  /* Dark-theme uPlot's HTML legend (click a series to toggle it). */
  :global(.trends-chart .u-legend) {
    color: var(--muted);
    font-size: 0.74rem;
    margin-top: 8px;
  }
  :global(.trends-chart .u-legend .u-value) {
    color: var(--text);
    font-family: var(--font-mono);
  }
  :global(.trends-chart .u-legend .u-series.u-off) {
    opacity: 0.4;
  }
  :global(.trends-chart .u-legend .u-series th) {
    cursor: pointer;
    font-weight: 500;
  }
</style>
