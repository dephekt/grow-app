import { createHash } from 'node:crypto';
import type { FirmwareChannel, FirmwareDeviceConfig } from '$lib/server/mqtt/types';

export interface CodebergPackage {
  name: string;
  version: string;
  type: string;
  createdAt: string | null;
}

export interface FirmwarePackageManifest {
  schema: 'grow-firmware-package.v1';
  channel: FirmwareChannel;
  device: string;
  node_id: string;
  project_name: string;
  package_owner: string;
  package: string;
  version: string;
  source_sha: string;
  chip_family: string;
  generated_at?: string;
  artifact_filenames: string[];
  md5: Record<string, string>;
  sha256: Record<string, string>;
  release_summary?: string;
  release_url?: string;
  changelog?: unknown;
}

export interface ResolvedFirmwarePackage {
  listing: CodebergPackage;
  manifest: FirmwarePackageManifest;
}

export interface EspHomeUpdateManifest {
  name: string;
  version: string;
  builds: Array<{
    chipFamily: string;
    ota: {
      path: string;
      md5: string;
      summary?: string;
      release_url?: string;
    };
  }>;
}

const DEFAULT_CODEBERG_BASE_URL = 'https://codeberg.org';
const PACKAGE_LIST_PAGE_SIZE = 50;
const STABLE_VERSION_RE = /^v(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)$/;
const EDGE_VERSION_RE = /^edge-(?<created>\d{8}T\d{6}Z)-(?<sha>[0-9a-f]{7,40})$/;

type Fetch = typeof fetch;

function stableVersionKey(version: string): [number, number, number] | null {
  const match = STABLE_VERSION_RE.exec(version);
  if (!match?.groups) return null;
  return [Number(match.groups.major), Number(match.groups.minor), Number(match.groups.patch)];
}

function compareStableDescending(a: CodebergPackage, b: CodebergPackage): number {
  const aKey = stableVersionKey(a.version);
  const bKey = stableVersionKey(b.version);
  if (!aKey || !bKey) return 0;
  return bKey[0] - aKey[0] || bKey[1] - aKey[1] || bKey[2] - aKey[2];
}

function edgeTimestamp(version: string): string | null {
  return EDGE_VERSION_RE.exec(version)?.groups?.created ?? null;
}

function compareEdgeDescending(a: CodebergPackage, b: CodebergPackage): number {
  const aCreated = Date.parse(a.createdAt ?? '') || parseEdgeFallback(a.version);
  const bCreated = Date.parse(b.createdAt ?? '') || parseEdgeFallback(b.version);
  return bCreated - aCreated || b.version.localeCompare(a.version);
}

function parseEdgeFallback(version: string): number {
  const stamp = edgeTimestamp(version);
  if (!stamp) return 0;
  const iso = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}Z`;
  return Date.parse(iso) || 0;
}

function packageApiBase(baseUrl = DEFAULT_CODEBERG_BASE_URL): string {
  return baseUrl.replace(/\/+$/, '');
}

export function packageDownloadUrl(
  owner: string,
  packageName: string,
  version: string,
  filename: string,
  baseUrl = DEFAULT_CODEBERG_BASE_URL
): string {
  const root = packageApiBase(baseUrl);
  return `${root}/api/packages/${encodeURIComponent(owner)}/generic/${encodeURIComponent(packageName)}/${encodeURIComponent(version)}/${encodeURIComponent(filename)}`;
}

export async function listCodebergPackages(
  owner: string,
  packageName: string,
  fetchImpl: Fetch = fetch,
  baseUrl = DEFAULT_CODEBERG_BASE_URL
): Promise<CodebergPackage[]> {
  const root = packageApiBase(baseUrl);
  const packages: CodebergPackage[] = [];
  let page = 1;

  while (true) {
    const params = new URLSearchParams({
      type: 'generic',
      q: packageName,
      page: String(page),
      limit: String(PACKAGE_LIST_PAGE_SIZE)
    });
    const response = await fetchImpl(`${root}/api/v1/packages/${encodeURIComponent(owner)}?${params.toString()}`);
    if (!response.ok) throw new Error(`Package list failed: ${response.status}`);
    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) throw new Error('Package list response was not an array');

    packages.push(
      ...payload
        .map((item) => parseCodebergPackage(item))
        .filter((item): item is CodebergPackage => Boolean(item))
        .filter((item) => item.name === packageName && item.type === 'generic')
    );

    const linkHeader = response.headers.get('link');
    if (linkHeader) {
      if (!hasNextPage(linkHeader)) break;
    } else if (payload.length < PACKAGE_LIST_PAGE_SIZE) {
      break;
    }
    page += 1;
  }

  return packages;
}

export function selectPackageVersion(packages: CodebergPackage[], channel: FirmwareChannel): CodebergPackage | null {
  if (channel === 'stable') {
    return packages.filter((item) => stableVersionKey(item.version)).sort(compareStableDescending)[0] ?? null;
  }
  return packages.filter((item) => EDGE_VERSION_RE.test(item.version)).sort(compareEdgeDescending)[0] ?? null;
}

export async function downloadPackageManifest(
  device: FirmwareDeviceConfig,
  version: string,
  fetchImpl: Fetch = fetch,
  baseUrl = DEFAULT_CODEBERG_BASE_URL
): Promise<FirmwarePackageManifest> {
  const url = packageDownloadUrl(device.packageOwner, device.package, version, `${device.device}.manifest.json`, baseUrl);
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Package manifest download failed: ${response.status}`);
  return parsePackageManifest(await response.json());
}

export async function resolveFirmwarePackage(
  device: FirmwareDeviceConfig,
  channel: FirmwareChannel,
  fetchImpl: Fetch = fetch,
  baseUrl = DEFAULT_CODEBERG_BASE_URL
): Promise<ResolvedFirmwarePackage | null> {
  const packages = await listCodebergPackages(device.packageOwner, device.package, fetchImpl, baseUrl);
  const listing = selectPackageVersion(packages, channel);
  if (!listing) return null;

  const manifest = await downloadPackageManifest(device, listing.version, fetchImpl, baseUrl);
  assertPackageManifestMatchesDevice(manifest, device, channel);
  return { listing, manifest };
}

export function toEspHomeManifest(manifest: FirmwarePackageManifest, nodeId: string): EspHomeUpdateManifest {
  const otaFilename = otaArtifactFilename(manifest);
  return {
    name: manifest.project_name,
    version: manifest.version,
    builds: [
      {
        chipFamily: manifest.chip_family,
        ota: {
          path: `/api/firmware/devices/${encodeURIComponent(nodeId)}/binary/${encodeURIComponent(otaFilename)}?version=${encodeURIComponent(manifest.version)}`,
          md5: manifest.md5[otaFilename],
          summary: manifest.release_summary,
          release_url: manifest.release_url
        }
      }
    ]
  };
}

export async function downloadAndValidateBinary(
  manifest: FirmwarePackageManifest,
  filename: string,
  fetchImpl: Fetch = fetch,
  baseUrl = DEFAULT_CODEBERG_BASE_URL
): Promise<Uint8Array> {
  if (!manifest.artifact_filenames.includes(filename)) throw new Error('Artifact is not in the package manifest');
  const url = packageDownloadUrl(manifest.package_owner, manifest.package, manifest.version, filename, baseUrl);
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Package binary download failed: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  validateBinaryChecksums(manifest, filename, bytes);
  return bytes;
}

export function validateBinaryChecksums(manifest: FirmwarePackageManifest, filename: string, bytes: Uint8Array): void {
  const expectedSha256 = manifest.sha256[filename];
  const expectedMd5 = manifest.md5[filename];
  if (!expectedSha256 || !expectedMd5) throw new Error('Artifact checksums are missing from the package manifest');

  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== expectedSha256) throw new Error('Artifact SHA256 mismatch');
  const md5 = createHash('md5').update(bytes).digest('hex');
  if (md5 !== expectedMd5) throw new Error('Artifact MD5 mismatch');
}

function parseCodebergPackage(item: unknown): CodebergPackage | null {
  if (!item || typeof item !== 'object') return null;
  const payload = item as Record<string, unknown>;
  if (typeof payload.name !== 'string' || typeof payload.version !== 'string' || typeof payload.type !== 'string') return null;
  return {
    name: payload.name,
    version: payload.version,
    type: payload.type,
    createdAt: typeof payload.created_at === 'string' ? payload.created_at : null
  };
}

function hasNextPage(linkHeader: string): boolean {
  return linkHeader
    .split(',')
    .map((entry) => entry.trim())
    .some((entry) => /;\s*rel="next"/.test(entry));
}

export function parsePackageManifest(payload: unknown): FirmwarePackageManifest {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Package manifest must be an object');
  const manifest = payload as Record<string, unknown>;
  const parsed = {
    schema: manifest.schema,
    channel: manifest.channel,
    device: manifest.device,
    node_id: manifest.node_id,
    project_name: manifest.project_name,
    package_owner: manifest.package_owner,
    package: manifest.package,
    version: manifest.version,
    source_sha: manifest.source_sha,
    chip_family: manifest.chip_family,
    generated_at: manifest.generated_at,
    artifact_filenames: manifest.artifact_filenames,
    md5: manifest.md5,
    sha256: manifest.sha256,
    release_summary: manifest.release_summary,
    release_url: manifest.release_url,
    changelog: manifest.changelog
  };

  if (parsed.schema !== 'grow-firmware-package.v1') throw new Error('Unsupported package manifest schema');
  if (parsed.channel !== 'stable' && parsed.channel !== 'edge') throw new Error('Unsupported package manifest channel');
  for (const key of ['device', 'node_id', 'project_name', 'package_owner', 'package', 'version', 'source_sha', 'chip_family'] as const) {
    if (typeof parsed[key] !== 'string' || parsed[key].length === 0) throw new Error(`Package manifest missing ${key}`);
  }
  if (!Array.isArray(parsed.artifact_filenames) || !parsed.artifact_filenames.every((value) => typeof value === 'string')) {
    throw new Error('Package manifest artifact_filenames must be a string array');
  }
  if (!isStringRecord(parsed.md5) || !isStringRecord(parsed.sha256)) throw new Error('Package manifest checksums must be string maps');

  return parsed as FirmwarePackageManifest;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every((entry) => typeof entry === 'string');
}

export function assertPackageManifestMatchesDevice(
  manifest: FirmwarePackageManifest,
  device: FirmwareDeviceConfig,
  channel?: FirmwareChannel
): void {
  if (channel && manifest.channel !== channel) throw new Error('Package manifest channel does not match selected channel');
  if (manifest.node_id !== device.nodeId) throw new Error('Package manifest node id does not match device metadata');
  if (manifest.project_name !== device.projectName) throw new Error('Package manifest project name does not match device metadata');
  if (manifest.package_owner !== device.packageOwner || manifest.package !== device.package) {
    throw new Error('Package manifest package identity does not match device metadata');
  }
  if (manifest.device !== device.device) throw new Error('Package manifest device does not match device metadata');
  if (manifest.chip_family !== device.chipFamily) throw new Error('Package manifest chip family does not match device metadata');
}

function otaArtifactFilename(manifest: FirmwarePackageManifest): string {
  const filename = manifest.artifact_filenames.find((artifact) => artifact.endsWith('.ota.bin'));
  if (!filename) throw new Error('Package manifest does not contain an OTA artifact');
  if (!manifest.md5[filename]) throw new Error('Package manifest OTA artifact is missing an MD5 checksum');
  return filename;
}
