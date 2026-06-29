<script lang="ts">
  import TrendsChart from '$lib/TrendsChart.svelte';

  type Pt = { t: string; v: number };
  type Series = { key: string; label: string; unit: string; points: Pt[] };

  const DOMAINS = [
    { key: 'water', label: 'Water' },
    { key: 'climate', label: 'Climate' },
    { key: 'thermal', label: 'Thermal' },
    { key: 'substrate', label: 'Substrate' }
  ] as const;
  type Domain = (typeof DOMAINS)[number]['key'];

  const RANGES = ['1h', '3h', '6h', '12h', '24h'] as const;
  type Range = (typeof RANGES)[number];

  let domain = $state<Domain>('water');
  let range = $state<Range>('6h');
  let series = $state<Series[]>([]);

  // Refetch on domain or range change, race-guarded so a slow earlier request can't
  // clobber the latest selection's result.
  $effect(() => {
    const d = domain;
    const r = range;
    let cancelled = false;
    fetch(`/api/history?domain=${d}&range=${r}`)
      .then((res) => (res.ok ? res.json() : { configured: false, series: [] }))
      .then((data: { configured: boolean; series: Series[] }) => {
        if (!cancelled) series = data.configured ? data.series : [];
      })
      .catch(() => {
        if (!cancelled) series = [];
      });
    return () => {
      cancelled = true;
    };
  });

  let isSubstrate = $derived(domain === 'substrate');
</script>

<div class="panel trends-panel">
  <div class="panel-head">
    <div class="domain-tabs">
      {#each DOMAINS as d (d.key)}
        <button type="button" class:active={d.key === domain} onclick={() => (domain = d.key)}>{d.label}</button>
      {/each}
    </div>
    <div class="range-pills">
      {#each RANGES as r (r)}
        <button type="button" class:active={r === range} onclick={() => (range = r)}>{r}</button>
      {/each}
    </div>
  </div>

  {#if isSubstrate}
    <div class="planned">
      <span class="planned-badge mono">NOT CONNECTED</span>
      <p>Substrate trends appear once the Pulse Grow probe is connected.</p>
    </div>
  {:else}
    <TrendsChart {series} height={300} />
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
