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
    lowAlertEntity: EntityConfig | null;
    highAlertEntity: EntityConfig | null;
    genericAlertEntity: EntityConfig | null;
    liveEntity: EntityConfig | null;
  }

  interface PairedEntities {
    low: EntityConfig | null;
    high: EntityConfig | null;
  }

  interface AlertEntities extends PairedEntities {
    generic: EntityConfig | null;
  }

  type ThresholdSide = 'low' | 'high';

  interface ThresholdDrag {
    entityId: string;
    side: ThresholdSide;
    value: number;
    pointerId: number;
    domainLow: number;
    domainHigh: number;
    grabOffsetX: number;
  }

  let thresholdDrag = $state<ThresholdDrag | null>(null);
  let thresholdOverrides = $state<Record<string, number>>({});

  $effect(() => {
    const staleIds = Object.entries(thresholdOverrides)
      .filter(([entityId, value]) => {
        const stateValue = live.snapshot.states[entityId]?.value;
        if (stateValue == null || stateValue === '') return false;
        const parsed = Number(stateValue);
        return Number.isFinite(parsed) && Math.abs(parsed - value) < 0.000001;
      })
      .map(([entityId]) => entityId);

    if (staleIds.length === 0) return;

    const next = { ...thresholdOverrides };
    for (const entityId of staleIds) delete next[entityId];
    thresholdOverrides = next;
  });

  function extractMetricPrefix(objectId: string): string {
    // e.g. co2_high_threshold → co2
    //      co2_low_threshold  → co2
    //      co2_high_alert     → co2
    return objectId
      .replace(/_?(high|low|min|max)_?(threshold|alert|limit)?$/, '')
      .replace(/_?(threshold|alert|limit)$/, '')
      .replace(/_$/, '');
  }

  function entitySide(entity: EntityConfig): 'high' | 'low' | null {
    const objectId = (entity.objectId ?? entity.id).toLowerCase();
    const name = (entity.name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const value = `${objectId}_${name}`;

    if (/(^|_)(high|max)(_|$)/.test(value)) return 'high';
    if (/(^|_)(low|min)(_|$)/.test(value)) return 'low';
    return null;
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
    const thresholdMap = new Map<string, PairedEntities>();
    const alertMap = new Map<string, AlertEntities>();

    for (const entry of allEntries) {
      const e = entry.entity;
      const objectId = (e.objectId ?? e.id).toLowerCase();

      if (e.component === 'number') {
        const isThreshold = objectId.includes('threshold') || /(^|_)(high|low|min|max|limit)(_|$)/.test(objectId);
        if (isThreshold) {
          const prefix = extractMetricPrefix(objectId);
          const existing = thresholdMap.get(prefix) ?? { low: null, high: null };
          const side = entitySide(e);
          thresholdMap.set(prefix, {
            low: side === 'low' ? e : existing.low,
            high: side === 'high' ? e : existing.high
          });
        }
      }

      if (e.component === 'binary_sensor') {
        const name = (e.name ?? '').toLowerCase();
        const hasAlert = objectId.includes('alert') || name.includes('alert');
        if (hasAlert) {
          const prefix = extractMetricPrefix(objectId);
          const existing = alertMap.get(prefix) ?? { low: null, high: null, generic: null };
          const side = entitySide(e);
          alertMap.set(prefix, {
            low: side === 'low' ? e : existing.low,
            high: side === 'high' ? e : existing.high,
            generic: side === null ? e : existing.generic
          });
        }
      }
    }

    // Union of all metric prefixes from either map
    const metrics = new Set([...thresholdMap.keys(), ...alertMap.keys()]);

    return [...metrics].map((metric): ThresholdRule => {
      const thresholds = thresholdMap.get(metric) ?? { low: null, high: null };
      const alerts = alertMap.get(metric) ?? { low: null, high: null, generic: null };

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
        lowAlertEntity: alerts.low,
        highAlertEntity: alerts.high,
        genericAlertEntity: alerts.generic,
        liveEntity
      };
    });
  });

  // Entities that are NOT part of a recognized threshold rule → fallback list
  let recognizedIds = $derived(new Set([
    ...rules.flatMap((r) => [
      r.lowEntity?.id,
      r.highEntity?.id,
      r.lowAlertEntity?.id,
      r.highAlertEntity?.id,
      r.genericAlertEntity?.id,
      r.liveEntity?.id
    ].filter(Boolean))
  ]));
  let fallbackEntries = $derived(allEntries.filter((e: import('$lib/device-presentation').PresentedEntity) => !recognizedIds.has(e.entity.id)));

  // ── Per-rule helpers ────────────────────────────────────────────────────────
  function isOn(value: string | null | undefined): boolean {
    return value === 'ON' || value === 'true';
  }

  function isOff(value: string | null | undefined): boolean {
    return value === 'OFF' || value === 'false';
  }

  function alertValue(entity: EntityConfig | null, states: Record<string, EntityState>): string | null | undefined {
    if (!entity) return undefined;
    return states[entity.id]?.value;
  }

  function alertStatus(rule: ThresholdRule, states: Record<string, EntityState>): 'OK' | 'ALERT' | 'ARMED' | 'HIGH' | 'LOW' | 'UNKNOWN' {
    const highValue = alertValue(rule.highAlertEntity, states);
    const lowValue = alertValue(rule.lowAlertEntity, states);
    const genericValue = alertValue(rule.genericAlertEntity, states);

    const highKnown = highValue != null && highValue !== '';
    const lowKnown = lowValue != null && lowValue !== '';
    const genericKnown = genericValue != null && genericValue !== '';
    const hasAlertEntity = Boolean(rule.highAlertEntity || rule.lowAlertEntity || rule.genericAlertEntity);

    if (isOn(highValue) && isOn(lowValue)) return 'ALERT';
    if (isOn(highValue)) return 'HIGH';
    if (isOn(lowValue)) return 'LOW';
    if (isOn(genericValue)) return 'ARMED';

    if (!hasAlertEntity) return (rule.highEntity || rule.lowEntity) ? 'OK' : 'UNKNOWN';
    if (
      (!rule.highAlertEntity || highKnown) &&
      (!rule.lowAlertEntity || lowKnown) &&
      (!rule.genericAlertEntity || genericKnown)
    ) {
      return [highValue, lowValue, genericValue].every((value) => value == null || isOff(value)) ? 'OK' : 'UNKNOWN';
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

  function decimalPlaces(value: number): number {
    const text = String(value).toLowerCase();
    if (text.includes('e-')) {
      const [, exponent] = text.split('e-');
      return Number(exponent) || 0;
    }
    const decimal = text.split('.')[1];
    return decimal?.length ?? 0;
  }

  function stepFor(entity: EntityConfig): number {
    return Number.isFinite(entity.step) && (entity.step as number) > 0 ? (entity.step as number) : 1;
  }

  function precisionFor(entity: EntityConfig): number {
    if (Number.isFinite(entity.suggestedDisplayPrecision)) return entity.suggestedDisplayPrecision as number;
    return Math.min(decimalPlaces(stepFor(entity)), 6);
  }

  function formatThresholdValue(entity: EntityConfig, value: number): string {
    const precision = precisionFor(entity);
    return precision > 0 ? value.toFixed(precision) : value.toFixed(0);
  }

  function numericStateValue(entity: EntityConfig | null, states: Record<string, EntityState>): number | null {
    if (!entity) return null;
    const value = states[entity.id]?.value;
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function hasOverride(entityId: string): boolean {
    return Object.prototype.hasOwnProperty.call(thresholdOverrides, entityId);
  }

  function thresholdValue(entity: EntityConfig | null, states: Record<string, EntityState>): number | null {
    if (!entity) return null;
    if (thresholdDrag?.entityId === entity.id) return thresholdDrag.value;
    if (hasOverride(entity.id)) return thresholdOverrides[entity.id];
    return numericStateValue(entity, states);
  }

  function finiteOrNull(value: number | undefined): number | null {
    return Number.isFinite(value) ? (value as number) : null;
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  function roundToStep(value: number, entity: EntityConfig): number {
    const step = stepFor(entity);
    const origin = finiteOrNull(entity.min) ?? 0;
    const precision = Math.min(Math.max(decimalPlaces(step), decimalPlaces(origin)), 6);
    const rounded = origin + Math.round((value - origin) / step) * step;
    return Number(rounded.toFixed(precision));
  }

  function thresholdBounds(entity: EntityConfig, rule: ThresholdRule, side: ThresholdSide, states: Record<string, EntityState>): { min: number; max: number } {
    const fallback = thresholdValue(entity, states) ?? numericStateValue(entity, states) ?? 0;
    let min = finiteOrNull(entity.min) ?? fallback - Math.max(Math.abs(fallback), 1);
    let max = finiteOrNull(entity.max) ?? fallback + Math.max(Math.abs(fallback), 1);
    const sibling = thresholdValue(side === 'low' ? rule.highEntity : rule.lowEntity, states);

    if (sibling != null) {
      const step = stepFor(entity);
      if (side === 'low') max = Math.min(max, sibling - step);
      if (side === 'high') min = Math.max(min, sibling + step);
    }

    if (min <= max) return { min, max };
    return { min: fallback, max: fallback };
  }

  function normalizeThresholdValue(entity: EntityConfig, rule: ThresholdRule, side: ThresholdSide, states: Record<string, EntityState>, value: number): number {
    const { min, max } = thresholdBounds(entity, rule, side, states);
    const rounded = roundToStep(clamp(value, min, max), entity);
    return clamp(rounded, min, max);
  }

  function paddedDomain(low: number, high: number, margin = 0.15): { low: number; high: number } {
    const span = high - low;
    return {
      low: low - span * margin,
      high: high + span * margin
    };
  }

  function bandPct(value: number, domainLow: number, domainHigh: number): number {
    const total = domainHigh - domainLow;
    return Math.max(0, Math.min(1, (value - domainLow) / total));
  }

  function ruleBandDomain(
    rule: ThresholdRule,
    lowValue: number | null,
    highValue: number | null,
    liveValue: number | null
  ): { low: number; high: number } | null {
    const configured = [
      finiteOrNull(rule.lowEntity?.min),
      finiteOrNull(rule.lowEntity?.max),
      finiteOrNull(rule.highEntity?.min),
      finiteOrNull(rule.highEntity?.max)
    ].filter((value): value is number => value != null);

    if (configured.length >= 2) {
      const low = Math.min(...configured);
      const high = Math.max(...configured);
      if (high > low) return { low, high };
    }

    const observed = [lowValue, highValue, liveValue].filter((value): value is number => value != null);
    if (observed.length >= 2) {
      const low = Math.min(...observed);
      const high = Math.max(...observed);
      if (high > low) return paddedDomain(low, high);
    }

    const value = observed[0];
    if (value == null) return null;
    const safeSpan = Math.max(Math.abs(value), 1);
    return { low: value - safeSpan, high: value + safeSpan };
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
    lowValue: number | null;
    highValue: number | null;
    domainLow: number | null;
    domainHigh: number | null;
  }

  function bandGeom(rule: ThresholdRule, states: Record<string, EntityState>, status: string): BandGeometry {
    const highVal = thresholdValue(rule.highEntity, states);
    const lowVal = thresholdValue(rule.lowEntity, states);
    const liveRaw = rule.liveEntity ? parseFloat(states[rule.liveEntity.id]?.value ?? '') : NaN;
    const liveVal = Number.isFinite(liveRaw) ? liveRaw : null;

    const hasHigh = highVal != null;
    const hasLow = lowVal != null;
    const domain = ruleBandDomain(rule, lowVal, highVal, liveVal);

    if ((!hasHigh && !hasLow) || !domain) {
      return {
        lowTick: null,
        highTick: null,
        okLeft: null,
        okWidth: null,
        liveX: null,
        liveColor: 'var(--ok)',
        hasLow,
        hasHigh,
        lowValue: null,
        highValue: null,
        domainLow: null,
        domainHigh: null
      };
    }

    const lowTick = hasLow ? bandPct(lowVal as number, domain.low, domain.high) * BAND_W : null;
    const highTick = hasHigh ? bandPct(highVal as number, domain.low, domain.high) * BAND_W : null;
    const okLeft = lowTick ?? 0;
    const okWidth = (highTick ?? BAND_W) - okLeft;

    let liveX: number | null = null;
    let liveColor = 'var(--ok)';
    if (liveVal != null) {
      liveX = bandPct(liveVal, domain.low, domain.high) * BAND_W;
      if (status === 'HIGH' || status === 'LOW' || status === 'ALERT' || status === 'ARMED') {
        liveColor = 'var(--alert)';
      }
    }

    return {
      lowTick,
      highTick,
      okLeft,
      okWidth,
      liveX,
      liveColor,
      hasLow,
      hasHigh,
      lowValue: hasLow ? lowVal : null,
      highValue: hasHigh ? highVal : null,
      domainLow: domain.low,
      domainHigh: domain.high
    };
  }

  function thresholdLabel(entity: EntityConfig | null, states: Record<string, EntityState>, unit: string | null): string {
    if (!entity) return '';
    const value = thresholdValue(entity, states);
    if (value == null) return '?';
    return `${formatThresholdValue(entity, value)}${unit ? ` ${unit}` : ''}`;
  }

  function pointerBandX(event: PointerEvent, target: EventTarget | null): number | null {
    const element = target instanceof SVGSVGElement ? target : target instanceof SVGElement ? target.ownerSVGElement : null;
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0) return null;
    return clamp(((event.clientX - rect.left) / rect.width) * BAND_W, 0, BAND_W);
  }

  function pointerThresholdValue(
    event: PointerEvent,
    target: EventTarget | null,
    entity: EntityConfig,
    rule: ThresholdRule,
    side: ThresholdSide,
    drag: ThresholdDrag
  ): number | null {
    const x = pointerBandX(event, target);
    if (x == null) return null;
    const adjustedX = clamp(x - drag.grabOffsetX, 0, BAND_W);
    const rawValue = drag.domainLow + (adjustedX / BAND_W) * (drag.domainHigh - drag.domainLow);
    return normalizeThresholdValue(entity, rule, side, live.snapshot.states, rawValue);
  }

  function thresholdHandleClass(entity: EntityConfig): string {
    return [
      'threshold-handle',
      live.commandPending[entity.id] ? 'is-pending' : '',
      thresholdDrag?.entityId === entity.id ? 'is-dragging' : ''
    ].filter(Boolean).join(' ');
  }

  function startThresholdDrag(event: PointerEvent, rule: ThresholdRule, side: ThresholdSide, geom: BandGeometry): void {
    const entity = side === 'low' ? rule.lowEntity : rule.highEntity;
    const tick = side === 'low' ? geom.lowTick : geom.highTick;
    const value = side === 'low' ? geom.lowValue : geom.highValue;
    if (!entity || live.commandPending[entity.id] || tick == null || value == null || geom.domainLow == null || geom.domainHigh == null) return;

    const x = pointerBandX(event, event.currentTarget);
    if (x == null) return;

    event.preventDefault();
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    thresholdDrag = {
      entityId: entity.id,
      side,
      value,
      pointerId: event.pointerId,
      domainLow: geom.domainLow,
      domainHigh: geom.domainHigh,
      grabOffsetX: x - tick
    };
  }

  function moveThresholdDrag(event: PointerEvent, rule: ThresholdRule, side: ThresholdSide): void {
    const entity = side === 'low' ? rule.lowEntity : rule.highEntity;
    if (!entity || !thresholdDrag || thresholdDrag.entityId !== entity.id || thresholdDrag.pointerId !== event.pointerId) return;

    const value = pointerThresholdValue(event, event.currentTarget, entity, rule, side, thresholdDrag);
    if (value == null) return;

    event.preventDefault();
    thresholdDrag = { ...thresholdDrag, value };
  }

  function clearThresholdOverride(entityId: string): void {
    if (!hasOverride(entityId)) return;
    const next = { ...thresholdOverrides };
    delete next[entityId];
    thresholdOverrides = next;
  }

  function sameThresholdValue(entity: EntityConfig, a: number | null, b: number | null): boolean {
    if (a == null || b == null) return false;
    return Math.abs(a - b) < stepFor(entity) / 1000;
  }

  async function publishThreshold(entity: EntityConfig, value: number): Promise<void> {
    thresholdOverrides = { ...thresholdOverrides, [entity.id]: value };
    const ok = await live.sendCommand(entity, value);
    if (!ok) clearThresholdOverride(entity.id);
  }

  async function endThresholdDrag(event: PointerEvent, rule: ThresholdRule, side: ThresholdSide): Promise<void> {
    const entity = side === 'low' ? rule.lowEntity : rule.highEntity;
    if (!entity || !thresholdDrag || thresholdDrag.entityId !== entity.id || thresholdDrag.pointerId !== event.pointerId) return;

    const nextValue = pointerThresholdValue(event, event.currentTarget, entity, rule, side, thresholdDrag) ?? thresholdDrag.value;
    const currentValue = numericStateValue(entity, live.snapshot.states);

    event.preventDefault();
    (event.currentTarget as Element).releasePointerCapture?.(event.pointerId);
    thresholdDrag = null;

    if (sameThresholdValue(entity, currentValue, nextValue)) {
      clearThresholdOverride(entity.id);
      return;
    }

    await publishThreshold(entity, nextValue);
  }

  function cancelThresholdDrag(event: PointerEvent): void {
    if (!thresholdDrag || thresholdDrag.pointerId !== event.pointerId) return;
    (event.currentTarget as Element).releasePointerCapture?.(event.pointerId);
    thresholdDrag = null;
  }

  async function nudgeThreshold(event: KeyboardEvent, rule: ThresholdRule, side: ThresholdSide): Promise<void> {
    const entity = side === 'low' ? rule.lowEntity : rule.highEntity;
    if (!entity || live.commandPending[entity.id]) return;

    const currentValue = thresholdValue(entity, live.snapshot.states);
    if (currentValue == null) return;

    const step = stepFor(entity);
    let nextValue: number | null = null;

    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') nextValue = currentValue - step;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') nextValue = currentValue + step;
    if (event.key === 'PageDown') nextValue = currentValue - step * 10;
    if (event.key === 'PageUp') nextValue = currentValue + step * 10;
    if (event.key === 'Home') nextValue = thresholdBounds(entity, rule, side, live.snapshot.states).min;
    if (event.key === 'End') nextValue = thresholdBounds(entity, rule, side, live.snapshot.states).max;
    if (nextValue == null) return;

    event.preventDefault();
    const normalized = normalizeThresholdValue(entity, rule, side, live.snapshot.states, nextValue);
    if (sameThresholdValue(entity, numericStateValue(entity, live.snapshot.states), normalized)) return;
    await publishThreshold(entity, normalized);
  }

  function ariaThresholdMin(entity: EntityConfig, rule: ThresholdRule, side: ThresholdSide): number {
    return thresholdBounds(entity, rule, side, live.snapshot.states).min;
  }

  function ariaThresholdMax(entity: EntityConfig, rule: ThresholdRule, side: ThresholdSide): number {
    return thresholdBounds(entity, rule, side, live.snapshot.states).max;
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
              {#if rule.lowEntity && geom.lowTick != null && geom.lowValue != null}
                {@const e = rule.lowEntity}
                <g
                  class={thresholdHandleClass(e)}
                  data-threshold-side="low"
                  data-entity-id={e.id}
                  role="slider"
                  tabindex={live.commandPending[e.id] ? -1 : 0}
                  aria-label={`${rule.label} low threshold`}
                  aria-valuemin={ariaThresholdMin(e, rule, 'low')}
                  aria-valuemax={ariaThresholdMax(e, rule, 'low')}
                  aria-valuenow={geom.lowValue}
                  aria-valuetext={thresholdLabel(e, states, rule.unit)}
                  onpointerdown={(ev) => startThresholdDrag(ev, rule, 'low', geom)}
                  onpointermove={(ev) => moveThresholdDrag(ev, rule, 'low')}
                  onpointerup={(ev) => endThresholdDrag(ev, rule, 'low')}
                  onpointercancel={(ev) => cancelThresholdDrag(ev)}
                  onkeydown={(ev) => nudgeThreshold(ev, rule, 'low')}
                >
                  <rect class="threshold-hit" x={geom.lowTick - 12} y="0" width="24" height={BAND_H} rx="4" />
                  <rect class="threshold-focus" x={geom.lowTick - 5} y="4" width="10" height="24" rx="5" />
                  <rect class="threshold-tick" x={geom.lowTick - 1.5} y="5" width="3" height="22" rx="1.5" />
                </g>
              {/if}

              <!-- High threshold tick -->
              {#if rule.highEntity && geom.highTick != null && geom.highValue != null}
                {@const e = rule.highEntity}
                <g
                  class={thresholdHandleClass(e)}
                  data-threshold-side="high"
                  data-entity-id={e.id}
                  role="slider"
                  tabindex={live.commandPending[e.id] ? -1 : 0}
                  aria-label={`${rule.label} high threshold`}
                  aria-valuemin={ariaThresholdMin(e, rule, 'high')}
                  aria-valuemax={ariaThresholdMax(e, rule, 'high')}
                  aria-valuenow={geom.highValue}
                  aria-valuetext={thresholdLabel(e, states, rule.unit)}
                  onpointerdown={(ev) => startThresholdDrag(ev, rule, 'high', geom)}
                  onpointermove={(ev) => moveThresholdDrag(ev, rule, 'high')}
                  onpointerup={(ev) => endThresholdDrag(ev, rule, 'high')}
                  onpointercancel={(ev) => cancelThresholdDrag(ev)}
                  onkeydown={(ev) => nudgeThreshold(ev, rule, 'high')}
                >
                  <rect class="threshold-hit" x={geom.highTick - 12} y="0" width="24" height={BAND_H} rx="4" />
                  <rect class="threshold-focus" x={geom.highTick - 5} y="4" width="10" height="24" rx="5" />
                  <rect class="threshold-tick" x={geom.highTick - 1.5} y="5" width="3" height="22" rx="1.5" />
                </g>
              {/if}

              <!-- Live value marker -->
              {#if geom.liveX != null}
                <circle class="live-marker" cx={geom.liveX} cy="16" r="6" fill={geom.liveColor} />
                <circle cx={geom.liveX} cy="16" r="3" fill="var(--bg)" />
              {/if}
            </svg>

            <div class="band-labels mono">
              {#if geom.hasLow}
                <span class="band-label-low">{thresholdLabel(rule.lowEntity, states, rule.unit)}</span>
              {:else}
                <span></span>
              {/if}
              {#if geom.hasHigh}
                <span class="band-label-high">{thresholdLabel(rule.highEntity, states, rule.unit)}</span>
              {:else}
                <span></span>
              {/if}
            </div>
          </div>
        </div>

        {#if (rule.lowEntity && live.commandErrors[rule.lowEntity.id]) || (rule.highEntity && live.commandErrors[rule.highEntity.id])}
          <div class="threshold-errors">
            {#if rule.lowEntity && live.commandErrors[rule.lowEntity.id]}
              <p class="threshold-error">{live.commandErrors[rule.lowEntity.id]}</p>
            {/if}
            {#if rule.highEntity && live.commandErrors[rule.highEntity.id]}
              <p class="threshold-error">{live.commandErrors[rule.highEntity.id]}</p>
            {/if}
          </div>
        {/if}
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
  .status-chip.status-alert,
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
    touch-action: none;
    overflow: visible;
  }

  .threshold-handle {
    cursor: ew-resize;
    outline: none;
    touch-action: none;
  }

  .threshold-hit {
    fill: transparent;
    pointer-events: all;
  }

  .threshold-focus {
    fill: transparent;
    stroke: transparent;
    stroke-width: 1.5;
  }

  .threshold-tick {
    fill: var(--muted);
  }

  .threshold-handle:hover .threshold-tick,
  .threshold-handle:focus-visible .threshold-tick,
  .threshold-handle.is-dragging .threshold-tick {
    fill: var(--text);
  }

  .threshold-handle:focus-visible .threshold-focus,
  .threshold-handle.is-dragging .threshold-focus {
    stroke: var(--amber);
  }

  .threshold-handle.is-pending {
    cursor: wait;
    opacity: 0.55;
  }

  .band-labels {
    display: flex;
    justify-content: space-between;
    font-size: 0.7rem;
    color: var(--muted);
  }

  .threshold-errors {
    display: grid;
    gap: 4px;
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
