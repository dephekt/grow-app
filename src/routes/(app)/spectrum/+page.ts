import type { LiveSpectrum } from '$lib/server/mqtt/types';
import type { CaptureSummary } from '$lib/server/spectrum/captures';

// Live updates arrive via the shared SSE snapshot (spectrum event); this fetch just
// seeds the current retained frame (the service consumes it before any browser
// subscribes) + the saved-capture list. Degrades to empty on failure.
export const load = async ({ fetch }) => {
  let initialSpectrum: LiveSpectrum | null = null;
  let captures: CaptureSummary[] = [];
  try {
    const [liveRes, listRes] = await Promise.all([fetch('/api/spectrum/live'), fetch('/api/spectrum')]);
    initialSpectrum = liveRes.ok ? ((await liveRes.json()) as LiveSpectrum | null) : null;
    captures = listRes.ok ? ((await listRes.json()) as { captures: CaptureSummary[] }).captures : [];
  } catch {
    /* offline — render placeholders */
  }
  return { initialSpectrum, captures };
};
