<script lang="ts">
  // Spectral Power Distribution: 0–100% relative power vs wavelength, filled with a
  // spectral rainbow gradient (Pulse-style). Forks the Sparkline SVG technique with a
  // wavelength x-axis + a fixed 0–100 y-domain + a per-wavelength gradient fill.
  import { WAVELENGTHS } from '$lib/spectrum/calibration';

  // The x-axis is the calibration's invariant wavelength grid (index-aligned to `relative`),
  // so it's imported here rather than shipped in every frame's payload.
  let {
    relative,
    saturated = false,
    peaks = []
  }: {
    relative: number[];
    saturated?: boolean;
    peaks?: number[];
  } = $props();

  const WL_MIN = 340;
  const WL_MAX = 850;
  const W = 960;
  const H = 300;
  const L = 46;
  const R = 14;
  const T = 16;
  const B = 34;
  const pw = W - L - R;
  const ph = H - T - B;

  const px = (nm: number) => L + ((nm - WL_MIN) / (WL_MAX - WL_MIN)) * pw;
  const py = (v: number) => T + (1 - v / 105) * ph;

  // Dan Bruton wavelength→RGB approximation, dimmed toward the UV/NIR edges.
  function wl2rgb(w: number): string {
    if (w > 780) return 'rgb(90,0,0)';
    let r = 0;
    let g = 0;
    let b = 0;
    if (w < 380) w = 380;
    if (w < 440) { r = -(w - 440) / 60; b = 1; }
    else if (w < 490) { g = (w - 440) / 50; b = 1; }
    else if (w < 510) { g = 1; b = -(w - 510) / 20; }
    else if (w < 580) { r = (w - 510) / 70; g = 1; }
    else if (w < 645) { r = 1; g = -(w - 645) / 65; }
    else { r = 1; }
    let f = 1;
    if (w > 700) f = 0.3 + (0.7 * (780 - w)) / 80;
    else if (w < 420) f = 0.3 + (0.7 * (w - 380)) / 40;
    return `rgb(${Math.round(255 * r * f)},${Math.round(255 * g * f)},${Math.round(255 * b * f)})`;
  }

  const stops = Array.from({ length: (WL_MAX - WL_MIN) / 10 + 1 }, (_, i) => WL_MIN + i * 10);

  const pts = $derived.by(() => {
    const out: Array<[number, number]> = [];
    for (let i = 0; i < WAVELENGTHS.length; i++) {
      const nm = WAVELENGTHS[i];
      if (nm < WL_MIN || nm > WL_MAX) continue;
      out.push([px(nm), py(relative[i] ?? 0)]);
    }
    return out;
  });

  const area = $derived(
    pts.length
      ? `M ${pts[0][0].toFixed(1)},${py(0).toFixed(1)} ` +
          pts.map(([x, y]) => `L ${x.toFixed(1)},${y.toFixed(1)}`).join(' ') +
          ` L ${pts[pts.length - 1][0].toFixed(1)},${py(0).toFixed(1)} Z`
      : ''
  );
  const line = $derived(pts.length ? 'M ' + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L ') : '');
  const xTicks = [400, 450, 500, 550, 600, 650, 700, 750, 800, 850];
  const yTicks = [0, 25, 50, 75, 100];
</script>

<svg class="spd" viewBox="0 0 {W} {H}" role="img" aria-label="Spectral power distribution">
  <defs>
    <linearGradient id="spd-grad" gradientUnits="userSpaceOnUse" x1={px(WL_MIN)} y1="0" x2={px(WL_MAX)} y2="0">
      {#each stops as nm}
        <stop offset="{(((nm - WL_MIN) / (WL_MAX - WL_MIN)) * 100).toFixed(1)}%" stop-color={wl2rgb(nm)} />
      {/each}
    </linearGradient>
  </defs>

  {#each yTicks as v}
    <line class="grid" x1={L} y1={py(v)} x2={L + pw} y2={py(v)} />
    <text class="axis" x={L - 8} y={py(v) + 4} text-anchor="end">{v}</text>
  {/each}
  {#each xTicks as nm}
    <text class="axis" x={px(nm)} y={T + ph + 20} text-anchor="middle">{nm}</text>
  {/each}

  {#if area}
    <path d={area} fill="url(#spd-grad)" opacity="0.9" />
    <path d={line} class="curve" fill="none" />
  {:else}
    <text class="empty" x={W / 2} y={H / 2} text-anchor="middle">waiting for spectrum…</text>
  {/if}

  {#each peaks as nm}
    {#if nm >= WL_MIN && nm <= WL_MAX}
      <line class="peak" x1={px(nm)} y1={T} x2={px(nm)} y2={T + ph} />
      <text class="peak-label" x={px(nm)} y={T - 4} text-anchor="middle">{nm.toFixed(0)}</text>
    {/if}
  {/each}

  <text class="axis-title" x={L + pw / 2} y={H - 4} text-anchor="middle">Wavelength (nm)</text>
  {#if saturated}
    <text class="saturated" x={L + pw - 4} y={T + 14} text-anchor="end">SATURATED</text>
  {/if}
</svg>

<style>
  .spd {
    width: 100%;
    height: auto;
    display: block;
    font-family: var(--font-mono, monospace);
  }
  .grid {
    stroke: var(--line);
    stroke-width: 1;
  }
  .axis {
    font-size: 12px;
    fill: var(--faint);
  }
  .axis-title {
    font-size: 12px;
    fill: var(--muted);
  }
  .curve {
    stroke: var(--text);
    stroke-width: 1.4;
    stroke-linejoin: round;
  }
  .peak {
    stroke: var(--muted);
    stroke-width: 1;
    stroke-dasharray: 3 3;
    opacity: 0.6;
  }
  .peak-label {
    font-size: 11px;
    fill: var(--muted);
  }
  .empty {
    font-size: 14px;
    fill: var(--faint);
  }
  .saturated {
    font-size: 11px;
    font-weight: 600;
    fill: var(--red, #d33);
    letter-spacing: 0.08em;
  }
</style>
