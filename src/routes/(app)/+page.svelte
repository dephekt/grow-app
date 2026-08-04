<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Daniel Snider -->

<script lang="ts">
  import { getLiveSnapshot } from '$lib/live-snapshot-context';
  import {
    findQuantumPpfdEntity,
    hasUnreadableState,
    liveQuantumPpfd,
    resolveAirQualityDevice,
    resolveClimateDevice,
    resolveWaterDevice
  } from '$lib/entity-match';
  import { formatEntityState } from '$lib/state-format';
  import { presentedNumericMetrics } from '$lib/device-presentation';
  import type { DeviceSnapshot } from '$lib/server/mqtt/types';
  import TrendsPanel from '$lib/dashboard/TrendsPanel.svelte';
  import ThermalPanel from '$lib/dashboard/ThermalPanel.svelte';
  import ReadoutPanel from '$lib/dashboard/ReadoutPanel.svelte';
  import SubstratePanel from '$lib/dashboard/SubstratePanel.svelte';

  let { data } = $props();
  const live = getLiveSnapshot();

  type Row = { label: string; value: string; status?: 'ok' | 'warn' | 'alert' | 'none' };

  // These resolvers are shared with the trend charts so readout and trends always
  // agree on the device.
  let waterDevice = $derived(resolveWaterDevice(live.snapshot));
  let climateDevice = $derived(resolveClimateDevice(live.snapshot));

  function metricRows(device: DeviceSnapshot | undefined, stripPrefix = ''): Row[] {
    if (!device) return [];
    return presentedNumericMetrics(live.snapshot, device, stripPrefix)
      .filter((m) => !hasUnreadableState(live.snapshot, m.entity))
      .map((m) => ({
        label: m.label,
        value: live.formatState(m.entity),
        status: 'ok'
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
    return { label: 'PAR', value: formatEntityState(display, { value: String(ppfd), updatedAt: null }), status: 'ok' };
  });

  let climateRows = $derived([...metricRows(climateDevice), ...(parRow ? [parRow] : [])]);

  // Resolved by its air-quality metrics so it gets its own card even though it also reports CO₂.
  let airQualityDevice = $derived(resolveAirQualityDevice(live.snapshot));
  let airQualityRows = $derived(metricRows(airQualityDevice));

</script>

<svelte:head>
  <title>grow-app · {live.snapshot.site}</title>
</svelte:head>

<div class="dashboard">
  <div class="trends-area"><TrendsPanel /></div>
  <div class="thermal-area"><ThermalPanel {live} /></div>
  <div class="water-area"><ReadoutPanel title="WATER" rows={waterRows} deviceId={waterDevice?.nodeId} /></div>
  <div class="climate-area"><ReadoutPanel title="CLIMATE" rows={climateRows} deviceId={climateDevice?.nodeId} /></div>
  <div class="substrate-area">
    <SubstratePanel snapshot={live.snapshot} zones={data.zones} />
  </div>
  {#if airQualityDevice}
    <div class="air-quality-area"><ReadoutPanel title="AIR QUALITY" rows={airQualityRows} deviceId={airQualityDevice.nodeId} /></div>
  {/if}
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
  .air-quality-area,
  .substrate-area {
    grid-column: span 4;
  }

  @media (max-width: 960px) {
    .trends-area,
    .thermal-area {
      grid-column: span 12;
    }
    .water-area,
    .climate-area,
    .air-quality-area,
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
    .air-quality-area,
    .substrate-area {
      grid-column: span 1;
    }
  }
</style>
