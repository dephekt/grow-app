<script lang="ts">
  let {
    points = [],
    color = 'var(--amber)',
    width = 160,
    height = 40,
    fill = true
  } = $props<{
    points?: number[];
    color?: string;
    width?: number;
    height?: number;
    fill?: boolean;
  }>();

  const PAD = 0.05;

  let coords = $derived.by(() => {
    if (points.length === 0) return { line: '', poly: '' };
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
    return { line: pts, poly: polyPts };
  });
</script>

{#if points.length === 0}
  <svg viewBox="0 0 {width} {height}" width="100%" height={height}></svg>
{:else if points.length === 1}
  <svg viewBox="0 0 {width} {height}" width="100%" height={height}>
    <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke={color} stroke-width="1.5" />
  </svg>
{:else}
  <svg viewBox="0 0 {width} {height}" width="100%" height={height}>
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
  </svg>
{/if}
