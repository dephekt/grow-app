<script lang="ts">
  const VW = 700;
  const MARGIN = { top: 14, right: 46, bottom: 18, left: 12 };

  const COLOR_MAP: Record<string, string> = {
    amber: 'var(--amber)',
    cyan: 'var(--cyan)',
    muted: 'var(--muted)'
  };
  const STROKE_MAP: Record<string, number> = { amber: 2, cyan: 1.6, muted: 1.3 };

  type HistoryPoint = { t: string; v: number };
  type HistorySeries = {
    key: string;
    label: string;
    color: 'amber' | 'cyan' | 'muted';
    points: HistoryPoint[];
  };

  let { series = [], height = 240 } = $props<{
    series?: HistorySeries[];
    height?: number;
  }>();

  let isEmpty = $derived(
    series.length === 0 || series.every((s: HistorySeries) => s.points.length === 0)
  );

  let chartW = $derived(VW - MARGIN.left - MARGIN.right);
  let chartH = $derived(height - MARGIN.top - MARGIN.bottom);

  // Only the time axis is shared. Each series is normalised to its OWN value range
  // (below) so metrics with very different units — pH ~6, air ~25, CO₂ ~900 — are
  // all legible as trend shapes in a single plot rather than three flat lines.
  let timeScale = $derived.by(() => {
    const times = series.flatMap((s: HistorySeries) =>
      s.points.map((p: HistoryPoint) => new Date(p.t).getTime())
    );
    if (times.length === 0) return null;
    const tMin = Math.min(...times);
    const tMax = Math.max(...times);
    return { tMin, tSpan: tMax - tMin || 1 };
  });

  type SeriesPath = {
    key: string;
    color: string;
    stroke: number;
    pts: string;
    latest: number | null;
    label: string;
  };

  let paths = $derived.by((): SeriesPath[] => {
    const ts = timeScale;
    if (!ts) return [];
    const cH = chartH;
    const cW = chartW;

    return series.map((s: HistorySeries) => {
      const color = COLOR_MAP[s.color] ?? 'var(--muted)';
      const stroke = STROKE_MAP[s.color] ?? 1.5;
      if (s.points.length === 0) {
        return { key: s.key, color, stroke, pts: '', latest: null, label: s.label };
      }

      const vals = s.points.map((p: HistoryPoint) => p.v);
      const vMin = Math.min(...vals);
      const vMax = Math.max(...vals);
      const pad = (vMax - vMin || 1) * 0.08;
      const lo = vMin - pad;
      const range = vMax + pad - lo || 1;

      const pts = s.points
        .map((p: HistoryPoint) => {
          const x = ((new Date(p.t).getTime() - ts.tMin) / ts.tSpan) * cW;
          const y = cH - ((p.v - lo) / range) * cH;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');

      return { key: s.key, color, stroke, pts, latest: s.points.at(-1)?.v ?? null, label: s.label };
    });
  });

  // Evenly spaced reference lines (no value labels — the y-axis is multi-scale).
  let gridLines = $derived.by(() => {
    if (!timeScale) return [];
    return [0.25, 0.5, 0.75].map((frac) => (chartH - frac * chartH).toFixed(1));
  });

  function fmt(v: number | null): string {
    if (v === null) return '—';
    return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
  }
</script>

{#if isEmpty}
  <div class="empty-state">No history yet</div>
{:else}
  <div class="chart-wrap">
    <svg viewBox="0 0 {VW} {height}" style="width:100%;height:{height}px;display:block;" aria-label="Trends chart">
      <g transform="translate({MARGIN.left},{MARGIN.top})">
        {#each gridLines as y (y)}
          <line x1="0" y1={y} x2={chartW} y2={y} stroke="rgba(255,255,255,0.05)" stroke-width="1" />
        {/each}

        {#each paths as path (path.key)}
          {#if path.pts}
            <polyline
              points={path.pts}
              fill="none"
              stroke={path.color}
              stroke-width={path.stroke}
              stroke-linejoin="round"
              stroke-linecap="round"
            />
          {/if}
        {/each}

        <text
          x={chartW + 4}
          y="0"
          text-anchor="start"
          dominant-baseline="hanging"
          fill="var(--faint)"
          font-size="10"
          font-family="var(--font-mono)">NOW</text>
      </g>
    </svg>

    <div class="legend">
      {#each series as s, i (s.key)}
        {@const path = paths[i]}
        <div class="legend-item">
          <svg width="20" height="3" aria-hidden="true" style="flex:none;">
            <rect width="20" height="2" y="0" fill={COLOR_MAP[s.color] ?? 'var(--muted)'} rx="1" />
          </svg>
          <span class="legend-label">{s.label}</span>
          <span class="mono legend-value" style="color:{COLOR_MAP[s.color] ?? 'var(--muted)'}">{fmt(path?.latest ?? null)}</span>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .chart-wrap {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: var(--faint);
    font-size: 0.85rem;
    font-family: var(--font-mono);
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 18px;
    padding: 0 4px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.78rem;
    color: var(--muted);
  }

  .legend-label {
    color: var(--text);
  }

  .legend-value {
    font-size: 0.78rem;
  }
</style>
