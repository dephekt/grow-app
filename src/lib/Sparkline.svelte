<script lang="ts">
  let {
    points = [],
    color = 'var(--amber)',
    width = 160,
    height = 40,
    fill = true,
    pulse = false,
    surface = 'transparent'
  } = $props<{
    points?: number[];
    color?: string;
    width?: number;
    height?: number;
    fill?: boolean;
    /** Mark the newest sample with an end-dot and fire an expanding ping each
        time a new reading lands — a flat (stable) line still visibly beats. */
    pulse?: boolean;
    /** Chart surface color for the end-dot's 2px separation ring. */
    surface?: string;
  }>();

  const PAD = 0.05;

  let coords = $derived.by(() => {
    if (points.length === 0) return { line: '', poly: '', end: null as { x: number; y: number } | null };
    const n = points.length;
    const minV = Math.min(...points);
    const maxV = Math.max(...points);
    const range = maxV - minV || 1;
    const padV = range * PAD;
    const lo = minV - padV;
    const hi = maxV + padV;
    const span = hi - lo || 1;

    const toX = (i: number) => (n === 1 ? width / 2 : (i / (n - 1)) * width);
    const toY = (v: number) => height - ((v - lo) / span) * height;

    const pts = points.map((v: number, i: number) => `${toX(i).toFixed(2)},${toY(v).toFixed(2)}`).join(' ');
    const polyPts = `0,${height} ${pts} ${width},${height}`;
    return { line: pts, poly: polyPts, end: { x: toX(n - 1), y: toY(points[n - 1]) } };
  });
</script>

{#if points.length === 0}
  <svg viewBox="0 0 {width} {height}" width="100%" height={height}></svg>
{:else if points.length === 1}
  <svg class="spark" viewBox="0 0 {width} {height}" width="100%" height={height}>
    <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke={color} stroke-width="1.5" />
    {#if pulse && coords.end}
      {@render endDot(coords.end)}
    {/if}
  </svg>
{:else}
  <svg class="spark" viewBox="0 0 {width} {height}" width="100%" height={height}>
    {#if fill}
      <polygon points={coords.poly} fill={color} fill-opacity="0.12" stroke="none" />
    {/if}
    <polyline
      points={coords.line}
      fill="none"
      stroke={color}
      stroke-width="1.5"
      stroke-linejoin="round"
      stroke-linecap="round"
    />
    {#if pulse && coords.end}
      {@render endDot(coords.end)}
    {/if}
  </svg>
{/if}

{#snippet endDot(end: { x: number; y: number })}
  <!-- Re-mounting on the points array identity restarts the SMIL ping, so it
       fires exactly once per arriving reading. -->
  {#key points}
    <circle class="ping" cx={end.x} cy={end.y} r="3.5" fill="none" stroke={color} stroke-width="1.5">
      <animate attributeName="r" from="3.5" to="10" dur="0.6s" fill="freeze" />
      <animate attributeName="stroke-opacity" from="0.9" to="0" dur="0.6s" fill="freeze" />
    </circle>
  {/key}
  <circle cx={end.x} cy={end.y} r="3.5" fill={color} stroke={surface} stroke-width="2" />
{/snippet}

<style>
  /* The end-dot sits on the right edge and the ping expands past the viewBox. */
  .spark {
    overflow: visible;
  }

  @media (prefers-reduced-motion: reduce) {
    .ping {
      display: none;
    }
  }
</style>
