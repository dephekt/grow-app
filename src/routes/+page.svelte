<script lang="ts">
  import { getLiveSnapshot } from '$lib/live-snapshot-context';
  import { isNumericSensor, resolveClimateDevice, resolveWaterDevice } from '$lib/entity-match';
  import { dashboardPresentation } from '$lib/device-presentation';
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
    return dashboardPresentation(live.snapshot, device)
      .metrics.filter((m) => isNumericSensor(m.entity))
      .map((m) => {
        const label = stripPrefix && m.label.startsWith(stripPrefix) ? m.label.slice(stripPrefix.length) : m.label;
        return { label, value: live.formatState(m.entity), status: 'ok' };
      });
  }

  let waterRows = $derived(metricRows(waterDevice, 'Water '));
  let climateRows = $derived(metricRows(climateDevice));

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

  @media (max-width: 960px) {
    .trends-area,
    .thermal-area {
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
    .substrate-area {
      grid-column: span 1;
    }
  }
</style>
