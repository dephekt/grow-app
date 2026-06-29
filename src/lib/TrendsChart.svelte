<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import uPlot from 'uplot';
  import 'uplot/dist/uPlot.min.css';

  type Pt = { t: string; v: number };
  type Series = { key: string; label: string; unit: string; points: Pt[] };

  let { series = [], height = 320 } = $props<{ series?: Series[]; height?: number }>();

  let el: HTMLDivElement;
  let plot: uPlot | null = null;
  let structureSig = '';

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

  function secs(t: string): number {
    return Math.floor(new Date(t).getTime() / 1000);
  }

  function buildData(s: Series[]): uPlot.AlignedData {
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

  function buildOpts(s: Series[], width: number): uPlot.Options {
    const colors = palette();
    const axisColor = cssVar('--muted', '#8a9099');
    const grid = 'rgba(255,255,255,0.06)';
    const units = new Set(s.map((x) => x.unit).filter(Boolean));
    // Same-unit series share a scale (directly comparable); disparate units each get
    // their own auto-ranged scale so every line stays visible. Only show y-axis tick
    // values when the whole domain shares one unit, else they'd imply a false scale.
    const singleUnit = units.size === 1;
    const yScale = s[0]?.unit || s[0]?.key || 'y';
    const mono = '11px "IBM Plex Mono", ui-monospace, monospace';

    return {
      width,
      height,
      cursor: { drag: { x: true, y: false }, points: { size: 6 } },
      legend: { live: true },
      series: [
        {},
        ...s.map((ser, i) => ({
          label: ser.unit ? `${ser.label} (${ser.unit})` : ser.label,
          scale: ser.unit || ser.key,
          stroke: colors[i % colors.length],
          width: 1.5,
          points: { show: false },
          spanGaps: true
        }))
      ],
      axes: [
        { stroke: axisColor, grid: { stroke: grid, width: 1 }, ticks: { stroke: grid, width: 1 }, font: mono },
        {
          scale: yScale,
          stroke: axisColor,
          grid: { stroke: grid, width: 1 },
          ticks: { show: false },
          size: singleUnit ? 48 : 10,
          values: singleUnit ? undefined : () => [],
          font: mono
        }
      ]
    };
  }

  function render(s: Series[]) {
    if (!el) return;
    const data = buildData(s);
    const haveData = (data[0] as number[]).length > 0;
    const sig = s.map((x) => `${x.key}:${x.unit}`).join(',');
    if (!s.length || !haveData) {
      plot?.destroy();
      plot = null;
      structureSig = '';
      return;
    }
    if (!plot || sig !== structureSig) {
      plot?.destroy();
      plot = new uPlot(buildOpts(s, el.clientWidth || 600), data, el);
      structureSig = sig;
    } else {
      plot.setData(data);
    }
  }

  onMount(() => {
    const ro = new ResizeObserver(() => {
      if (plot && el) plot.setSize({ width: el.clientWidth, height });
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

  let isEmpty = $derived(series.length === 0 || series.every((x: Series) => x.points.length === 0));
</script>

<div class="trends-chart">
  <div bind:this={el} class="uplot-host" style="min-height:{height}px"></div>
  {#if isEmpty}
    <div class="empty-state" style="height:{height}px">No history yet</div>
  {/if}
</div>

<style>
  .trends-chart {
    width: 100%;
  }
  .uplot-host {
    width: 100%;
  }
  .empty-state {
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
