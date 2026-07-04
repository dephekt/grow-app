<script lang="ts">
  import { untrack } from 'svelte';
  import { getLiveSnapshot } from '$lib/live-snapshot-context';
  import type { Zone } from '$lib/server/opensprinkler/zones';

  type ZoneJson = Zone & { stationEntityId: string };

  let { data } = $props();
  const live = getLiveSnapshot();

  // Seed once from load; manage locally as mutations happen.
  let zones = $state<ZoneJson[]>(untrack(() => data.zones));
  let error = $state<string | null>(null);
  const isAdmin = $derived(Boolean(data.user?.isAdmin));

  // Per-zone shot controls (keyed by zone id).
  let runValue = $state<Record<string, string>>({});
  let runUnit = $state<Record<string, string>>({});

  // Zone editor — doubles as create (editingId null) and update.
  let editingId = $state<string | null>(null);
  let saving = $state(false);
  const blankForm = () => ({
    name: '',
    stationSid: '',
    substrateType: '',
    substrateVolumeMl: '',
    drippers: '',
    emitterGph: '',
    maxRunSeconds: '300'
  });
  let form = $state(blankForm());

  // p.55 substrate-volume presets (mL) for the datalist.
  const VOLUME_PRESETS = [650, 800, 1000, 3785, 5678, 7570, 11355, 18925];
  const GPH_PRESETS = ['0.3', '0.5', '1.0'];
  const ML_PER_MIN_PER_GPH = 3785.411784 / 60;

  function unitFor(id: string): string {
    return runUnit[id] ?? 'seconds';
  }

  function stationEntity(zone: ZoneJson) {
    return live.snapshot.entities.find((e) => e.id === zone.stationEntityId);
  }
  function stationRunning(zone: ZoneJson): boolean | null {
    const entity = stationEntity(zone);
    if (!entity) return null;
    const value = live.snapshot.states[entity.id]?.value ?? null;
    if (value == null) return null;
    return value === (entity.payloadOn ?? 'ON');
  }
  function busy(id: string): boolean {
    return live.commandPending[`zone:${id}`] === true;
  }
  function cmdError(id: string): string {
    return live.commandErrors[`zone:${id}`] ?? '';
  }

  // Display-only preview of the run duration; the server recomputes authoritatively.
  function previewSeconds(zone: ZoneJson): number | null {
    const raw = Number(runValue[zone.id]);
    if (!Number.isFinite(raw) || raw <= 0) return null;
    const unit = unitFor(zone.id);
    if (unit === 'seconds') return Math.min(Math.round(raw), zone.maxRunSeconds);
    const flow = zone.drippers && zone.emitterGph ? zone.drippers * zone.emitterGph * ML_PER_MIN_PER_GPH : null;
    if (!flow) return null;
    let ml = raw;
    if (unit === 'percent') {
      if (!zone.substrateVolumeMl) return null;
      ml = (raw / 100) * zone.substrateVolumeMl;
    }
    return Math.min(Math.round((ml / flow) * 60), zone.maxRunSeconds);
  }

  async function refresh(): Promise<void> {
    try {
      const response = await fetch('/api/irrigation/zones');
      if (response.ok) zones = ((await response.json()) as { zones: ZoneJson[] }).zones;
    } catch {
      /* leave list as-is; the mutation still applied server-side */
    }
  }

  async function runShot(zone: ZoneJson): Promise<void> {
    const amount = Number(runValue[zone.id]);
    if (!Number.isFinite(amount) || amount <= 0) {
      error = 'Enter a positive amount to run';
      return;
    }
    error = null;
    await live.runZoneShot(zone.id, { [unitFor(zone.id)]: amount });
  }

  async function stopZone(zone: ZoneJson): Promise<void> {
    error = null;
    await live.stopZone(zone.id);
  }

  function startEdit(zone: ZoneJson): void {
    editingId = zone.id;
    form = {
      name: zone.name,
      stationSid: String(zone.stationSid),
      substrateType: zone.substrateType ?? '',
      substrateVolumeMl: zone.substrateVolumeMl != null ? String(zone.substrateVolumeMl) : '',
      drippers: zone.drippers != null ? String(zone.drippers) : '',
      emitterGph: zone.emitterGph != null ? String(zone.emitterGph) : '',
      maxRunSeconds: String(zone.maxRunSeconds)
    };
  }

  function cancelEdit(): void {
    editingId = null;
    form = blankForm();
  }

  function buildBody(): Record<string, unknown> {
    return {
      name: form.name,
      stationSid: Number(form.stationSid),
      substrateType: form.substrateType.trim() || null,
      substrateVolumeMl: form.substrateVolumeMl ? Number(form.substrateVolumeMl) : null,
      drippers: form.drippers ? Number(form.drippers) : null,
      emitterGph: form.emitterGph ? Number(form.emitterGph) : null,
      maxRunSeconds: Number(form.maxRunSeconds)
    };
  }

  async function saveZone(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    error = null;
    saving = true;
    try {
      const url = editingId ? `/api/irrigation/zones/${editingId}` : '/api/irrigation/zones';
      const response = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildBody())
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        error = body.error ?? 'Could not save zone';
        return;
      }
      cancelEdit();
      await refresh();
    } catch {
      error = 'Could not save zone';
    } finally {
      saving = false;
    }
  }

  async function removeZone(zone: ZoneJson): Promise<void> {
    if (!confirm(`Delete zone "${zone.name}"? Its OpenSprinkler station config is unaffected.`)) return;
    error = null;
    try {
      const response = await fetch(`/api/irrigation/zones/${zone.id}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' }
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        error = body.error ?? 'Could not delete zone';
        return;
      }
      await refresh();
    } catch {
      error = 'Could not delete zone';
    }
  }
</script>

<section class="irrigation">
  <header>
    <a class="back" href="/">← Dashboard</a>
    <h1>Irrigation</h1>
  </header>

  {#if error}<p class="error" role="alert">{error}</p>{/if}

  {#if zones.length === 0}
    <p class="empty mono">No zones yet.{isAdmin ? ' Add one below.' : ' An admin can add one.'}</p>
  {/if}

  <div class="zones">
    {#each zones as zone (zone.id)}
      {@const running = stationRunning(zone)}
      <article class="panel zone">
        <div class="panel-head">
          <span class="panel-title">{zone.name}</span>
          <span class="state">
            <span class="dot {running === true ? 'ok pulse' : running === false ? '' : 'faint'}"></span>
            <span class="mono">{running === true ? 'RUNNING' : running === false ? 'IDLE' : '—'}</span>
          </span>
        </div>

        <p class="meta mono">
          STN {zone.stationSid}
          {#if zone.substrateType}· {zone.substrateType}{/if}
          {#if zone.substrateVolumeMl}· {zone.substrateVolumeMl} mL{/if}
          {#if zone.drippers && zone.emitterGph}· {zone.drippers}×{zone.emitterGph} GPH{/if}
          · cap {zone.maxRunSeconds}s
        </p>

        <div class="run">
          <input
            type="text"
            inputmode="decimal"
            placeholder="amount"
            bind:value={runValue[zone.id]}
            disabled={busy(zone.id)}
          />
          <select bind:value={runUnit[zone.id]} disabled={busy(zone.id)}>
            <option value="seconds">sec</option>
            <option value="ml">mL</option>
            <option value="percent">%</option>
          </select>
          <button class="run-btn" onclick={() => runShot(zone)} disabled={busy(zone.id)}>Run</button>
          <button class="stop-btn" onclick={() => stopZone(zone)} disabled={busy(zone.id)}>Stop</button>
          {#if previewSeconds(zone) !== null && unitFor(zone.id) !== 'seconds'}
            <span class="preview mono">≈ {previewSeconds(zone)}s</span>
          {/if}
        </div>
        {#if cmdError(zone.id)}<p class="error small">{cmdError(zone.id)}</p>{/if}

        {#if isAdmin}
          <div class="admin-actions">
            <button onclick={() => startEdit(zone)}>Edit</button>
            <button onclick={() => removeZone(zone)}>Delete</button>
          </div>
        {/if}
      </article>
    {/each}
  </div>

  {#if isAdmin}
    <form class="panel editor" onsubmit={saveZone}>
      <div class="panel-head">
        <span class="panel-title">{editingId ? 'Edit zone' : 'Add zone'}</span>
      </div>
      <div class="grid">
        <label>Name<input type="text" bind:value={form.name} required /></label>
        <label>Station #<input type="text" inputmode="numeric" bind:value={form.stationSid} required /></label>
        <label>Substrate<input type="text" list="substrate-types" bind:value={form.substrateType} /></label>
        <label>Volume (mL)<input type="text" inputmode="decimal" list="volume-presets" bind:value={form.substrateVolumeMl} /></label>
        <label>Drippers<input type="text" inputmode="numeric" bind:value={form.drippers} /></label>
        <label>Emitter GPH<input type="text" inputmode="decimal" list="gph-presets" bind:value={form.emitterGph} /></label>
        <label>Max run (s)<input type="text" inputmode="numeric" bind:value={form.maxRunSeconds} required /></label>
      </div>
      <div class="editor-actions">
        <button type="submit" disabled={saving}>{editingId ? 'Save' : 'Add zone'}</button>
        {#if editingId}<button type="button" onclick={cancelEdit}>Cancel</button>{/if}
      </div>
    </form>
  {/if}

  <datalist id="substrate-types">
    <option value="Rockwool"></option>
    <option value="Coco"></option>
  </datalist>
  <datalist id="volume-presets">
    {#each VOLUME_PRESETS as v}<option value={v}></option>{/each}
  </datalist>
  <datalist id="gph-presets">
    {#each GPH_PRESETS as g}<option value={g}></option>{/each}
  </datalist>
</section>

<style>
  .irrigation {
    display: flex;
    flex-direction: column;
    gap: 18px;
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
  .empty {
    color: var(--faint);
    font-size: 0.8rem;
  }
  .zones {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: var(--gap);
  }
  .zone {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .state {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.66rem;
    color: var(--muted);
  }
  .dot.faint {
    background: var(--faint);
  }
  .meta {
    font-size: 0.64rem;
    color: var(--muted);
    letter-spacing: 0.03em;
  }
  .run {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .run input {
    width: 92px;
  }
  input,
  select {
    min-height: var(--tap);
    padding: 6px 8px;
    color: var(--text);
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: var(--r-control);
  }
  button {
    min-height: var(--tap);
    padding: 6px 12px;
    font-size: 0.7rem;
    color: var(--text);
    background: transparent;
    border: 1px solid var(--amber);
    border-radius: var(--r-control);
    cursor: pointer;
  }
  button:disabled {
    cursor: wait;
    opacity: 0.55;
  }
  .run-btn {
    border-color: var(--ok);
    color: var(--ok);
  }
  .stop-btn {
    border-color: var(--alert);
    color: var(--alert);
  }
  .preview {
    font-size: 0.68rem;
    color: var(--faint);
  }
  .admin-actions {
    display: flex;
    gap: 6px;
    padding-top: 4px;
    border-top: 1px solid var(--line);
  }
  .admin-actions button {
    font-size: 0.64rem;
    border-color: var(--line-strong);
    color: var(--muted);
  }
  .editor .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
    margin: 8px 0 12px;
  }
  .editor label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.68rem;
    color: var(--muted);
  }
  .editor-actions {
    display: flex;
    gap: 8px;
  }
  .error {
    color: var(--alert);
    font-size: 0.78rem;
  }
  .error.small {
    font-size: 0.68rem;
  }
</style>
