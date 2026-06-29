<script lang="ts">
  import TrendsChart from '$lib/TrendsChart.svelte';

  type HistoryPoint = { t: string; v: number };
  type HistorySeries = {
    key: string;
    label: string;
    color: 'amber' | 'cyan' | 'muted';
    points: HistoryPoint[];
  };

  const RANGES = ['1h', '3h', '6h', '12h', '24h'] as const;
  type Range = (typeof RANGES)[number];

  let range = $state<Range>('6h');
  let series = $state<HistorySeries[]>([]);

  // Fetch on mount and whenever the range changes. Guarded against races so a
  // slow earlier request can't clobber the latest range's result.
  $effect(() => {
    const r = range;
    let cancelled = false;
    fetch(`/api/history?range=${r}`)
      .then((res) => (res.ok ? res.json() : { configured: false, series: [] }))
      .then((data: { configured: boolean; series: HistorySeries[] }) => {
        if (!cancelled) series = data.configured ? data.series : [];
      })
      .catch(() => {
        if (!cancelled) series = [];
      });
    return () => {
      cancelled = true;
    };
  });
</script>

<div class="panel trends-panel">
  <div class="panel-head">
    <span class="panel-title">// TRENDS</span>
    <div class="range-pills">
      {#each RANGES as r}
        <button class:active={r === range} onclick={() => (range = r)}>{r}</button>
      {/each}
    </div>
  </div>
  <TrendsChart {series} height={300} />
</div>

<style>
  .range-pills {
    display: flex;
    border: 1px solid var(--line);
    border-radius: var(--r-control);
    overflow: hidden;
  }

  .range-pills button {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    padding: 4px 10px;
    border: none;
    border-left: 1px solid var(--line);
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    min-height: var(--tap);
    transition: background 0.1s, color 0.1s;
  }

  .range-pills button:first-child {
    border-left: none;
  }

  .range-pills button:hover {
    background: var(--panel-2);
    color: var(--text);
  }

  .range-pills button.active {
    background: var(--amber);
    color: var(--bg);
    font-weight: 600;
  }
</style>
