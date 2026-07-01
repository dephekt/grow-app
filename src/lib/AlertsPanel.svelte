<script lang="ts">
  import type { PresentedSection } from '$lib/device-presentation';
  import type { EntityConfig, EntityState } from '$lib/server/mqtt/types';
  import type { LiveSnapshot } from '$lib/live-snapshot-context';
  import {
    entitySide,
    isAlarmTestButton,
    isAlertEntity,
    isBuzzerSwitch,
    isThresholdEntity,
    metricPrefix
  } from '$lib/threshold-match';
  import { isAmbientTemperature, isCo2, isHumidity, isThermalMeanTemp, isWaterPh } from '$lib/entity-match';

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
  // and pair them with matching alert binary_sensors by metric prefix. The
  // recognition itself lives in $lib/threshold-match so device-settings'
  // isAlertsCurated stays in sync.
  interface ThresholdRule {
    metric: string;          // e.g. "co2"
    label: string;           // e.g. "CO₂"
    unit: string | null;
    lowEntity: EntityConfig | null;
    highEntity: EntityConfig | null;
    lowAlertEntity: EntityConfig | null;
    highAlertEntity: EntityConfig | null;
    genericAlertEntity: EntityConfig | null;
    /** Single-band-alarm extras (e.g. the thermal camera): buzzer-mute switch and
     *  sound-test button, attached by the alarm's family root; null for split alerts. */
    buzzerEntity: EntityConfig | null;
    alarmTestEntity: EntityConfig | null;
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
    startValue: number;
    pointerId: number;
    domainLow: number;
    domainHigh: number;
    grabOffsetX: number;
    moved: boolean;
  }

  /** Optimistic value the user dragged/nudged to, plus the live `updatedAt` seen
   *  when we published it — so we can clear the override the moment the device
   *  echoes ANY fresh state, even one that differs from what we sent. */
  interface ThresholdOverride {
    value: number;
    baseUpdatedAt: string | null;
  }

  const OVERRIDE_TIMEOUT_MS = 10000;

  let thresholdDrag = $state<ThresholdDrag | null>(null);
  let thresholdOverrides = $state<Record<string, ThresholdOverride>>({});
  // Plain (non-reactive) map of safety timers that drop an override if the device
  // accepts a command but never echoes a state back.
  let overrideTimers: Record<string, ReturnType<typeof setTimeout>> = {};

  // Reconcile: drop an optimistic override once the device echoes a fresh state
  // for that entity (its updatedAt advanced past what we saw at publish time),
  // regardless of whether the device applied exactly the value we sent.
  $effect(() => {
    const staleIds = Object.entries(thresholdOverrides)
      .filter(([entityId, override]) => {
        const state = live.snapshot.states[entityId];
        return state != null && state.updatedAt !== override.baseUpdatedAt;
      })
      .map(([entityId]) => entityId);

    if (staleIds.length === 0) return;

    const next = { ...thresholdOverrides };
    for (const entityId of staleIds) {
      delete next[entityId];
      clearOverrideTimer(entityId);
    }
    thresholdOverrides = next;
  });

  // Drop any pending safety timers on unmount.
  $effect(() => {
    return () => {
      for (const timer of Object.values(overrideTimers)) clearTimeout(timer);
      overrideTimers = {};
    };
  });

  function labelForMetric(metric: string): string {
    const map: Record<string, string> = {
      co2: 'CO₂',
      ph: 'pH',
      ec: 'EC',
      temperature: 'Temperature',
      humidity: 'Humidity',
      vpd: 'VPD',
      tds: 'TDS',
      thermal_alarm: 'Thermal'
    };
    return map[metric] ?? metric.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /** Map a metric key to a shared entity-match recogniser where one exists, so the
   *  live-sensor lookup keys off deviceClass for the covered metrics; EC/VPD/TDS
   *  (no recogniser) fall back to substring matching. */
  function metricRecognizer(metric: string): ((e: EntityConfig) => boolean) | null {
    switch (metric) {
      case 'co2':
        return isCo2;
      case 'humidity':
        return isHumidity;
      case 'temperature':
        return isAmbientTemperature;
      case 'ph':
        return isWaterPh;
      case 'thermal_alarm':
        return isThermalMeanTemp;
      default:
        return null;
    }
  }

  function liveSensorFor(metric: string, entities: EntityConfig[]): EntityConfig | null {
    const recognizer = metricRecognizer(metric);
    if (recognizer) {
      const match = entities.find(recognizer);
      if (match) return match;
    }
    // Substring fallback for metrics without a recogniser (ec/vpd/tds) or unusual ids.
    return (
      entities.find((e: EntityConfig) => {
        if (e.component !== 'sensor') return false;
        const oid = (e.objectId ?? e.id).toLowerCase();
        const nm = (e.name ?? '').toLowerCase();
        const isMetric = oid.includes(metric) || nm.includes(metric);
        const isControl = oid.includes('threshold') || oid.includes('alert') || oid.includes('limit');
        return isMetric && !isControl;
      }) ?? null
    );
  }

  let allEntries = $derived(groups.flatMap((g: PresentedSection) => g.entries));

  /** The first curated control matching `pred` whose object_id shares an alarm family
   *  root (e.g. `thermal` for the `thermal_alarm` band), so a single-band alarm's
   *  buzzer switch / test button attach to its card rather than the fallback list. */
  function findControl(pred: (e: EntityConfig) => boolean, root: string): EntityConfig | null {
    return (
      allEntries
        .map((entry: import('$lib/device-presentation').PresentedEntity) => entry.entity)
        .find((e: EntityConfig) => pred(e) && (e.objectId ?? e.id).toLowerCase().startsWith(root)) ?? null
    );
  }

  let rules = $derived.by((): ThresholdRule[] => {
    const thresholdMap = new Map<string, PairedEntities>();
    const alertMap = new Map<string, AlertEntities>();

    for (const entry of allEntries) {
      const e = entry.entity;

      if (isThresholdEntity(e)) {
        const prefix = metricPrefix(e);
        const existing = thresholdMap.get(prefix) ?? { low: null, high: null };
        const side = entitySide(e);
        thresholdMap.set(prefix, {
          low: side === 'low' ? e : existing.low,
          high: side === 'high' ? e : existing.high
        });
      }

      if (isAlertEntity(e)) {
        const prefix = metricPrefix(e);
        const existing = alertMap.get(prefix) ?? { low: null, high: null, generic: null };
        const side = entitySide(e);
        alertMap.set(prefix, {
          low: side === 'low' ? e : existing.low,
          high: side === 'high' ? e : existing.high,
          generic: side === null ? e : existing.generic
        });
      }
    }

    // Union of all metric prefixes from either map
    const metrics = new Set([...thresholdMap.keys(), ...alertMap.keys()]);

    return [...metrics].map((metric): ThresholdRule => {
      const thresholds = thresholdMap.get(metric) ?? { low: null, high: null };
      const alerts = alertMap.get(metric) ?? { low: null, high: null, generic: null };

      // Find a live sensor for this metric (prefer the shared recogniser).
      const liveEntity = liveSensorFor(metric, deviceEntities);

      // A single-band alarm (one generic alert, no split high/low — e.g. the thermal
      // camera's `thermal_alarm`) may ship a buzzer-mute switch and a sound-test button
      // that don't group by metric prefix. Attach them by the alarm's family root
      // (metric `thermal_alarm` → `thermal`) so they render inside the card instead of
      // dropping to the fallback list.
      const familyRoot = alerts.generic ? metric.replace(/_?alarm$/, '') : '';
      const buzzerEntity = familyRoot ? findControl(isBuzzerSwitch, familyRoot) : null;
      const alarmTestEntity = familyRoot ? findControl(isAlarmTestButton, familyRoot) : null;

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
        buzzerEntity,
        alarmTestEntity,
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
      r.buzzerEntity?.id,
      r.alarmTestEntity?.id,
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

  /** Status derived purely from the live reading vs the device's thresholds.
   *  Used when there's no alert sensor, or to recover HIGH/LOW direction from a
   *  single combined alert. Uses committed threshold values, not optimistic ones. */
  function statusFromLive(rule: ThresholdRule, states: Record<string, EntityState>): 'OK' | 'HIGH' | 'LOW' | 'UNKNOWN' {
    const liveVal = numericStateValue(rule.liveEntity, states);
    if (liveVal == null) return 'UNKNOWN';
    const high = numericStateValue(rule.highEntity, states);
    const low = numericStateValue(rule.lowEntity, states);
    if (high != null && liveVal >= high) return 'HIGH';
    if (low != null && liveVal <= low) return 'LOW';
    return 'OK';
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
    if (isOn(genericValue)) {
      // A single combined alert is on but carries no direction; recover HIGH/LOW
      // from the live value vs thresholds, else fall back to ARMED.
      const byLive = statusFromLive(rule, states);
      return byLive === 'HIGH' || byLive === 'LOW' ? byLive : 'ARMED';
    }

    // No alert sensor at all → reflect the live reading vs thresholds.
    if (!hasAlertEntity) return statusFromLive(rule, states);

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

  /** Displayed threshold value: live drag → optimistic override → committed state. */
  function thresholdValue(entity: EntityConfig | null, states: Record<string, EntityState>): number | null {
    if (!entity) return null;
    if (thresholdDrag?.entityId === entity.id) return thresholdDrag.value;
    if (hasOverride(entity.id)) return thresholdOverrides[entity.id].value;
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
    liveVal: number | null
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

    const observed = [lowValue, highValue, liveVal].filter((value): value is number => value != null);
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

  /** The band domain derived from configured bounds / committed state only — stable
   *  across a drag (does not feed the live drag value back in). */
  function stableDomain(rule: ThresholdRule, states: Record<string, EntityState>): { low: number; high: number } | null {
    return ruleBandDomain(
      rule,
      numericStateValue(rule.lowEntity, states),
      numericStateValue(rule.highEntity, states),
      numericStateValue(rule.liveEntity, states)
    );
  }

  function thresholdBounds(entity: EntityConfig, rule: ThresholdRule, side: ThresholdSide, states: Record<string, EntityState>): { min: number; max: number } {
    const domain = stableDomain(rule, states);
    const fallback = numericStateValue(entity, states) ?? (domain ? (domain.low + domain.high) / 2 : 0);
    // For unconfigured entities, bound to the stable domain rather than recentring
    // on the moving value every frame.
    let min = finiteOrNull(entity.min) ?? domain?.low ?? fallback - Math.max(Math.abs(fallback), 1);
    let max = finiteOrNull(entity.max) ?? domain?.high ?? fallback + Math.max(Math.abs(fallback), 1);
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

  /** A neutral handle position when the threshold has no committed value yet, so a
   *  state-less but writable threshold is still draggable. */
  function midpoint(entity: EntityConfig | null, domain: { low: number; high: number }): number {
    const min = finiteOrNull(entity?.min);
    const max = finiteOrNull(entity?.max);
    if (min != null && max != null) return (min + max) / 2;
    return (domain.low + domain.high) / 2;
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
    lowKnown: boolean;
    highKnown: boolean;
    domainLow: number | null;
    domainHigh: number | null;
  }

  function bandGeom(rule: ThresholdRule, states: Record<string, EntityState>, status: string): BandGeometry {
    const liveRaw = rule.liveEntity ? parseFloat(states[rule.liveEntity.id]?.value ?? '') : NaN;
    const liveVal = Number.isFinite(liveRaw) ? liveRaw : null;

    const lowReal = thresholdValue(rule.lowEntity, states);
    const highReal = thresholdValue(rule.highEntity, states);

    const hasLow = rule.lowEntity != null;
    const hasHigh = rule.highEntity != null;

    // While dragging a handle of this rule, reuse the domain frozen at drag start
    // so the rendered tick and the pointer→value mapping share one coordinate
    // space (no mid-drag drift). Otherwise derive a stable domain from committed
    // values only.
    const activeDrag =
      thresholdDrag && (thresholdDrag.entityId === rule.lowEntity?.id || thresholdDrag.entityId === rule.highEntity?.id)
        ? thresholdDrag
        : null;
    const domain = activeDrag
      ? { low: activeDrag.domainLow, high: activeDrag.domainHigh }
      : stableDomain(rule, states);

    if ((!hasLow && !hasHigh) || !domain) {
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
        lowKnown: false,
        highKnown: false,
        domainLow: null,
        domainHigh: null
      };
    }

    // Display value: the real (drag/override/committed) value, or a neutral
    // midpoint when the threshold has never reported — so the handle is settable.
    const lowDisplay = hasLow ? lowReal ?? clamp(midpoint(rule.lowEntity, domain), domain.low, domain.high) : null;
    const highDisplay = hasHigh ? highReal ?? clamp(midpoint(rule.highEntity, domain), domain.low, domain.high) : null;

    const lowTick = lowDisplay != null ? bandPct(lowDisplay, domain.low, domain.high) * BAND_W : null;
    const highTick = highDisplay != null ? bandPct(highDisplay, domain.low, domain.high) * BAND_W : null;

    // OK zone spans only between *known* thresholds.
    const okLeft = (lowReal != null ? lowTick : null) ?? 0;
    const okRight = (highReal != null ? highTick : null) ?? BAND_W;
    const okWidth = okRight - okLeft;

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
      lowValue: lowDisplay,
      highValue: highDisplay,
      lowKnown: lowReal != null,
      highKnown: highReal != null,
      domainLow: domain.low,
      domainHigh: domain.high
    };
  }

  function thresholdLabel(entity: EntityConfig | null, states: Record<string, EntityState>, unit: string | null): string {
    if (!entity) return '';
    const value = thresholdValue(entity, states);
    if (value == null) return '?';
    return `${formatThresholdValue(entity, value)}${unit ? ` ${unit}` : ''}`;
  }

  /** Map a client pointer position to a band x in viewBox user units via the SVG's
   *  own coordinate transform, so it stays correct regardless of preserveAspectRatio
   *  padding/scaling (the band is centred, not full-width, on wide cards). */
  function pointerBandX(event: PointerEvent, target: EventTarget | null): number | null {
    const svg = target instanceof SVGSVGElement ? target : target instanceof SVGElement ? target.ownerSVGElement : null;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    return clamp(point.x, 0, BAND_W);
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
    // Ignore a second concurrent pointer so a multi-touch can't clobber the active
    // drag and orphan the first (pointer-captured) handle.
    if (thresholdDrag) return;

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
      startValue: value,
      pointerId: event.pointerId,
      domainLow: geom.domainLow,
      domainHigh: geom.domainHigh,
      grabOffsetX: x - tick,
      moved: false
    };
  }

  function moveThresholdDrag(event: PointerEvent, rule: ThresholdRule, side: ThresholdSide): void {
    const entity = side === 'low' ? rule.lowEntity : rule.highEntity;
    if (!entity || !thresholdDrag || thresholdDrag.entityId !== entity.id || thresholdDrag.pointerId !== event.pointerId) return;

    const value = pointerThresholdValue(event, event.currentTarget, entity, rule, side, thresholdDrag);
    if (value == null) return;

    event.preventDefault();
    // "moved" = the rounded value has actually left the (rounded) start value, so a
    // pure tap/focus — which only rounds an off-grid committed value — is not an edit.
    const moved = thresholdDrag.moved || !sameThresholdValue(entity, value, roundToStep(thresholdDrag.startValue, entity));
    thresholdDrag = { ...thresholdDrag, value, moved };
  }

  function clearOverrideTimer(entityId: string): void {
    if (overrideTimers[entityId]) {
      clearTimeout(overrideTimers[entityId]);
      delete overrideTimers[entityId];
    }
  }

  function scheduleOverrideTimeout(entityId: string): void {
    clearOverrideTimer(entityId);
    overrideTimers[entityId] = setTimeout(() => {
      delete overrideTimers[entityId];
      clearThresholdOverride(entityId);
    }, OVERRIDE_TIMEOUT_MS);
  }

  function clearThresholdOverride(entityId: string): void {
    clearOverrideTimer(entityId);
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
    const baseUpdatedAt = live.snapshot.states[entity.id]?.updatedAt ?? null;
    thresholdOverrides = { ...thresholdOverrides, [entity.id]: { value, baseUpdatedAt } };
    const ok = await live.sendCommand(entity, value);
    if (!ok) {
      clearThresholdOverride(entity.id);
      return;
    }
    // Safety net: if the device accepts but never echoes a state, don't pin forever.
    scheduleOverrideTimeout(entity.id);
  }

  async function endThresholdDrag(event: PointerEvent, rule: ThresholdRule, side: ThresholdSide): Promise<void> {
    const entity = side === 'low' ? rule.lowEntity : rule.highEntity;
    if (!entity || !thresholdDrag || thresholdDrag.entityId !== entity.id || thresholdDrag.pointerId !== event.pointerId) return;

    const drag = thresholdDrag;
    const nextValue = pointerThresholdValue(event, event.currentTarget, entity, rule, side, drag) ?? drag.value;

    event.preventDefault();
    (event.currentTarget as Element).releasePointerCapture?.(event.pointerId);
    thresholdDrag = null;

    // A tap/focus with no real movement must not publish (would round an off-grid
    // device value and overwrite it).
    if (!drag.moved) return;

    // Compare against the value the user currently sees (override if in flight, else
    // committed) so a correction back toward the committed value still publishes.
    const baseline = hasOverride(entity.id) ? thresholdOverrides[entity.id].value : numericStateValue(entity, live.snapshot.states);
    if (sameThresholdValue(entity, baseline, nextValue)) return;

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

    const bounds = thresholdBounds(entity, rule, side, live.snapshot.states);
    const currentValue = thresholdValue(entity, live.snapshot.states) ?? (bounds.min + bounds.max) / 2;

    const step = stepFor(entity);
    let nextValue: number | null = null;

    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') nextValue = currentValue - step;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') nextValue = currentValue + step;
    if (event.key === 'PageDown') nextValue = currentValue - step * 10;
    if (event.key === 'PageUp') nextValue = currentValue + step * 10;
    if (event.key === 'Home') nextValue = bounds.min;
    if (event.key === 'End') nextValue = bounds.max;
    if (nextValue == null) return;

    event.preventDefault();
    const normalized = normalizeThresholdValue(entity, rule, side, live.snapshot.states, nextValue);
    // No-op only when the new value matches what the user currently sees.
    const baseline = hasOverride(entity.id) ? thresholdOverrides[entity.id].value : numericStateValue(entity, live.snapshot.states);
    if (sameThresholdValue(entity, baseline, normalized)) return;
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

      {#snippet thresholdHandle(side: ThresholdSide)}
        {@const entity = side === 'low' ? rule.lowEntity : rule.highEntity}
        {@const tick = side === 'low' ? geom.lowTick : geom.highTick}
        {@const value = side === 'low' ? geom.lowValue : geom.highValue}
        {#if entity && tick != null && value != null}
          <g
            class={thresholdHandleClass(entity)}
            data-threshold-side={side}
            data-entity-id={entity.id}
            role="slider"
            tabindex={live.commandPending[entity.id] ? -1 : 0}
            aria-label={`${rule.label} ${side} threshold`}
            aria-valuemin={ariaThresholdMin(entity, rule, side)}
            aria-valuemax={ariaThresholdMax(entity, rule, side)}
            aria-valuenow={value}
            aria-valuetext={thresholdLabel(entity, states, rule.unit)}
            onpointerdown={(ev) => startThresholdDrag(ev, rule, side, geom)}
            onpointermove={(ev) => moveThresholdDrag(ev, rule, side)}
            onpointerup={(ev) => endThresholdDrag(ev, rule, side)}
            onpointercancel={(ev) => cancelThresholdDrag(ev)}
            onkeydown={(ev) => nudgeThreshold(ev, rule, side)}
          >
            <rect class="threshold-hit" x={tick - 12} y="0" width="24" height={BAND_H} rx="4" />
            <rect class="threshold-focus" x={tick - 5} y="4" width="10" height="24" rx="5" />
            <rect class="threshold-tick" x={tick - 1.5} y="5" width="3" height="22" rx="1.5" />
          </g>
        {/if}
      {/snippet}

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

              <!-- Low / high threshold handles -->
              {@render thresholdHandle('low')}
              {@render thresholdHandle('high')}

              <!-- Live value marker (non-interactive so it can't intercept handle drags) -->
              {#if geom.liveX != null}
                <g class="live-marker">
                  <circle cx={geom.liveX} cy="16" r="6" fill={geom.liveColor} />
                  <circle cx={geom.liveX} cy="16" r="3" fill="var(--bg)" />
                </g>
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

        {#if rule.buzzerEntity || rule.alarmTestEntity}
          {@const buzzer = rule.buzzerEntity}
          {@const test = rule.alarmTestEntity}
          <div class="rule-controls">
            {#if buzzer}
              {@const buzzerOn = states[buzzer.id]?.value === buzzer.payloadOn}
              <button
                type="button"
                class="ctl ctl-toggle"
                class:on={buzzerOn}
                disabled={live.commandPending[buzzer.id]}
                aria-pressed={buzzerOn}
                onclick={() => live.sendCommand(buzzer, !buzzerOn)}
              >
                <span class="ctl-label">Buzzer</span>
                <span class="ctl-state">{buzzerOn ? 'On' : 'Off'}</span>
              </button>
            {/if}
            {#if test}
              <button
                type="button"
                class="ctl ctl-test"
                disabled={live.commandPending[test.id]}
                onclick={() => live.sendCommand(test)}
              >
                Test alarm
              </button>
            {/if}
          </div>

          {#if (buzzer && live.commandErrors[buzzer.id]) || (test && live.commandErrors[test.id])}
            <div class="threshold-errors">
              {#if buzzer && live.commandErrors[buzzer.id]}
                <p class="threshold-error">{live.commandErrors[buzzer.id]}</p>
              {/if}
              {#if test && live.commandErrors[test.id]}
                <p class="threshold-error">{live.commandErrors[test.id]}</p>
              {/if}
            </div>
          {/if}
        {/if}

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

  .live-marker {
    pointer-events: none;
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

  .rule-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .ctl {
    min-height: 34px;
    padding: 4px 12px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--line);
    border-radius: var(--r-control);
    background: var(--panel-2);
    color: var(--muted);
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 600;
  }

  .ctl:disabled {
    cursor: wait;
    opacity: 0.55;
  }

  .ctl-toggle.on {
    border-color: var(--amber);
    background: var(--amber-dim);
    color: var(--amber);
  }

  .ctl-label {
    letter-spacing: 0.04em;
  }

  .ctl-state {
    font-family: var(--font-mono);
  }

  .ctl-test {
    border-color: var(--alert);
    color: var(--alert);
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
