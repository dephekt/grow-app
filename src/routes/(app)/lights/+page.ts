import type { LiveSpectrum } from '$lib/server/mqtt/types';
import type { CaptureSummary } from '$lib/server/spectrum/captures';
import type { SpectroConfig } from '$lib/spectrum/calibration';

type Anchors = SpectroConfig['anchors'];

// Lights + spectrum share one page. Live values arrive via the shared SSE snapshot (lights,
// entities, spectrum event); this loader just seeds the retained spectrum frame (the service
// consumes it before any browser subscribes), the saved-capture list, and the active PPFD anchors.
// Degrades to empty on failure so the page still renders live controls.
export const load = async ({ fetch }) => {
  let initialSpectrum: LiveSpectrum | null = null;
  let captures: CaptureSummary[] = [];
  let anchors: Anchors = {};
  try {
    const [liveRes, listRes, anchorRes] = await Promise.all([
      fetch('/api/spectrum/live'),
      fetch('/api/spectrum'),
      fetch('/api/spectrum/anchor')
    ]);
    initialSpectrum = liveRes.ok ? ((await liveRes.json()) as LiveSpectrum | null) : null;
    captures = listRes.ok ? ((await listRes.json()) as { captures: CaptureSummary[] }).captures : [];
    anchors = anchorRes.ok ? ((await anchorRes.json()) as { anchors: Anchors }).anchors : {};
  } catch {
    /* offline — render live controls with placeholders */
  }
  return { initialSpectrum, captures, anchors };
};
