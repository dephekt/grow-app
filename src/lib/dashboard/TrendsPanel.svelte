<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Daniel Snider -->

<script lang="ts">
  import TrendsChart from '$lib/TrendsChart.svelte';
  import {
    DEFAULT_HISTORY_RANGE,
    DEFAULT_TREND_DOMAIN,
    HISTORY_RANGES,
    TREND_DOMAINS,
    type HistoryRange,
    type TrendDomain,
    type TrendSeries
  } from '$lib/trends';

  /**
   * How long the panel waits before giving up on a range; `fetch` has no timeout of its
   * own, so a stalled request never settles and would leave the chart dimmed for good.
   * Generous enough for a 30d scan, which is the slowest thing the pills can ask for.
   */
  const HISTORY_TIMEOUT_MS = 20_000;

  let domain = $state<TrendDomain>(DEFAULT_TREND_DOMAIN);
  let range = $state<HistoryRange>(DEFAULT_HISTORY_RANGE);
  let series = $state<TrendSeries[]>([]);
  let loading = $state(false);

  let activeDomain = $derived(TREND_DOMAINS.find((d) => d.key === domain));
  let isPlanned = $derived(activeDomain?.planned ?? false);

  // Refetch on domain or range change, race-guarded so a slow earlier request can't
  // clobber the latest selection. A `planned` domain (e.g. substrate) is a static
  // placeholder that never charts, so short-circuit without hitting the history API.
  $effect(() => {
    const d = domain;
    const r = range;
    if (TREND_DOMAINS.find((x) => x.key === d)?.planned) {
      series = [];
      loading = false;
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HISTORY_TIMEOUT_MS);
    loading = true;
    fetch(`/api/history?domain=${d}&range=${r}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : { configured: false, series: [] }))
      .then((data: { configured: boolean; series: TrendSeries[] }) => {
        if (!cancelled) series = data.configured ? data.series : [];
      })
      .catch(() => {
        if (!cancelled) series = [];
      })
      // Clears the dim on abort and timeout too, which a `.then`/`.catch` pair would miss.
      .finally(() => {
        clearTimeout(timer);
        if (!cancelled) loading = false;
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      // A 30d scan is expensive enough that switching away should stop it, not ignore it.
      controller.abort();
    };
  });
</script>

<div class="panel trends-panel">
  <div class="panel-head">
    <div class="domain-tabs">
      {#each TREND_DOMAINS as d (d.key)}
        <button type="button" class:active={d.key === domain} onclick={() => (domain = d.key)}
          >{d.label}</button
        >
      {/each}
    </div>
    <div class="range-pills">
      {#each HISTORY_RANGES as r (r)}
        <button type="button" class:active={r === range} onclick={() => (range = r)}>{r}</button>
      {/each}
    </div>
  </div>

  {#if isPlanned}
    <div class="planned">
      <span class="planned-badge mono">NOT CONNECTED</span>
      <p>{activeDomain?.label} trends appear once its probe is connected.</p>
    </div>
  {:else}
    <div class="chart-wrap" class:loading>
      <!-- Series keys are node-local objectIds, so a remount is what keeps toggles per-domain. -->
      {#key domain}
        <TrendsChart {series} height={300} />
      {/key}
    </div>
  {/if}
</div>

<style>
  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .domain-tabs {
    display: flex;
    gap: 6px;
  }
  .domain-tabs button {
    padding: 6px 12px;
    min-height: var(--tap);
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    color: var(--muted);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--r-control);
    cursor: pointer;
  }
  .domain-tabs button:hover {
    color: var(--text);
  }
  .domain-tabs button.active {
    color: var(--amber);
    border-color: var(--amber);
    background: var(--amber-dim);
  }

  /* Eight pills overflow a phone, so they scroll — wrapping would break the rounded group. */
  .range-pills {
    display: flex;
    border: 1px solid var(--line);
    border-radius: var(--r-control);
    overflow-x: auto;
    scrollbar-width: none;
  }
  .range-pills button {
    flex: 0 0 auto;
    font-family: var(--font-mono);
    font-size: 0.72rem;
    padding: 4px 10px;
    border: none;
    border-left: 1px solid var(--line);
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    min-height: var(--tap);
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

  /* A 30d scan takes long enough to notice, so the stale chart says so while it lands. */
  .chart-wrap {
    transition: opacity 0.15s ease;
  }
  .chart-wrap.loading {
    opacity: 0.55;
  }

  .planned {
    height: 300px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    border: 1px dashed var(--line);
    border-radius: var(--r-panel);
    margin-top: 14px;
    color: var(--faint);
    font-size: 0.85rem;
    text-align: center;
  }
  .planned-badge {
    font-size: 0.62rem;
    font-weight: 600;
    padding: 2px 6px;
    border: 1px solid var(--amber);
    border-radius: var(--r-pill);
    color: var(--amber);
    letter-spacing: 0.06em;
  }
  .planned p {
    margin: 0;
    max-width: 32ch;
  }
</style>
