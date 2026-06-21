export interface FirmwareUpdateState {
  state: string | null;
  installedVersion: string | null;
  latestVersion: string | null;
  title: string | null;
  releaseSummary: string | null;
  releaseUrl: string | null;
  error: string | null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function parseProjectVersion(swVersion: string | undefined): string | null {
  if (!swVersion) return null;
  const match = swVersion.match(/\b(v\d+\.\d+\.\d+|edge-\d{8}T\d{6}Z-[0-9a-f]{7,40})\b/);
  return match?.[1] ?? null;
}

export function parseFirmwareUpdateState(payloadText: string | null | undefined): FirmwareUpdateState {
  if (!payloadText) {
    return emptyUpdateState();
  }

  try {
    const payload = JSON.parse(payloadText) as Record<string, unknown>;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { ...emptyUpdateState(), state: payloadText };

    return {
      state: text(payload.state),
      installedVersion: text(payload.installed_version) ?? text(payload.installedVersion),
      latestVersion: text(payload.latest_version) ?? text(payload.latestVersion),
      title: text(payload.title),
      releaseSummary: text(payload.release_summary) ?? text(payload.summary) ?? text(payload.releaseSummary),
      releaseUrl: text(payload.release_url) ?? text(payload.releaseUrl),
      error: text(payload.error)
    };
  } catch {
    return { ...emptyUpdateState(), state: payloadText };
  }
}

function emptyUpdateState(): FirmwareUpdateState {
  return {
    state: null,
    installedVersion: null,
    latestVersion: null,
    title: null,
    releaseSummary: null,
    releaseUrl: null,
    error: null
  };
}
