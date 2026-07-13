<script lang="ts">
  import { untrack } from 'svelte';
  import { getLiveSnapshot } from '$lib/live-snapshot-context';
  import IrrigationCard from '$lib/irrigation/IrrigationCard.svelte';
  import IrrigationHistory from '$lib/irrigation/IrrigationHistory.svelte';
  import type { Zone } from '$lib/server/opensprinkler/zones';
  import type { ScheduleJson } from '$lib/server/opensprinkler/schedules';
  import type { IrrigationEventJson } from '$lib/server/opensprinkler/events';

  type ZoneJson = Zone & { stationEntityId: string };

  let { data } = $props();
  const live = getLiveSnapshot();

  // Seed once from load; manage locally as mutations happen.
  let zones = $state<ZoneJson[]>(untrack(() => data.zones));
  let schedules = $state<ScheduleJson[]>(untrack(() => data.schedules));
  let history = $state<IrrigationEventJson[]>(untrack(() => data.events));
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

  // The history feed is server-persisted; re-fetch it (rather than optimistically mutating)
  // so runoff events and lazily-filled pump energy show up. Polled lightly, and nudged right
  // after a manual run so the fresh event appears without waiting for the next tick.
  async function refreshHistory(): Promise<void> {
    try {
      const response = await fetch('/api/irrigation/events');
      if (response.ok) history = ((await response.json()) as { events: IrrigationEventJson[] }).events;
    } catch {
      /* leave feed as-is */
    }
  }

  $effect(() => {
    const id = setInterval(refreshHistory, 30_000);
    return () => clearInterval(id);
  });

  async function runShot(zone: ZoneJson): Promise<void> {
    const amount = Number(runValue[zone.id]);
    if (!Number.isFinite(amount) || amount <= 0) {
      error = 'Enter a positive amount to run';
      return;
    }
    error = null;
    await live.runZoneShot(zone.id, { [unitFor(zone.id)]: amount });
    await refreshHistory();
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
      // Round the unit-converted canonical values so they don't carry float noise
      // (e.g. 1 gal → 3785 mL, 2.11 GPH → 7.99 L/hr) into the store/API/summary.
      substrateVolumeMl: form.substrateVolume ? Math.round(Number(form.substrateVolume) * VOLUME_TO_ML[form.volumeUnit]) : null,
      drippers: form.drippers ? Number(form.drippers) : null,
      emitterLph: form.emitterFlow ? Math.round(Number(form.emitterFlow) * FLOW_TO_LPH[form.flowUnit] * 100) / 100 : null,
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

  // --- Per-zone schedules --------------------------------------------------------
  function zoneSchedules(zoneId: string): ScheduleJson[] {
    return schedules.filter((s) => s.zoneId === zoneId);
  }
  function shotLabel(s: ScheduleJson): string {
    if (s.shotPercent != null) return `${s.shotPercent}%`;
    if (s.shotMl != null) return `${s.shotMl} mL`;
    return `${s.shotSeconds}s`;
  }
  // The next-run instant is correct regardless of zone; render its wall time in the
  // schedule's tz (from the loader) so it matches the HH:MM the admin entered, not the
  // viewer's browser zone.
  const scheduleTz = $derived(data.scheduleTimeZone ?? 'UTC');
  function nextRunLabel(s: ScheduleJson): string {
    if (!s.nextDueAt) return '—';
    return new Date(s.nextDueAt).toLocaleString(undefined, {
      timeZone: scheduleTz,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Schedule editor — doubles as create (editingId null, scoped to scheduleZoneId) and
  // update. Times are entered as comma-separated HH:MM; the shot is one unit at a time.
  let scheduleEditingId = $state<string | null>(null);
  let scheduleZoneId = $state<string | null>(null);
  let scheduleSaving = $state(false);
  const blankScheduleForm = () => ({ times: '', shotValue: '', shotUnit: 'seconds', enabled: true });
  let scheduleForm = $state(blankScheduleForm());

  function startScheduleCreate(zone: ZoneJson): void {
    scheduleEditingId = null;
    scheduleZoneId = zone.id;
    scheduleForm = blankScheduleForm();
  }
  function startScheduleEdit(schedule: ScheduleJson): void {
    scheduleEditingId = schedule.id;
    scheduleZoneId = schedule.zoneId;
    const unit = schedule.shotPercent != null ? 'percent' : schedule.shotMl != null ? 'ml' : 'seconds';
    const value = schedule.shotPercent ?? schedule.shotMl ?? schedule.shotSeconds ?? '';
    scheduleForm = { times: schedule.times.join(', '), shotValue: String(value), shotUnit: unit, enabled: schedule.enabled };
  }
  function cancelScheduleEdit(): void {
    scheduleEditingId = null;
    scheduleZoneId = null;
    scheduleForm = blankScheduleForm();
  }

  function buildScheduleBody(zoneId: string): Record<string, unknown> {
    const times = scheduleForm.times
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const shotKey =
      scheduleForm.shotUnit === 'percent' ? 'shotPercent' : scheduleForm.shotUnit === 'ml' ? 'shotMl' : 'shotSeconds';
    return { zoneId, times, [shotKey]: Number(scheduleForm.shotValue), enabled: scheduleForm.enabled };
  }

  async function refreshSchedules(): Promise<void> {
    try {
      const response = await fetch('/api/irrigation/schedules');
      if (response.ok) schedules = ((await response.json()) as { schedules: ScheduleJson[] }).schedules;
    } catch {
      /* leave list as-is; the mutation still applied server-side */
    }
  }

  async function saveSchedule(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!scheduleZoneId) return;
    error = null;
    scheduleSaving = true;
    try {
      const url = scheduleEditingId ? `/api/irrigation/schedules/${scheduleEditingId}` : '/api/irrigation/schedules';
      const response = await fetch(url, {
        method: scheduleEditingId ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildScheduleBody(scheduleZoneId))
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        error = body.error ?? 'Could not save schedule';
        return;
      }
      cancelScheduleEdit();
      await refreshSchedules();
    } catch {
      error = 'Could not save schedule';
    } finally {
      scheduleSaving = false;
    }
  }

  async function removeSchedule(schedule: ScheduleJson): Promise<void> {
    if (!confirm('Delete this schedule?')) return;
    error = null;
    try {
      const response = await fetch(`/api/irrigation/schedules/${schedule.id}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' }
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        error = body.error ?? 'Could not delete schedule';
        return;
      }
      await refreshSchedules();
    } catch {
      error = 'Could not delete schedule';
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
    <IrrigationCard {live} />
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

        {#if isAdmin || zoneSchedules(zone.id).length > 0}
          <div class="schedule">
            <div class="schedule-head">
              <span class="schedule-title mono">SCHEDULE</span>
              {#if isAdmin}<button class="link" onclick={() => startScheduleCreate(zone)}>+ Add</button>{/if}
            </div>

            {#if zoneSchedules(zone.id).length === 0}
              <p class="empty mono small">No schedules.</p>
            {/if}
            {#each zoneSchedules(zone.id) as schedule (schedule.id)}
              <div class="schedule-row" class:off={!schedule.enabled}>
                <span class="mono times">{schedule.times.join(' · ')}</span>
                <span class="mono muted">{shotLabel(schedule)}</span>
                <span class="mono next">next {nextRunLabel(schedule)}</span>
                {#if !schedule.enabled}<span class="tag">OFF</span>{/if}
                {#if isAdmin}
                  <span class="schedule-actions">
                    <button class="link" onclick={() => startScheduleEdit(schedule)}>Edit</button>
                    <button class="link" onclick={() => removeSchedule(schedule)}>Delete</button>
                  </span>
                {/if}
              </div>
            {/each}

            {#if isAdmin && scheduleZoneId === zone.id}
              <form class="schedule-editor" onsubmit={saveSchedule}>
                <label class="wide">
                  Times
                  <input type="text" bind:value={scheduleForm.times} placeholder="06:00, 18:00" required />
                  <small class="hint">HH:MM, comma-separated</small>
                </label>
                <label>
                  Shot
                  <span class="unit-row">
                    <input type="text" inputmode="decimal" bind:value={scheduleForm.shotValue} required />
                    <select bind:value={scheduleForm.shotUnit}>
                      <option value="seconds">sec</option>
                      <option value="ml">mL</option>
                      <option value="percent">%</option>
                    </select>
                  </span>
                </label>
                <label class="check"><input type="checkbox" bind:checked={scheduleForm.enabled} /> Enabled</label>
                <div class="editor-actions">
                  <button type="submit" disabled={scheduleSaving}>{scheduleEditingId ? 'Save' : 'Add'}</button>
                  <button type="button" onclick={cancelScheduleEdit}>Cancel</button>
                </div>
              </form>
            {/if}
          </div>
        {/if}

        {#if isAdmin}
          <div class="admin-actions">
            <button onclick={() => startEdit(zone)}>Edit</button>
            <button onclick={() => removeZone(zone)}>Delete</button>
          </div>
        {/if}
      </article>
    {/each}
  </div>

  <IrrigationHistory events={history} timeZone={scheduleTz} />

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
    /* Cards keep their natural height instead of stretching to the tallest in the
       row — the pump card is shorter than a zone card with a schedule, and a
       stretched pump card would trail dead space below its content. */
    align-items: start;
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
  .small {
    font-size: 0.62rem;
  }
  .schedule {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 8px;
    border-top: 1px solid var(--line);
  }
  .schedule-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .schedule-title {
    font-size: 0.6rem;
    letter-spacing: 0.1em;
    color: var(--faint);
  }
  .schedule-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: 0.66rem;
    color: var(--text);
  }
  .schedule-row.off {
    opacity: 0.55;
  }
  .schedule-row .muted {
    color: var(--muted);
  }
  .schedule-row .next {
    color: var(--faint);
    font-size: 0.6rem;
  }
  .schedule-actions {
    display: inline-flex;
    gap: 6px;
    margin-left: auto;
  }
  button.link {
    min-height: auto;
    padding: 2px 4px;
    font-size: 0.6rem;
    color: var(--muted);
    background: transparent;
    border: none;
    border-radius: 0;
    text-decoration: underline;
    cursor: pointer;
  }
  .schedule-editor {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 10px;
    padding: 8px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: var(--r-control);
  }
  .schedule-editor label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.66rem;
    color: var(--muted);
  }
  .schedule-editor label.wide {
    flex: 1 1 160px;
  }
  .schedule-editor .unit-row {
    display: flex;
    gap: 6px;
  }
  .schedule-editor .unit-row select {
    width: 4.2em;
  }
  .schedule-editor .hint {
    color: var(--faint);
    font-size: 0.58rem;
  }
</style>
