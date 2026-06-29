<script lang="ts">
  import { getLiveSnapshot } from '$lib/live-snapshot-context';
  import { isAmbientTemperature } from '$lib/entity-match';
  import TrendsPanel from '$lib/dashboard/TrendsPanel.svelte';
  import CircuitsPanel from '$lib/dashboard/CircuitsPanel.svelte';
  import ThermalPanel from '$lib/dashboard/ThermalPanel.svelte';
  import ReadoutPanel from '$lib/dashboard/ReadoutPanel.svelte';

  const live = getLiveSnapshot();

  function findEntity(objectId: string, nodeId?: string) {
    return live.snapshot.entities.find(
      (e) => e.objectId === objectId && (nodeId == null || e.nodeId === nodeId)
    );
  }

  // The ambient (non-water) temperature sensor feeds both the CLIMATE TEMP row and
  // the panel's device subtitle — resolve it once. Shares the recogniser with the
  // trend-series air_temp line.
  let ambientTempEntity = $derived(live.snapshot.entities.find(isAmbientTemperature));

  let waterRows = $derived.by(() => {
    const rows: Array<{ label: string; value: string; status?: 'ok' | 'warn' | 'alert' | 'none' }> =
      [];
    const tempE = findEntity('water_temperature');
    if (tempE) rows.push({ label: 'TEMP', value: live.formatState(tempE), status: 'ok' });
    const phE = findEntity('water_ph');
    if (phE) rows.push({ label: 'PH', value: live.formatState(phE), status: 'ok' });
    return rows;
  });

  let climateRows = $derived.by(() => {
    const rows: Array<{ label: string; value: string; status?: 'ok' | 'warn' | 'alert' | 'none' }> =
      [];
    if (ambientTempEntity) rows.push({ label: 'TEMP', value: live.formatState(ambientTempEntity), status: 'ok' });
    return rows;
  });

  const substrateRows: Array<{
    label: string;
    value: string;
    status?: 'ok' | 'warn' | 'alert' | 'none';
  }> = [
    { label: 'VWC', value: '—', status: 'none' },
    { label: 'pwEC', value: '—', status: 'none' },
    { label: 'BULK EC', value: '—', status: 'none' },
    { label: 'TEMP', value: '—', status: 'none' }
  ];

  let waterDeviceId = $derived.by(() => {
    const phE = findEntity('water_ph');
    const tempE = findEntity('water_temperature');
    return phE?.nodeId ?? tempE?.nodeId ?? undefined;
  });

  let climateDeviceId = $derived(ambientTempEntity?.nodeId ?? undefined);
</script>

<svelte:head>
  <title>grow-app · {live.snapshot.site}</title>
</svelte:head>

<div class="dashboard">
  <div class="trends-area">
    <TrendsPanel />
  </div>

  <div class="right-col">
    <CircuitsPanel {live} />
    <ThermalPanel {live} />
  </div>

  <div class="water-area">
    <ReadoutPanel title="WATER" rows={waterRows} deviceId={waterDeviceId} />
  </div>

  <div class="climate-area">
    <ReadoutPanel title="CLIMATE" rows={climateRows} deviceId={climateDeviceId} />
  </div>

  <div class="substrate-area">
    <ReadoutPanel title="SUBSTRATE" rows={substrateRows} planned={true} badge="NOT CONNECTED" />
  </div>
</div>

<style>
  .dashboard {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: var(--gap);
  }

  .trends-area {
    grid-column: span 8;
  }

  .right-col {
    grid-column: span 4;
    display: grid;
    gap: var(--gap);
    align-content: start;
  }

  .water-area {
    grid-column: span 4;
  }

  .climate-area {
    grid-column: span 4;
  }

  .substrate-area {
    grid-column: span 4;
  }

  @media (max-width: 960px) {
    .trends-area {
      grid-column: span 12;
    }

    .right-col {
      grid-column: span 12;
      grid-template-columns: 1fr 1fr;
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
    .right-col,
    .water-area,
    .climate-area,
    .substrate-area {
      grid-column: span 1;
    }

    .right-col {
      grid-template-columns: 1fr;
    }
  }
</style>
