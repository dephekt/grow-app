<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { createLiveSnapshot } from '$lib/live-snapshot.svelte';
  import { setLiveSnapshotContext } from '$lib/live-snapshot-context';
  import CommandBar from '$lib/CommandBar.svelte';

  let { data, children } = $props();

  // Single shared live snapshot for the whole app — one SSE connection, provided
  // to every page via context. The command bar and pages all read from it.
  // Seed once from the load data (untrack: SSE drives all updates after this).
  const live = setLiveSnapshotContext(createLiveSnapshot(untrack(() => data.snapshot)));

  onMount(() => live.connect());
</script>

<div class="app-shell">
  <CommandBar {live} user={data.user} />
  <main class="app-main">
    {@render children()}
  </main>
</div>

<style>
  .app-shell {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  .app-main {
    flex: 1;
    width: 100%;
    max-width: 1280px;
    margin-inline: auto;
    padding: var(--gap);
  }
</style>
