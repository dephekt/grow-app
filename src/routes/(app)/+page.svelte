<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Daniel Snider -->

<script lang="ts">
  import { getLiveSnapshot } from '$lib/live-snapshot-context';
  import {
    findQuantumPpfdEntity,
    hasLiveReading,
    liveQuantumPpfd,
    resolveAirQualityDevice,
    resolveClimateDevice,
    resolveWaterDevice
  } from '$lib/entity-match';
  import { presentedNumericMetrics } from '$lib/device-presentation';
  import type { DeviceSnapshot } from '$lib/server/mqtt/types';
  import TrendsPanel from '$lib/dashboard/TrendsPanel.svelte';
  import ThermalPanel from '$lib/dashboard/ThermalPanel.svelte';
  import ReadoutPanel from '$lib/dashboard/ReadoutPanel.svelte';

  const live = getLiveSnapshot();

  type Row = { label: string; value: string; status?: 'ok' | 'warn' | 'alert' | 'none' };

  // The hydro controller (pH, else the water-temp probe) feeds WATER; the air rig
  // (CO₂, else humidity, else a bare ambient temp) feeds CLIMATE. The resolvers are
  // shared with the trend charts (`$lib/entity-match`) so readout and trends always
  // agree on the device. Readout rows come straight from each device's firmware-
  // declared dashboard metrics (role:metric in its overview group) — no hardcoded ids.
  let waterDevice = $derived(resolveWaterDevice(live.snapshot));
  let climateDevice = $derived(resolveClimateDevice(live.snapshot));

  function metricRows(device: DeviceSnapshot | undefined, stripPrefix = ''): Row[] {
    if (!device) return [];
    return presentedNumericMetrics(live.snapshot, device, stripPrefix)
      .filter((m) => hasLiveReading(live.snapshot, m.entity))
      .map((m) => ({
        label: m.label,
        value: live.formatState(m.entity),
        status: 'ok'
      }));
  }

  let waterRows = $derived(metricRows(waterDevice, 'Water '));

  // Canopy PAR from the Apogee SQ-521. It lives on its own publisher node rather than the climate
  // rig, so it cannot arrive through presentedNumericMetrics and is appended here instead.
  // liveQuantumPpfd gates on that publisher's availability (a crashed one leaves a retained scalar)
  // and clamps the dark-offset noise quantum sensors read in darkness.
  //
  // The DLight's illuminance row still arrives with the climate device's own metrics, so the pair
  // is independent by construction: PAR alone, lux alone, both, or — once the filter above drops
  // an unplugged sensor's `nan` — neither.
  let parRow = $derived.by<Row | null>(() => {
    const ppfd = liveQuantumPpfd(live.snapshot);
    if (ppfd === null) return null;
    const entity = findQuantumPpfdEntity(live.snapshot.entities);
    const decimals = entity?.suggestedDisplayPrecision ?? 0;
    return { label: 'PAR', value: `${ppfd.toFixed(decimals)} ${entity?.unit ?? 'µmol'}`, status: 'ok' };
  });

  let climateRows = $derived([...metricRows(climateDevice), ...(parRow ? [parRow] : [])]);

  // The particulate/gas monitor (PM, VOC, NOx) feeds AIR QUALITY. Resolved by its
  // air-quality metrics so it gets its own card even though it also reports CO₂.
  let airQualityDevice = $derived(resolveAirQualityDevice(live.snapshot));
  let airQualityRows = $derived(metricRows(airQualityDevice));

  const substrateRows: Row[] = [
    { label: 'VWC', value: '—', status: 'none' },
    { label: 'pwEC', value: '—', status: 'none' },
    { label: 'BULK EC', value: '—', status: 'none' },
    { label: 'TEMP', value: '—', status: 'none' }
  ];
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
    <ReadoutPanel title="SUBSTRATE" rows={substrateRows} planned={true} badge="NOT CONNECTED" />
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
