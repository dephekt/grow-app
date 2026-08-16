<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Daniel Snider -->

<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { PageProps } from './$types';
  import { getLiveSnapshot } from '$lib/live-snapshot-context';
  import {
    findQuantumPpfdEntity,
    hasUnreadableState,
    isAirVpd,
    liveQuantumPpfd,
    resolveClimateDevice,
    resolveWaterDevice
  } from '$lib/entity-match';
  import { liveLeafVpd } from '$lib/vpd';
  import type { ClimateBriefState } from '../api/climate/+server';
  import { formatEntityState } from '$lib/state-format';
  import { presentedNumericMetrics } from '$lib/device-presentation';
  import type { DeviceSnapshot, EntityConfig } from '$lib/server/mqtt/types';
  import TrendsPanel from '$lib/dashboard/TrendsPanel.svelte';
  import ThermalPanel from '$lib/dashboard/ThermalPanel.svelte';
  import ReadoutPanel from '$lib/dashboard/ReadoutPanel.svelte';
  import SubstratePanel from '$lib/dashboard/SubstratePanel.svelte';
  import SmartPlugsPanel from '$lib/dashboard/SmartPlugsPanel.svelte';

  let { data }: PageProps = $props();
  const live = getLiveSnapshot();

  type Row = { label: string; value: string; status?: 'ok' | 'warn' | 'alert' | 'none' };
  // Carries the entity so a derived row can be positioned relative to a published one.
  type MetricRow = Row & { entity: EntityConfig };

  // These resolvers are shared with the trend charts so readout and trends always
  // agree on the device.
  let waterDevice = $derived(resolveWaterDevice(live.snapshot));
  let climateDevice = $derived(resolveClimateDevice(live.snapshot));

  function metricRows(device: DeviceSnapshot | undefined, stripPrefix = ''): MetricRow[] {
    if (!device) return [];
    return presentedNumericMetrics(live.snapshot, device, stripPrefix)
      .filter((m) => !hasUnreadableState(live.snapshot, m.entity))
      .map((m) => ({
        label: m.label,
        value: live.formatState(m.entity),
        status: 'ok',
        entity: m.entity
      }));
  }

  let waterRows = $derived(metricRows(waterDevice, 'Water '));

  // Canopy PAR lives on its own publisher node, so it cannot arrive through
  // presentedNumericMetrics and is appended here instead.
  let parRow = $derived.by<Row | null>(() => {
    const ppfd = liveQuantumPpfd(live.snapshot);
    if (ppfd === null) return null;
    const entity = findQuantumPpfdEntity(live.snapshot.entities);
    if (!entity) return null;
    // Formatted through the shared path because it clamps precision before toFixed;
    // the publisher declares none, so PPFD defaults to whole µmol.
    const display = { ...entity, suggestedDisplayPrecision: entity.suggestedDisplayPrecision ?? 0 };
    return {
      label: 'PAR',
      value: formatEntityState(display, { value: String(ppfd), updatedAt: null }),
      status: 'ok'
    };
  });

  // Leaf VPD is derived from the thermal ROI, so it has no entity of its own and cannot
  // arrive through presentedNumericMetrics.
  let leafVpdRow = $derived.by<Row | null>(() => {
    const vpd = liveLeafVpd(live.snapshot);
    if (vpd === null) return null;
    // Formatted through the air VPD entity so both rows keep the same precision and unit.
    const air = live.snapshot.entities.find(isAirVpd);
    const value = air
      ? formatEntityState(
          { ...air, suggestedDisplayPrecision: air.suggestedDisplayPrecision ?? 2 },
          { value: String(vpd), updatedAt: null }
        )
      : `${vpd.toFixed(2)} kPa`;
    return { label: 'Leaf VPD', value, status: 'ok' };
  });

  // From the server, since an override on /climate moves it off the plan.
  let climateTarget = $state<{ airVpdTarget: number; week: number } | null>(
    untrack(() => data.climate)
  );

  // Re-fetched because the dashboard is long-lived and a week rollover would strand it.
  onMount(() => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch('/api/climate?brief=1');
        if (!res.ok) return;
        const body = (await res.json()) as Partial<ClimateBriefState>;
        if (typeof body.band?.target === 'number' && typeof body.week === 'number') {
          climateTarget = { airVpdTarget: body.band.target, week: body.week };
        }
      } catch {
        // Keeps the last good value; the next tick recovers.
      }
    }, 300_000);
    return () => clearInterval(timer);
  });

  let vpdTargetRow = $derived.by<Row | null>(() => {
    if (!climateTarget) return null;
    if (!live.snapshot.entities.some(isAirVpd)) return null;
    return {
      label: 'VPD target',
      value: `${climateTarget.airVpdTarget.toFixed(2)} kPa · wk ${climateTarget.week}`,
      status: 'none'
    };
  });

  let climateRows = $derived.by<Row[]>(() => {
    const metrics = metricRows(climateDevice);
    const rows: Row[] = [...metrics];
    if (leafVpdRow) {
      // Beside the air VPD it is read against, rather than appended after everything else.
      const i = metrics.findIndex((r) => isAirVpd(r.entity));
      rows.splice(i >= 0 ? i + 1 : rows.length, 0, leafVpdRow);
    }
    if (vpdTargetRow) rows.push(vpdTargetRow);
    if (parRow) rows.push(parRow);
    return rows;
  });
</script>

<svelte:head>
  <title>grow-app · {live.snapshot.site}</title>
</svelte:head>

<div class="dashboard">
  <div class="trends-area"><TrendsPanel /></div>
  <div class="thermal-area"><ThermalPanel {live} /></div>
  <div class="water-area">
    <ReadoutPanel title="WATER" rows={waterRows} deviceId={waterDevice?.nodeId} />
  </div>
  <div class="climate-area">
    <ReadoutPanel title="CLIMATE" rows={climateRows} deviceId={climateDevice?.nodeId} />
  </div>
  <div class="substrate-area">
    <SubstratePanel snapshot={live.snapshot} zones={data.zones} probeBindings={data.probes} />
  </div>
  <div class="plugs-area"><SmartPlugsPanel {live} /></div>
</div>

<style>
  .dashboard {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: var(--gap);
    align-items: start;
  }

  .trends-area {
    grid-column: span 8;
  }
  .thermal-area {
    grid-column: span 4;
  }
  .water-area,
  .climate-area,
  .substrate-area {
    grid-column: span 4;
  }
  /* Its own full-width row: the four plugs lay out in columns inside the panel. */
  .plugs-area {
    grid-column: span 12;
  }

  @media (max-width: 960px) {
    .trends-area,
    .thermal-area,
    .plugs-area {
      grid-column: span 12;
    }
    .water-area,
    .climate-area,
    .substrate-area {
      grid-column: span 6;
    }
  }

  @media (max-width: 600px) {
    .dashboard {
      grid-template-columns: 1fr;
    }
    .trends-area,
    .thermal-area,
    .water-area,
    .climate-area,
    .substrate-area,
    .plugs-area {
      grid-column: span 1;
    }
  }
</style>
