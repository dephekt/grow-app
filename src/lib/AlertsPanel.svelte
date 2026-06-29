<script lang="ts">
  import type { PresentedSection } from '$lib/device-presentation';
  import type { EntityConfig, EntityState } from '$lib/server/mqtt/types';
  import type { LiveSnapshot } from '$lib/live-snapshot-context';

  let {
    groups,
    live,
    deviceEntities
  } = $props<{
    groups: PresentedSection[];
    live: LiveSnapshot;
    deviceEntities: EntityConfig[];
  }>();

  // ── Metric rule derivation ──────────────────────────────────────────────────
  // Find all threshold number entities (objectId contains threshold/high/low)
  // and pair them with matching alert binary_sensors by metric prefix.
  interface ThresholdRule {
    metric: string;          // e.g. "co2"
    label: string;           // e.g. "CO₂"
    unit: string | null;
    lowEntity: EntityConfig | null;
    highEntity: EntityConfig | null;
    alertEntity: EntityConfig | null;
    liveEntity: EntityConfig | null;
  }

  function extractMetricPrefix(objectId: string): string {
    // e.g. co2_high_threshold → co2
    //      co2_low_threshold  → co2
    //      co2_high_alert     → co2
    return objectId
      .replace(/_?(high|low|min|max)_?(threshold|alert|limit)?$/, '')
      .replace(/_?(threshold|alert|limit)$/, '')
      .replace(/_$/, '');
  }

  function labelForMetric(metric: string): string {
    const map: Record<string, string> = {
      co2: 'CO₂',
      ph: 'pH',
      ec: 'EC',
      temperature: 'Temperature',
      humidity: 'Humidity',
      vpd: 'VPD',
      tds: 'TDS'
    };
    return map[metric] ?? metric.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  let allEntries = $derived(groups.flatMap((g: PresentedSection) => g.entries));

  let rules = $derived.by((): ThresholdRule[] => {
    const thresholdMap = new Map<string, { low: EntityConfig | null; high: EntityConfig | null }>();
    const alertMap = new Map<string, EntityConfig>();

    for (const entry of allEntries) {
      const e = entry.entity;
      const objectId = (e.objectId ?? e.id).toLowerCase();

      if (e.component === 'number') {
        const isThreshold = objectId.includes('threshold') || /(^|_)(high|low|min|max|limit)(_|$)/.test(objectId);
        if (isThreshold) {
          const prefix = extractMetricPrefix(objectId);
          const existing = thresholdMap.get(prefix) ?? { low: null, high: null };
          const isHigh = /(^|_)(high|max)(_|$)/.test(objectId);
          const isLow = !isHigh && /(^|_)(low|min)(_|$)/.test(objectId);
          thresholdMap.set(prefix, {
            low: isLow ? e : existing.low,
            high: isHigh ? e : existing.high
          });
        }
      }

      if (e.component === 'binary_sensor') {
        const name = (e.name ?? '').toLowerCase();
        const hasAlert = objectId.includes('alert') || name.includes('alert');
        if (hasAlert) {
          const prefix = extractMetricPrefix(objectId);
          alertMap.set(prefix, e);
        }
      }
    }

    // Union of all metric prefixes from either map
    const metrics = new Set([...thresholdMap.keys(), ...alertMap.keys()]);

    return [...metrics].map((metric): ThresholdRule => {
      const thresholds = thresholdMap.get(metric) ?? { low: null, high: null };
      const alertEntity = alertMap.get(metric) ?? null;

      // Find a live sensor for this metric from all device entities
      // E.g. for "co2" look for a sensor whose objectId/name contains "co2" but isn't an alert/threshold
      const liveEntity = deviceEntities.find((e: EntityConfig) => {
        if (e.component !== 'sensor') return false;
        const oid = (e.objectId ?? e.id).toLowerCase();
        const nm = (e.name ?? '').toLowerCase();
        const isMetric = oid.includes(metric) || nm.includes(metric);
        const isControl = oid.includes('threshold') || oid.includes('alert') || oid.includes('limit');
        return isMetric && !isControl;
      }) ?? null;

      // Derive unit from whichever entity has it
      const unitEntity = thresholds.high ?? thresholds.low ?? liveEntity;
      const unit = unitEntity?.unit ?? null;

      return {
        metric,
        label: labelForMetric(metric),
        unit,
        lowEntity: thresholds.low,
        highEntity: thresholds.high,
        alertEntity,
        liveEntity
      };
    });
  });

  // Entities that are NOT part of a recognized threshold rule → fallback list
  let recognizedIds = $derived(new Set([
    ...rules.flatMap((r) => [r.lowEntity?.id, r.highEntity?.id, r.alertEntity?.id, r.liveEntity?.id].filter(Boolean))
  ]));
  let fallbackEntries = $derived(allEntries.filter((e: import('$lib/device-presentation').PresentedEntity) => !recognizedIds.has(e.entity.id)));

  // ── Per-rule helpers ────────────────────────────────────────────────────────
  function alertStatus(rule: ThresholdRule, states: Record<string, EntityState>): 'OK' | 'ARMED' | 'HIGH' | 'LOW' | 'UNKNOWN' {
    const alertState = rule.alertEntity ? states[rule.alertEntity.id] : null;
    const alertValue = alertState?.value;

    if (alertValue === 'ON' || alertValue === 'true') {
      // Try to differentiate HIGH vs LOW
      if (rule.liveEntity && rule.highEntity) {
        const live = parseFloat(states[rule.liveEntity.id]?.value ?? '');
        const high = parseFloat(states[rule.highEntity.id]?.value ?? '');
        if (!isNaN(live) && !isNaN(high) && live >= high) return 'HIGH';
      }
      if (rule.liveEntity && rule.lowEntity) {
        const live = parseFloat(states[rule.liveEntity.id]?.value ?? '');
        const low = parseFloat(states[rule.lowEntity.id]?.value ?? '');
        if (!isNaN(live) && !isNaN(low) && live <= low) return 'LOW';
      }
      return 'ARMED';
    }
    if (alertValue === 'OFF' || alertValue === 'false') {
      // Check if threshold entities exist to confirm it's "armed" in a meaningful sense
      return (rule.highEntity || rule.lowEntity) ? 'OK' : 'UNKNOWN';
    }
    return 'UNKNOWN';
  }

  function liveValue(rule: ThresholdRule, states: Record<string, EntityState>): string {
    if (!rule.liveEntity) return '—';
    const v = states[rule.liveEntity.id]?.value;
    if (v == null || v === '' || v === 'unavailable') return '—';
    const n = parseFloat(v);
    if (isNaN(n)) return v;
    return n.toFixed(1);
  }

  // Band visualization dimensions
  const BAND_W = 280;
  const BAND_H = 32;

  function bandPct(value: number, low: number, high: number, margin = 0.15): number {
    const span = high - low;
    const padded_low = low - span * margin;
    const padded_high = high + span * margin;
    const total = padded_high - padded_low;
    return Math.max(0, Math.min(1, (value - padded_low) / total));
  }

  interface BandGeometry {
    lowTick: number | null;
    highTick: number | null;
    okLeft: number | null;
    okWidth: number | null;
    liveX: number | null;
    liveColor: string;
    hasLow: boolean;
    hasHigh: boolean;
  }

  function bandGeom(rule: ThresholdRule, states: Record<string, EntityState>, status: string): BandGeometry {
    const highVal = rule.highEntity ? parseFloat(states[rule.highEntity.id]?.value ?? '') : NaN;
    const lowVal = rule.lowEntity ? parseFloat(states[rule.lowEntity.id]?.value ?? '') : NaN;
    const liveVal = rule.liveEntity ? parseFloat(states[rule.liveEntity.id]?.value ?? '') : NaN;

    const hasHigh = !isNaN(highVal);
    const hasLow = !isNaN(lowVal);

    if (!hasHigh && !hasLow) {
      return { lowTick: null, highTick: null, okLeft: null, okWidth: null, liveX: null, liveColor: 'var(--ok)', hasLow, hasHigh };
    }

    // Use a synthetic range if only one bound exists
    let effectiveLow = hasLow ? lowVal : highVal * 0.5;
    let effectiveHigh = hasHigh ? highVal : lowVal * 1.5;

    // Guard degenerate span (single threshold, equal values, or non-finite)
    const span = effectiveHigh - effectiveLow;
    if (!isFinite(span) || span <= 0) {
      const threshold = hasHigh ? highVal : lowVal;
      const safeSpan = Math.max(Math.abs(threshold), 1);
      effectiveLow = threshold - safeSpan;
      effectiveHigh = threshold + safeSpan;
    }

    const lowTick = hasLow ? bandPct(lowVal, effectiveLow, effectiveHigh) * BAND_W : null;
    const highTick = hasHigh ? bandPct(highVal, effectiveLow, effectiveHigh) * BAND_W : null;
    const okLeft = lowTick ?? 0;
    const okWidth = (highTick ?? BAND_W) - okLeft;

    let liveX: number | null = null;
    let liveColor = 'var(--ok)';
    if (!isNaN(liveVal)) {
      liveX = bandPct(liveVal, effectiveLow, effectiveHigh) * BAND_W;
      if (status === 'HIGH' || status === 'LOW' || status === 'ARMED') {
        liveColor = 'var(--alert)';
      }
    }

    return { lowTick, highTick, okLeft, okWidth, liveX, liveColor, hasLow, hasHigh };
  }

  function thresholdLabel(entity: EntityConfig | null, states: Record<string, EntityState>): string {
    if (!entity) return '';
    const v = states[entity.id]?.value;
    if (v == null) return '?';
    const n = parseFloat(v);
    return isNaN(n) ? v : n.toFixed(0);
  }
</script>

{#if rules.length > 0}
  <div class="alerts-grid">
    {#each rules as rule (rule.metric)}
      {@const states = live.snapshot.states}
      {@const status = alertStatus(rule, states)}
      {@const liveV = liveValue(rule, states)}
      {@const geom = bandGeom(rule, states, status)}

      <div class="rule-card panel">
        <div class="rule-head">
          <div class="rule-meta">
            <span class="rule-label">{rule.label}</span>
            {#if rule.unit}<span class="rule-unit muted">{rule.unit}</span>{/if}
          </div>
          <span class="status-chip status-{status.toLowerCase()}">{status}</span>
        </div>

        <div class="rule-body">
          <div class="live-value mono">{liveV}{#if liveV !== '—' && rule.unit}&nbsp;<span class="muted unit-sm">{rule.unit}</span>{/if}</div>

          <!-- Band visualization -->
          <div class="band-wrap">
            <svg viewBox="0 0 {BAND_W} {BAND_H}" width="100%" height={BAND_H} class="band-svg">
              <!-- background track -->
              <rect x="0" y="10" width={BAND_W} height="12" rx="3" fill="var(--panel-2)" />

              <!-- OK zone (between low and high) -->
              {#if geom.okLeft != null && geom.okWidth != null && geom.okWidth > 0}
                <rect x={geom.okLeft} y="10" width={geom.okWidth} height="12" rx="2" fill="var(--ok)" fill-opacity="0.18" />
              {/if}

              <!-- Low threshold tick -->
              {#if geom.lowTick != null}
                <rect x={geom.lowTick - 1} y="7" width="2" height="18" rx="1" fill="var(--muted)" />
              {/if}

              <!-- High threshold tick -->
              {#if geom.highTick != null}
                <rect x={geom.highTick - 1} y="7" width="2" height="18" rx="1" fill="var(--muted)" />
              {/if}

              <!-- Live value marker -->
              {#if geom.liveX != null}
                <circle cx={geom.liveX} cy="16" r="6" fill={geom.liveColor} />
                <circle cx={geom.liveX} cy="16" r="3" fill="var(--bg)" />
              {/if}
            </svg>

            <div class="band-labels mono">
              {#if geom.hasLow}
                <span class="band-label-low">{thresholdLabel(rule.lowEntity, states)}{rule.unit ? ` ${rule.unit}` : ''}</span>
              {:else}
                <span></span>
              {/if}
              {#if geom.hasHigh}
                <span class="band-label-high">{thresholdLabel(rule.highEntity, states)}{rule.unit ? ` ${rule.unit}` : ''}</span>
              {:else}
                <span></span>
              {/if}
            </div>
          </div>
        </div>

        <!-- Threshold controls -->
        <div class="threshold-controls">
          {#if rule.lowEntity}
            {@const e = rule.lowEntity}
            {@const s = live.snapshot.states[e.id]}
            <label class="threshold-row">
              <span class="muted">Low threshold</span>
              <input
                class="mono"
                type="number"
                min={e.min}
                max={e.max}
                step={e.step ?? 1}
                value={s?.value ?? ''}
                disabled={live.commandPending[e.id]}
                onblur={(ev) => live.sendCommand(e, ev.currentTarget.value)}
              />
            </label>
            {#if live.commandErrors[e.id]}
              <p class="threshold-error">{live.commandErrors[e.id]}</p>
            {/if}
          {/if}
          {#if rule.highEntity}
            {@const e = rule.highEntity}
            {@const s = live.snapshot.states[e.id]}
            <label class="threshold-row">
              <span class="muted">High threshold</span>
              <input
                class="mono"
                type="number"
                min={e.min}
                max={e.max}
                step={e.step ?? 1}
                value={s?.value ?? ''}
                disabled={live.commandPending[e.id]}
                onblur={(ev) => live.sendCommand(e, ev.currentTarget.value)}
              />
            </label>
            {#if live.commandErrors[e.id]}
              <p class="threshold-error">{live.commandErrors[e.id]}</p>
            {/if}
          {/if}
        </div>
      </div>
    {/each}
  </div>
{/if}

{#if fallbackEntries.length > 0}
  <div class="fallback-section">
    <p class="panel-title">Other Alerts</p>
    <div class="panel fallback-list">
      {#each fallbackEntries as entry (entry.entity.id)}
        <div class="fallback-row">
          <span>{entry.label}</span>
          <span class="mono muted">{live.formatState(entry.entity)}</span>
        </div>
      {/each}
    </div>
  </div>
{/if}

{#if rules.length === 0 && fallbackEntries.length === 0}
  <p class="muted no-alerts">No alert rules configured for this device.</p>
{/if}

<style>
  .alerts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--gap);
  }

  .rule-card {
    display: grid;
    gap: 12px;
  }

  .rule-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }

  .rule-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .rule-label {
    font-weight: 600;
    font-size: 0.9rem;
  }

  .rule-unit,
  .muted {
    color: var(--muted);
    font-size: 0.78rem;
  }

  .status-chip {
    flex: none;
    padding: 2px 8px;
    border-radius: var(--r-pill);
    font-size: 0.72rem;
    font-weight: 700;
    font-family: var(--font-mono);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    background: var(--panel-2);
    color: var(--muted);
    border: 1px solid var(--line);
  }

  .status-chip.status-ok {
    background: rgba(63, 185, 80, 0.12);
    color: var(--ok);
    border-color: rgba(63, 185, 80, 0.25);
  }

  .status-chip.status-armed,
  .status-chip.status-high,
  .status-chip.status-low {
    background: rgba(240, 86, 58, 0.14);
    color: var(--alert);
    border-color: rgba(240, 86, 58, 0.3);
  }

  .rule-body {
    display: grid;
    gap: 8px;
  }

  .live-value {
    font-size: 2rem;
    line-height: 1;
    color: var(--text);
  }

  .unit-sm {
    font-size: 1rem;
  }

  .band-wrap {
    display: grid;
    gap: 4px;
  }

  .band-svg {
    display: block;
  }

  .band-labels {
    display: flex;
    justify-content: space-between;
    font-size: 0.7rem;
    color: var(--muted);
  }

  .threshold-controls {
    display: grid;
    gap: 6px;
  }

  .threshold-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 0.82rem;
  }

  .threshold-row input {
    width: 90px;
    min-height: var(--tap);
    padding: 4px 8px;
    border: 1px solid var(--line-strong);
    border-radius: var(--r-control);
    background: var(--panel-2);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 0.88rem;
    text-align: right;
  }

  .threshold-row input:focus {
    outline: 1px solid var(--amber);
    border-color: var(--amber);
  }

  .threshold-row input:disabled {
    opacity: 0.5;
  }

  .threshold-error {
    margin: 0;
    font-size: 0.78rem;
    color: var(--alert);
  }

  .fallback-section {
    margin-top: 16px;
    display: grid;
    gap: 8px;
  }

  .panel-title {
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
    margin: 0;
  }

  .fallback-list {
    display: grid;
  }

  .fallback-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid var(--line);
    font-size: 0.88rem;
  }

  .fallback-row:last-child {
    border-bottom: none;
  }

  .no-alerts {
    margin: 0;
    padding: 24px 0;
    font-size: 0.88rem;
    text-align: center;
  }
</style>
