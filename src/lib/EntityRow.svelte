<script lang="ts">
  import type { PresentedEntity } from '$lib/device-presentation';
  import type { EntityConfig, EntityState } from '$lib/server/mqtt/types';

  let {
    entry,
    state,
    pending = false,
    error = '',
    onCommand
  } = $props<{
    entry: PresentedEntity;
    state: EntityState;
    pending?: boolean;
    error?: string;
    onCommand: (entity: EntityConfig, value?: unknown) => void;
  }>();

  let entity = $derived(entry.entity);

  function formatState(): string {
    if (state.value === null || state.value === undefined || state.value === '') return 'No state yet';
    return entity.unit ? `${state.value} ${entity.unit}` : state.value;
  }
</script>

<div class="entity">
  <div class="entity-meta">
    <span>{entry.label}</span>
    <small>{entity.component}{entity.deviceClass ? ` · ${entity.deviceClass}` : ''}</small>
  </div>

  <div class="entity-control">
    {#if entity.writable && entity.component === 'switch'}
      <button
        type="button"
        class="toggle"
        class:on={state.value === entity.payloadOn}
        disabled={pending}
        onclick={() => onCommand(entity, state.value !== entity.payloadOn)}
      >
        {state.value === entity.payloadOn ? 'On' : 'Off'}
      </button>
    {:else if entity.writable && entity.component === 'number'}
      <input
        type="number"
        min={entity.min}
        max={entity.max}
        step={entity.step ?? 'any'}
        value={state.value ?? ''}
        disabled={pending}
        onblur={(event) => onCommand(entity, event.currentTarget.value)}
      />
    {:else if entity.writable && entity.component === 'select'}
      <select
        value={state.value ?? ''}
        disabled={pending}
        onchange={(event) => onCommand(entity, event.currentTarget.value)}
      >
        <option value="" disabled>Select</option>
        {#each entity.options ?? [] as option}
          <option value={option}>{option}</option>
        {/each}
      </select>
    {:else if entity.writable && entity.component === 'button'}
      <button type="button" class:danger={entity.dangerous} disabled={pending} onclick={() => onCommand(entity)}>
        Send
      </button>
    {:else if entity.writable}
      <form
        onsubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const input = new FormData(form).get('value');
          onCommand(entity, input);
          form.reset();
        }}
      >
        <input name="value" aria-label={`${entry.label} command`} disabled={pending} />
        <button type="submit" disabled={pending}>Set</button>
      </form>
    {:else}
      <span class="value">{formatState()}</span>
    {/if}
  </div>

  {#if entity.writable && entity.component !== 'number'}
    <span class="value secondary">{formatState()}</span>
  {/if}

  {#if error}
    <p class="command-error">{error}</p>
  {/if}
</div>

<style>
  .entity {
    display: grid;
    grid-template-columns: minmax(120px, 1fr) minmax(120px, auto);
    gap: 10px;
    align-items: center;
    padding: 12px 16px;
    border-top: 1px solid #edf1ee;
  }

  .entity-meta {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .entity-meta span,
  .value {
    overflow-wrap: anywhere;
  }

  small,
  .secondary {
    color: #66736e;
  }

  .entity-control {
    display: flex;
    justify-content: flex-end;
    min-width: 0;
  }

  .entity-control form {
    display: flex;
    gap: 6px;
  }

  .entity-control input,
  .entity-control select {
    width: min(180px, 38vw);
    min-height: 36px;
    box-sizing: border-box;
    border: 1px solid #cbd6cf;
    border-radius: 6px;
    background: #ffffff;
    color: #17211d;
  }

  button {
    min-height: 36px;
    border: 1px solid #1f6f54;
    border-radius: 6px;
    background: #1f6f54;
    color: #ffffff;
    cursor: pointer;
    font-weight: 700;
  }

  button:disabled,
  input:disabled,
  select:disabled {
    cursor: wait;
    opacity: 0.55;
  }

  .toggle {
    min-width: 72px;
    border-color: #7c8795;
    background: #7c8795;
  }

  .toggle.on {
    border-color: #1f6f54;
    background: #1f6f54;
  }

  .danger {
    border-color: #a62b24;
    background: #a62b24;
  }

  .value.secondary {
    grid-column: 1 / -1;
    font-size: 0.82rem;
  }

  .command-error {
    grid-column: 1 / -1;
    margin: 0;
    color: #a62b24;
    font-size: 0.82rem;
  }

  @media (max-width: 820px) {
    .entity {
      grid-template-columns: 1fr;
    }

    .entity-control {
      justify-content: stretch;
    }

    .entity-control input,
    .entity-control select,
    .entity-control button,
    .entity-control form {
      width: 100%;
    }
  }
</style>
