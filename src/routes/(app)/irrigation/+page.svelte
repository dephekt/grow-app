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
    substrateVolume: '',
    volumeUnit: 'ml',
    drippers: '',
    emitterFlow: '',
    flowUnit: 'lph',
    maxRunSeconds: '300',
    enabled: true
  });
  let form = $state(blankForm());

  // The store is canonical metric — volume in mL, emitter flow in L/hr. The editor
  // lets you enter either in a friendlier unit and converts to canonical on submit.
  const ML_PER_GAL = 3785.411784;
  const ML_PER_MIN_PER_LPH = 1000 / 60; // L/hr → mL/min
  const VOLUME_TO_ML: Record<string, number> = { ml: 1, l: 1000, gal: ML_PER_GAL };
  const FLOW_TO_LPH: Record<string, number> = { lph: 1, gph: ML_PER_GAL / 1000, lpm: 60 };

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
    const flow = zone.drippers && zone.emitterLph ? zone.drippers * zone.emitterLph * ML_PER_MIN_PER_LPH : null;
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
      substrateVolume: zone.substrateVolumeMl != null ? String(zone.substrateVolumeMl) : '',
      volumeUnit: 'ml',
      drippers: zone.drippers != null ? String(zone.drippers) : '',
      emitterFlow: zone.emitterLph != null ? String(zone.emitterLph) : '',
      flowUnit: 'lph',
      maxRunSeconds: String(zone.maxRunSeconds),
      enabled: zone.enabled
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
      substrateVolumeMl: form.substrateVolume ? Number(form.substrateVolume) * VOLUME_TO_ML[form.volumeUnit] : null,
      drippers: form.drippers ? Number(form.drippers) : null,
      emitterLph: form.emitterFlow ? Number(form.emitterFlow) * FLOW_TO_LPH[form.flowUnit] : null,
      maxRunSeconds: Number(form.maxRunSeconds),
      enabled: form.enabled
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
      <article class="panel zone" class:disabled={!zone.enabled}>
        <div class="panel-head">
          <span class="panel-title">{zone.name}{#if !zone.enabled}<span class="tag">DISABLED</span>{/if}</span>
          <span class="state">
            <span class="dot {running === true ? 'ok pulse' : running === false ? '' : 'faint'}"></span>
            <span class="mono">{running === true ? 'RUNNING' : running === false ? 'IDLE' : '—'}</span>
          </span>
        </div>

        <p class="meta mono">
          STN {zone.stationSid}
          {#if zone.substrateType}· {zone.substrateType}{/if}
          {#if zone.substrateVolumeMl}· {zone.substrateVolumeMl} mL{/if}
          {#if zone.drippers && zone.emitterLph}· {zone.drippers}×{zone.emitterLph} L/hr{/if}
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
          <button class="run-btn" onclick={() => runShot(zone)} disabled={busy(zone.id) || !zone.enabled}>Run</button>
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
        <label>
          OpenSprinkler station
          <input type="text" inputmode="numeric" bind:value={form.stationSid} required />
          <small class="hint">0-based · OS Zone 1 = 0</small>
        </label>
        <label>Substrate type<input type="text" list="substrate-types" bind:value={form.substrateType} /></label>
        <label>
          Substrate volume
          <span class="unit-row">
            <input type="text" inputmode="decimal" bind:value={form.substrateVolume} />
            <select bind:value={form.volumeUnit}>
              <option value="ml">mL</option>
              <option value="l">L</option>
              <option value="gal">gal</option>
            </select>
          </span>
          <small class="hint">per container</small>
        </label>
        <label>Drippers per container<input type="text" inputmode="numeric" bind:value={form.drippers} /></label>
        <label>
          Emitter flow
          <span class="unit-row">
            <input type="text" inputmode="decimal" bind:value={form.emitterFlow} />
            <select bind:value={form.flowUnit}>
              <option value="lph">L/hr</option>
              <option value="gph">GPH</option>
              <option value="lpm">L/min</option>
            </select>
          </span>
        </label>
        <label>Max run (s)<input type="text" inputmode="numeric" bind:value={form.maxRunSeconds} required /></label>
      </div>
      <label class="check"><input type="checkbox" bind:checked={form.enabled} /> Enabled</label>
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
  .editor .unit-row {
    display: flex;
    gap: 6px;
  }
  .editor .unit-row input {
    min-width: 0;
    flex: 1 1 auto;
  }
  .editor .unit-row select {
    flex: 0 0 auto;
    width: 4.2em;
  }
  .editor .hint {
    color: var(--faint);
    font-size: 0.58rem;
    letter-spacing: 0.02em;
  }
  .editor-actions {
    display: flex;
    gap: 8px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.7rem;
    color: var(--muted);
    margin-bottom: 10px;
  }
  .tag {
    margin-left: 6px;
    font-size: 0.56rem;
    letter-spacing: 0.1em;
    color: var(--alert);
  }
  .zone.disabled {
    opacity: 0.6;
  }
  .error {
    color: var(--alert);
    font-size: 0.78rem;
  }
  .error.small {
    font-size: 0.68rem;
  }
</style>
