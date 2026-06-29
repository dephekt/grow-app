<script lang="ts">
  import EntityRow from '$lib/EntityRow.svelte';
  import type { PresentedEntity } from '$lib/device-presentation';
  import type { EntityConfig, EntityState } from '$lib/server/mqtt/types';

  const EMPTY_STATE = { value: null, updatedAt: null } satisfies EntityState;
  const SPECIAL_CONTROL_IDS = new Set([
    'thermal_color_palette',
    'thermal_overlay_enable',
    'roi_enabled',
    'roi_center_row',
    'roi_center_column',
    'roi_size'
  ]);
  const ROW_MIN = 1;
  const ROW_MAX = 24;
  const COLUMN_MIN = 1;
  const COLUMN_MAX = 32;

  let {
    controls,
    states = {},
    commandPending = {},
    commandErrors = {},
    onCommand
  } = $props<{
    controls: PresentedEntity[];
    states?: Record<string, EntityState>;
    commandPending?: Record<string, boolean>;
    commandErrors?: Record<string, string>;
    onCommand: (entity: EntityConfig, value?: unknown) => void;
  }>();

  let controlsByObjectId: Map<string, PresentedEntity> = $derived(
    new Map<string, PresentedEntity>(
      controls.map((control: PresentedEntity): [string, PresentedEntity] => [control.entity.objectId ?? control.entity.id, control])
    )
  );
  let palette: PresentedEntity | undefined = $derived(controlsByObjectId.get('thermal_color_palette'));
  let overlay: PresentedEntity | undefined = $derived(controlsByObjectId.get('thermal_overlay_enable'));
  let roiEnabled: PresentedEntity | undefined = $derived(controlsByObjectId.get('roi_enabled'));
  let row: PresentedEntity | undefined = $derived(controlsByObjectId.get('roi_center_row'));
  let column: PresentedEntity | undefined = $derived(controlsByObjectId.get('roi_center_column'));
  let size: PresentedEntity | undefined = $derived(controlsByObjectId.get('roi_size'));
  let fallbackControls: PresentedEntity[] = $derived(
    controls.filter((control: PresentedEntity) => !SPECIAL_CONTROL_IDS.has(control.entity.objectId ?? ''))
  );
  let knownControls: PresentedEntity[] = $derived(
    controls.filter((control: PresentedEntity) => SPECIAL_CONTROL_IDS.has(control.entity.objectId ?? ''))
  );
  let rowValue: number | null = $derived(row ? numericState(row) : null);
  let columnValue: number | null = $derived(column ? numericState(column) : null);

  function stateFor(entry: PresentedEntity): EntityState {
    return states[entry.entity.id] ?? EMPTY_STATE;
  }

  function controlLabel(entry: PresentedEntity): string {
    switch (entry.entity.objectId) {
      case 'thermal_color_palette':
        return 'Palette';
      case 'thermal_overlay_enable':
        return 'Overlay';
      case 'roi_enabled':
        return 'ROI Enabled';
      case 'roi_center_row':
        return 'ROI Row';
      case 'roi_center_column':
        return 'ROI Column';
      case 'roi_size':
        return 'ROI Size';
      default:
        return entry.label;
    }
  }

  function isPending(entry: PresentedEntity): boolean {
    return commandPending[entry.entity.id] === true;
  }

  function isOn(entry: PresentedEntity): boolean {
    return stateFor(entry).value === entry.entity.payloadOn;
  }

  function numericState(entry: PresentedEntity): number | null {
    const value = stateFor(entry).value;
    if (value === null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function numberInputValue(entry: PresentedEntity): string {
    const value = stateFor(entry).value;
    if (value === null || value === '') return '';
    const parsed = Number(value);
    return Number.isFinite(parsed) ? String(parsed) : value;
  }

  function minFor(entry: PresentedEntity, fallback: number): number {
    return Number.isFinite(entry.entity.min) ? (entry.entity.min as number) : fallback;
  }

  function maxFor(entry: PresentedEntity, fallback: number): number {
    return Number.isFinite(entry.entity.max) ? (entry.entity.max as number) : fallback;
  }

  function stepFor(entry: PresentedEntity): number {
    return entry.entity.step !== undefined && Number.isFinite(entry.entity.step) && entry.entity.step > 0 ? entry.entity.step : 1;
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  function positionPending(): boolean {
    return Boolean((row && isPending(row)) || (column && isPending(column)));
  }

  function moveDisabled(entry: PresentedEntity, delta: number, fallbackMin: number, fallbackMax: number): boolean {
    const current = numericState(entry);
    if (current === null || positionPending()) return true;
    return delta < 0 ? current <= minFor(entry, fallbackMin) : current >= maxFor(entry, fallbackMax);
  }

  function move(entry: PresentedEntity, delta: number, fallbackMin: number, fallbackMax: number): void {
    if (moveDisabled(entry, delta, fallbackMin, fallbackMax)) return;
    const current = numericState(entry);
    if (current === null) return;
    onCommand(entry.entity, clamp(current + delta * stepFor(entry), minFor(entry, fallbackMin), maxFor(entry, fallbackMax)));
  }
</script>

<div class="camera-controls" aria-label="Thermal camera quick controls">
  <div class="control-grid">
    {#if palette}
      <label class="field">
        <span>{controlLabel(palette)}</span>
        <select
          value={stateFor(palette).value ?? ''}
          disabled={isPending(palette)}
          aria-label={controlLabel(palette)}
          onchange={(event) => onCommand(palette.entity, event.currentTarget.value)}
        >
          <option value="" disabled>Select</option>
          {#each palette.entity.options ?? [] as option}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </label>
    {/if}

    {#if overlay}
      <div class="field">
        <span>{controlLabel(overlay)}</span>
        <button
          type="button"
          class="toggle"
          class:on={isOn(overlay)}
          aria-label={controlLabel(overlay)}
          aria-pressed={isOn(overlay)}
          disabled={isPending(overlay)}
          onclick={() => onCommand(overlay.entity, !isOn(overlay))}
        >
          {isOn(overlay) ? 'On' : 'Off'}
        </button>
      </div>
    {/if}

    {#if roiEnabled}
      <div class="field">
        <span>{controlLabel(roiEnabled)}</span>
        <button
          type="button"
          class="toggle"
          class:on={isOn(roiEnabled)}
          aria-label={controlLabel(roiEnabled)}
          aria-pressed={isOn(roiEnabled)}
          disabled={isPending(roiEnabled)}
          onclick={() => onCommand(roiEnabled.entity, !isOn(roiEnabled))}
        >
          {isOn(roiEnabled) ? 'On' : 'Off'}
        </button>
      </div>
    {/if}

    {#if size}
      <label class="field">
        <span>{controlLabel(size)}</span>
        <input
          type="number"
          min={size.entity.min}
          max={size.entity.max}
          step={size.entity.step ?? 'any'}
          value={numberInputValue(size)}
          disabled={isPending(size)}
          aria-label={controlLabel(size)}
          onblur={(event) => onCommand(size.entity, event.currentTarget.value)}
        />
      </label>
    {/if}
  </div>

  {#if row && column}
    <div class="position-control">
      <div class="position-heading">
        <span>ROI Position</span>
        <small>Row {rowValue ?? '-'} / Column {columnValue ?? '-'}</small>
      </div>
      <div class="arrow-pad" role="group" aria-label="ROI position">
        <span></span>
        <button
          type="button"
          aria-label="Move ROI up"
          title="Move ROI up"
          disabled={moveDisabled(row, -1, ROW_MIN, ROW_MAX)}
          onclick={() => move(row, -1, ROW_MIN, ROW_MAX)}
        >
          ^
        </button>
        <span></span>
        <button
          type="button"
          aria-label="Move ROI left"
          title="Move ROI left"
          disabled={moveDisabled(column, -1, COLUMN_MIN, COLUMN_MAX)}
          onclick={() => move(column, -1, COLUMN_MIN, COLUMN_MAX)}
        >
          &lt;
        </button>
        <span class="arrow-center" aria-hidden="true"></span>
        <button
          type="button"
          aria-label="Move ROI right"
          title="Move ROI right"
          disabled={moveDisabled(column, 1, COLUMN_MIN, COLUMN_MAX)}
          onclick={() => move(column, 1, COLUMN_MIN, COLUMN_MAX)}
        >
          &gt;
        </button>
        <span></span>
        <button
          type="button"
          aria-label="Move ROI down"
          title="Move ROI down"
          disabled={moveDisabled(row, 1, ROW_MIN, ROW_MAX)}
          onclick={() => move(row, 1, ROW_MIN, ROW_MAX)}
        >
          v
        </button>
        <span></span>
      </div>
    </div>
  {/if}

  {#each knownControls as control (control.entity.id)}
    {#if commandErrors[control.entity.id]}
      <p class="command-error">{controlLabel(control)}: {commandErrors[control.entity.id]}</p>
    {/if}
  {/each}

  {#if fallbackControls.length > 0}
    <div class="fallback-controls">
      {#each fallbackControls as control (control.entity.id)}
        <EntityRow
          entry={control}
          state={stateFor(control)}
          pending={isPending(control)}
          error={commandErrors[control.entity.id]}
          {onCommand}
        />
      {/each}
    </div>
  {/if}
</div>

<style>
  .camera-controls {
    display: grid;
    gap: 12px;
    padding: 12px 16px 14px;
    border-top: 1px solid var(--line);
    background: var(--panel-2);
  }

  .control-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  .field {
    display: grid;
    grid-template-rows: minmax(2.35em, auto) 44px;
    gap: 6px;
    min-width: 0;
    color: var(--text);
    font-size: 0.78rem;
    font-weight: 700;
  }

  .field span,
  .position-heading span {
    overflow-wrap: anywhere;
  }

  select,
  input,
  button {
    height: 44px;
    min-height: 44px;
    box-sizing: border-box;
    border-radius: var(--r-control);
    font: inherit;
  }

  select,
  input {
    width: 100%;
    min-width: 0;
    border: 1px solid var(--line);
    background: var(--panel-2);
    color: var(--text);
  }

  button {
    border: 1px solid var(--line);
    background: var(--panel-2);
    color: var(--text);
    cursor: pointer;
    font-weight: 800;
  }

  button:disabled,
  input:disabled,
  select:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .toggle {
    width: 100%;
    border-color: var(--line);
    background: var(--panel-2);
    color: var(--muted);
  }

  .toggle.on {
    border-color: var(--amber);
    background: var(--amber-dim);
    color: var(--amber);
  }

  .position-control {
    display: grid;
    grid-template-columns: minmax(120px, 1fr) auto;
    gap: 12px;
    align-items: center;
    padding-top: 2px;
  }

  .position-heading {
    display: grid;
    gap: 3px;
    min-width: 0;
    color: var(--text);
    font-size: 0.78rem;
    font-weight: 800;
  }

  .position-heading small {
    color: var(--muted);
    font-size: 0.74rem;
    font-weight: 600;
  }

  .arrow-pad {
    display: grid;
    grid-template-columns: repeat(3, 44px);
    grid-template-rows: repeat(3, 44px);
    gap: 4px;
  }

  .arrow-center {
    display: grid;
    place-items: center;
    min-width: 0;
  }

  .command-error {
    margin: 0;
    color: var(--alert);
    font-size: 0.82rem;
  }

  .fallback-controls {
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: var(--r-control);
    background: var(--panel-2);
  }

  @media (max-width: 820px) {
    .control-grid,
    .position-control {
      grid-template-columns: 1fr;
    }

    .arrow-pad {
      justify-self: start;
    }
  }
</style>
