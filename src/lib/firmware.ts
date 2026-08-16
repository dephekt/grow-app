// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

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

/**
 * Which version a node is actually running.
 *
 * The update entity wins because its `installed_version` is the device's own
 * compiled-in `ESPHOME_PROJECT_VERSION` -- the same value ESPHome compares
 * against the manifest to decide whether an install does anything at all. The
 * retained `_firmware/config` carries the same string but is published once on
 * MQTT connect with no retry, so a publish lost to a reconnect leaves it stale
 * until the node next reboots. Trusting it over the entity is how a plug that
 * had already taken an OTA kept being offered the update it was running, and
 * kept refusing it: the app compared against the stale copy while the device
 * compared against the truth (dephekt/grow-app#104).
 *
 * `swVersion` comes from MQTT discovery and is the last resort; it is a display
 * string, so it needs parsing rather than reading.
 */
export function resolveInstalledVersion(
  updateState: Pick<FirmwareUpdateState, 'installedVersion'> | null | undefined,
  firmwareConfig: { installedVersion?: string | null } | null | undefined,
  swVersion?: string
): string | null {
  return (
    text(updateState?.installedVersion) ??
    text(firmwareConfig?.installedVersion) ??
    parseProjectVersion(swVersion)
  );
}

export function parseProjectVersion(swVersion: string | undefined): string | null {
  if (!swVersion) return null;
  const match = swVersion.match(/\b(v\d+\.\d+\.\d+|edge-\d{8}T\d{6}Z-[0-9a-f]{7,40})\b/);
  return match?.[1] ?? null;
}

export function parseFirmwareUpdateState(
  payloadText: string | null | undefined
): FirmwareUpdateState {
  if (!payloadText) {
    return emptyUpdateState();
  }

  try {
    const payload = JSON.parse(payloadText) as Record<string, unknown>;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
      return { ...emptyUpdateState(), state: payloadText };

    return {
      state: text(payload.state),
      installedVersion: text(payload.installed_version) ?? text(payload.installedVersion),
      latestVersion: text(payload.latest_version) ?? text(payload.latestVersion),
      title: text(payload.title),
      releaseSummary:
        text(payload.release_summary) ?? text(payload.summary) ?? text(payload.releaseSummary),
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
