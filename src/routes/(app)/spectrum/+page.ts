import type { LiveSpectrum } from '$lib/server/mqtt/types';
import type { CaptureSummary } from '$lib/server/spectrum/captures';
import type { SpectroConfig } from '$lib/spectrum/calibration';

type Anchors = SpectroConfig['anchors'];

// Live updates arrive via the shared SSE snapshot (spectrum event); this fetch just
// seeds the current retained frame (the service consumes it before any browser
// subscribes) + the saved-capture list + the active PPFD anchors. Degrades to empty on failure.
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
    /* offline — render placeholders */
  }
  return { initialSpectrum, captures, anchors };
};
