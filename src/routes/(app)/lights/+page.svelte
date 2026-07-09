<script lang="ts">
  import { getLiveSnapshot } from '$lib/live-snapshot-context';
  import LightCard from '$lib/lights/LightCard.svelte';

  const live = getLiveSnapshot();
  const lights = $derived(live.snapshot.lights ?? []);
</script>

<svelte:head>
  <title>Lights · {live.snapshot.site}</title>
  <meta name="description" content="Grow lights — on/off, photoperiod schedule, and dimming per light" />
</svelte:head>

<div class="lights-page">
  {#if lights.length === 0}
    <div class="panel empty-state">
      <p class="muted">
        No lights configured yet. Devices announce a light by publishing a
        <code>grow-lights.v1</code> fragment to <code>&lt;node&gt;/_lights/config</code>.
      </p>
    </div>
  {:else}
    <div class="lights-grid">
      {#each lights as light (light.id)}
        <LightCard {light} {live} />
      {/each}
    </div>
  {/if}
</div>

<style>
  .lights-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: var(--gap);
    align-items: start;
  }

  .empty-state {
    padding: 32px;
    text-align: center;
  }

  .muted {
    color: var(--muted);
  }

  code {
    font-family: var(--font-mono);
    font-size: 0.85em;
    color: var(--text);
  }
</style>
