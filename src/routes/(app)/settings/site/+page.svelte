<script lang="ts">
  import { untrack } from 'svelte';
  import type { ReconcileReport } from '$lib/server/mqtt/tz-reconciler';
  import type { TimeZoneSource } from '$lib/server/settings/site-timezone';

  let { data } = $props();

  // Seed the picker from the effective zone; managed locally as the admin edits + saves.
  let selected = $state<string>(untrack(() => data.timezone));
  let stored = $state<string | null>(untrack(() => data.stored));
  let source = $state<TimeZoneSource>(untrack(() => data.source));
  let filter = $state('');
  let saving = $state(false);
  let error = $state<string | null>(null);
  let saved = $state(false);
  let report = $state<ReconcileReport | null>(null);

  const zones = $derived(data.zones);

  // Client-side type-to-narrow: the full IANA list is ~600 entries, so a plain filter box
  // over a native <select> keeps it usable without pulling in a combobox dependency.
  const visibleZones = $derived(
    filter.trim() ? zones.filter((z) => z.toLowerCase().includes(filter.trim().toLowerCase())) : zones
  );

  // Only meaningful when nothing is persisted — explains which env/host default is winning
  // right now so the admin knows what they'd be overriding.
  const sourceHint = $derived.by(() => {
    if (stored !== null) return null;
    const label: Record<TimeZoneSource, string> = {
      stored: 'saved setting',
      'schedule-env': 'GROW_SCHEDULE_TZ',
      'tz-env': 'TZ',
      host: 'the host clock',
      utc: 'the UTC fallback'
    };
    return `currently defaulting to ${data.timezone} (from ${label[source]})`;
  });

  async function save(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    error = null;
    saved = false;
    report = null;
    saving = true;
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ timezone: selected })
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        timezone?: string;
        report?: ReconcileReport;
      };
      if (!response.ok) {
        error = body.error ?? 'Could not save time zone';
        return;
      }
      stored = body.timezone ?? selected;
      source = 'stored';
      report = body.report ?? null;
      saved = true;
    } catch {
      error = 'Could not save time zone';
    } finally {
      saving = false;
    }
  }
</script>

<section class="site">
  <header>
    <a class="back" href="/">← Dashboard</a>
    <h1>Site settings</h1>
  </header>

  <form onsubmit={save}>
    <h2>Time zone</h2>
    <p class="lead">
      The one IANA zone for this site — drives the irrigation schedule, the lights countdown, and the time pushed to
      devices.
    </p>

    {#if sourceHint}<p class="hint">{sourceHint}</p>{/if}

    <label>
      Filter
      <input type="text" bind:value={filter} placeholder="e.g. Chicago" autocapitalize="none" />
    </label>

    <label>
      Zone
      <select bind:value={selected} size="10">
        {#each visibleZones as zone (zone)}
          <option value={zone}>{zone}</option>
        {/each}
      </select>
    </label>

    <div class="row">
      <span class="current">Saved: <strong>{stored ?? '—'}</strong></span>
      <button type="submit" disabled={saving || selected === stored}>Save</button>
    </div>

    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if saved}
      <p class="ok" role="status">
        Saved {stored}.
        {#if report}
          {#if report.pushed.length}Pushed to {report.pushed.length} device{report.pushed.length === 1 ? '' : 's'}.
          {/if}
          {#if report.inSync.length}{report.inSync.length} already in sync. {/if}
          {#if report.failed.length}{report.failed.length} could not be reached. {/if}
          {#if report.pushed.length === 0 && report.inSync.length === 0 && report.failed.length === 0}No tz-capable
            devices connected.{/if}
        {/if}
      </p>
    {/if}
  </form>
</section>

<style>
  .site {
    display: flex;
    flex-direction: column;
    gap: 18px;
    max-width: 520px;
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 16px;
  }
  .back {
    font-size: 0.72rem;
    color: var(--muted);
  }
  h1 {
    font-size: 1.1rem;
    color: var(--text);
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  h2 {
    font-size: 0.9rem;
    color: var(--text);
  }
  .lead {
    font-size: 0.74rem;
    color: var(--muted);
  }
  .hint {
    font-size: 0.74rem;
    color: var(--amber);
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.7rem;
    color: var(--muted);
  }
  input[type='text'],
  select {
    padding: 8px 10px;
    background: var(--bg, #111);
    color: var(--text);
    border: 1px solid var(--amber-dim);
    border-radius: var(--r-control, 6px);
    font-size: 0.8rem;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 4px;
  }
  .current {
    font-size: 0.74rem;
    color: var(--muted);
  }
  .current strong {
    color: var(--text);
  }
  button {
    min-height: var(--tap, 40px);
    padding: 8px 16px;
    font-size: 0.72rem;
    color: var(--text);
    background: var(--amber-dim);
    border: 1px solid var(--amber);
    border-radius: var(--r-control, 6px);
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .error {
    color: var(--alert, #ff6b6b);
    font-size: 0.78rem;
  }
  .ok {
    color: var(--ok, #5fd08a);
    font-size: 0.78rem;
  }
</style>
