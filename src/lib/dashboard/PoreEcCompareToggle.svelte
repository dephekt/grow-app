<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Daniel Snider -->

<script lang="ts">
  import { poreEcCompare } from '$lib/substrate-compare.svelte';

  let { compact = false } = $props<{ compact?: boolean }>();
</script>

<button
  type="button"
  class="compare mono"
  class:compact
  class:on={poreEcCompare.enabled}
  aria-pressed={poreEcCompare.enabled}
  title={poreEcCompare.title}
  onclick={() => poreEcCompare.toggle()}
>
  {poreEcCompare.label}
</button>

<style>
  .compare {
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    padding: 2px 7px;
    color: var(--muted);
    background: transparent;
    border: 1px solid var(--line);
    border-radius: var(--r-pill);
    cursor: pointer;
    white-space: nowrap;
  }
  .compare:hover {
    color: var(--text);
    border-color: var(--line-strong);
  }
  .compare.on {
    color: var(--cyan);
    border-color: var(--cyan);
    background: color-mix(in srgb, var(--cyan) 12%, transparent);
  }
  .compare.compact {
    min-height: var(--tap);
    padding: 4px 10px;
    font-size: 0.68rem;
  }
</style>
