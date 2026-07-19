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

  // Two sources, always shown so an estimate is never mistaken for a reference: the lux estimate
  // (≈, ±tolerance, amber) and the Apogee reference (plain). When both exist, the estimate carries
  // its delta vs the reference. PAR/ePAR follow the primary (reference if present, else lux).
  const est = $derived(processed.lux);
  const ref = $derived(processed.reference);
  const anyFlux = $derived(est != null || ref != null);
  const primary = $derived(ref ?? est);
  const deltaPct = $derived(
    est && ref && ref.ppfd > 0 ? ((est.ppfd - ref.ppfd) / ref.ppfd) * 100 : null
  );

  const fmtRef = (v: number | null) => (v == null ? '—' : v.toFixed(0));
  const estValue = $derived(
    est == null
      ? '—'
      : `≈${est.ppfd.toFixed(0)} ±${est.tolerancePct.toFixed(0)}%` +
        (deltaPct == null ? '' : ` (${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%)`)
  );
  const primPrefix = $derived(primary?.source === 'lux' ? '≈' : '');
  const fmtPrim = (v: number | null) => (v == null ? '—' : `${primPrefix}${v.toFixed(0)}`);
  const primStatus = $derived<Row['status']>(
    !anyFlux ? 'none' : primary?.source === 'lux' ? 'warn' : 'ok'
  );

  const fluxRows = $derived<Row[]>([
    { label: 'PPFD (ref)', value: fmtRef(ref?.ppfd ?? null), status: ref ? 'ok' : 'none' },
    { label: 'PPFD (lux)', value: estValue, status: est ? 'warn' : 'none' },
    { label: 'PAR', value: fmtPrim(processed.par), status: primStatus },
    { label: 'ePAR', value: fmtPrim(processed.epar), status: primStatus }
  ]);

  const fluxBadge = $derived(ref ? 'REF' : est ? 'EST · LUX' : 'UNCALIBRATED');
  const fluxTone = $derived<'amber' | 'ok' | 'muted'>(ref ? 'ok' : 'amber');
</script>

<div class="tiles">
  <ReadoutPanel title={bandTitle} rows={bandRows} />
  <ReadoutPanel title="PHOTON FLUX · µmol/m²/s" rows={fluxRows} planned={!anyFlux} badge={fluxBadge} badgeTone={fluxTone} />
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
