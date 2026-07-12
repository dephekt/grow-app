<script lang="ts">
  import type { ProcessedSpectrum } from '$lib/spectrum/calibration';
  import ReadoutPanel from '$lib/dashboard/ReadoutPanel.svelte';

  let {
    processed,
    integrationUs = 0
  }: { processed: ProcessedSpectrum; integrationUs?: number } = $props();

  type Row = { label: string; value: string; status?: 'ok' | 'warn' | 'alert' | 'none' };

  const bandRows = $derived<Row[]>([
    {
      label: 'PEAK',
      value: processed.peakWavelengthNm == null ? '—' : `${processed.peakWavelengthNm.toFixed(0)} nm`,
      status: processed.peakWavelengthNm == null ? 'none' : 'ok'
    },
    { label: 'BLUE', value: `${processed.bands.blue.toFixed(0)} %`, status: 'ok' },
    { label: 'GREEN', value: `${processed.bands.green.toFixed(0)} %`, status: 'ok' },
    { label: 'RED', value: `${processed.bands.red.toFixed(0)} %`, status: 'ok' },
    { label: 'FAR-RED', value: `${processed.bands.farRed.toFixed(0)} %`, status: 'ok' }
  ]);

  // Band shares are expressed in whichever lens the chart is showing.
  const bandTitle = $derived(
    processed.view === 'energy'
      ? 'SPECTRUM · ENERGY SHARE'
      : processed.view === 'raw'
        ? 'SPECTRUM · RAW SHARE'
        : 'SPECTRUM · PHOTON SHARE'
  );

  const fmt = (v: number | null) => (v == null ? '—' : `${v.toFixed(0)}`);
  const fluxRows = $derived<Row[]>([
    { label: 'PPFD', value: fmt(processed.ppfd), status: processed.calibrated ? 'ok' : 'none' },
    { label: 'PAR', value: fmt(processed.par), status: processed.calibrated ? 'ok' : 'none' },
    { label: 'ePAR', value: fmt(processed.epar), status: processed.calibrated ? 'ok' : 'none' }
  ]);
</script>

<div class="tiles">
  <ReadoutPanel title={bandTitle} rows={bandRows} />
  <ReadoutPanel
    title="PHOTON FLUX · µmol/m²/s"
    rows={fluxRows}
    planned={!processed.calibrated}
    badge={processed.calibrated ? undefined : 'UNCALIBRATED'}
  />
  {#if integrationUs > 0}
    <p class="integ mono">exposure {(integrationUs / 1000).toFixed(0)} ms</p>
  {/if}
</div>

<style>
  .tiles {
    display: grid;
    gap: var(--gap);
  }
  .integ {
    margin: 0;
    font-size: 0.62rem;
    letter-spacing: 0.06em;
    color: var(--faint);
    text-align: right;
  }
</style>
