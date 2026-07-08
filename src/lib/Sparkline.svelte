<script lang="ts">
  let {
    points = [],
    color = 'var(--amber)',
    width = 160,
    height = 40,
    fill = true,
    pulse = false,
    surface = 'var(--panel-2)'
  } = $props<{
    points?: number[];
    color?: string;
    width?: number;
    height?: number;
    fill?: boolean;
    /** Mark the newest sample with an end-dot and fire an expanding ping each
        time a new reading lands — a flat (stable) line still visibly beats.
        The ping re-fires when the points ARRAY IDENTITY changes: reassign the
        array per reading (points = [...points, v]); an in-place push() updates
        the drawn line but never re-fires the ping. */
    pulse?: boolean;
    /** Chart surface color for the end-dot's 2px separation ring. Defaults to
        the app panel background; override when the chart sits elsewhere. */
    surface?: string;
  }>();

  const PAD = 0.05;

  let coords = $derived.by(() => {
    // The empty-points end is never rendered (that branch draws nothing);
    // returning a harmless point keeps end non-null for the call sites.
    if (points.length === 0) return { line: '', poly: '', end: { x: width, y: height / 2 } };
    const n = points.length;
    const minV = Math.min(...points);
    const maxV = Math.max(...points);
    const range = maxV - minV || 1;
    const padV = range * PAD;
    const lo = minV - padV;
    const hi = maxV + padV;
    const span = hi - lo || 1;

    // n === 1 pins the sole point to the right edge so the end-dot keeps its
    // "newest sample" position, matching toX(n - 1) === width for n > 1.
    const toX = (i: number) => (n === 1 ? width : (i / (n - 1)) * width);
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
    {#if fill}
      <rect x="0" y={height / 2} {width} height={height / 2} fill={color} fill-opacity="0.12" stroke="none" />
    {/if}
    <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke={color} stroke-width="1.5" />
    {#if pulse}
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
    {#if pulse}
      {@render endDot(coords.end)}
    {/if}
  </svg>
{/if}

{#snippet endDot(end: { x: number; y: number })}
  <!-- Re-mounting on the points array identity restarts the CSS ping animation,
       so it fires exactly once per arriving reading. This must stay a CSS
       animation: a SMIL <animate> inserted into an already-running <svg>
       resolves its implicit begin="0s" against the svg's timeline origin, lands
       entirely in the past, and freezes at the invisible end state. -->
  {#key points}
    <circle class="ping" cx={end.x} cy={end.y} r="3.5" fill="none" stroke={color} stroke-width="1.5" />
  {/key}
  <circle cx={end.x} cy={end.y} r="3.5" fill={color} stroke={surface} stroke-width="2" />
{/snippet}

<style>
  /* The end-dot sits on the right edge and the ping expands past the viewBox. */
  .spark {
    overflow: visible;
  }

  .ping {
    transform-box: fill-box;
    transform-origin: center;
    animation: ping-out 0.6s ease-out forwards;
  }

  /* r 3.5 -> 10, expressed as a scale so it animates in every engine (the
     r property itself isn't CSS-animatable everywhere). */
  @keyframes ping-out {
    from {
      transform: scale(1);
      stroke-opacity: 0.9;
    }
    to {
      transform: scale(2.86);
      stroke-opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ping {
      display: none;
    }
  }
</style>
