import { afterEach, describe, expect, it } from 'vitest';
import {
  buildFirmwareChannelConfig,
  parseFirmwareChannelPayload,
  parseFirmwareDevicePayload,
  parseProjectVersion
} from '../../src/lib/server/firmware/metadata';
import { requireFirmwareUpdateToken } from '../../src/lib/server/firmware/access';
import {
  downloadAndValidateBinary,
  listCodebergPackages,
  listOciFirmwarePackages,
  parsePackageManifest,
  resolveFirmwarePackage,
  selectPackageVersion,
  toEspHomeManifest,
  validateBinaryChecksums,
  type CodebergPackage,
  type FirmwarePackageManifest
} from '../../src/lib/server/firmware/packages';
import { parseFirmwareUpdateState } from '../../src/lib/server/firmware/update-state';

const topicPrefix = 'grow/daniel-home';

const manifest = {
  schema: 'grow-firmware-package.v1',
  channel: 'stable',
  build_profile: 'site-private',
  flashable: true,
  device: 'atoms3u-sensor-rig',
  node_id: 'atoms3u-sensor-rig',
  project_name: 'stackdrift.atoms3u-sensor-rig',
  package_owner: 'stackdrift-firmware',
  package: 'atoms3u-sensor-rig',
  version: 'v1.2.3',
  source_sha: '0123456789abcdef',
  chip_family: 'ESP32-S3',
  artifact_filenames: ['atoms3u-sensor-rig.ota.bin', 'atoms3u-sensor-rig.factory.bin'],
  md5: {
    'atoms3u-sensor-rig.ota.bin': '4a3b8aa1363813d51abb788cfd4c294e',
    'atoms3u-sensor-rig.factory.bin': 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
  },
  sha256: {
    'atoms3u-sensor-rig.ota.bin': '7711f755d25874261ba889d6c343474b3952fd5f90d8918833d2e375bf8468c2',
    'atoms3u-sensor-rig.factory.bin': 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
  },
  release_summary: 'Two commits since firmware/atoms3u-sensor-rig/v1.2.2',
  release_url: 'https://github.com/dephekt/grow-fleet/commit/0123456789abcdef'
} satisfies FirmwarePackageManifest;

describe('firmware metadata parsing', () => {
  it('parses retained device firmware metadata', () => {
    expect(
      parseFirmwareDevicePayload(
        `${topicPrefix}/atoms3u-sensor-rig/_firmware/config`,
        JSON.stringify({
          schema: 'grow-firmware-device.v1',
          nodeId: 'atoms3u-sensor-rig',
          projectName: 'stackdrift.atoms3u-sensor-rig',
          packageOwner: 'stackdrift-firmware',
          package: 'atoms3u-sensor-rig',
          device: 'atoms3u-sensor-rig',
          chipFamily: 'ESP32-S3',
          installedVersion: 'v1.2.2',
          manifestUrl: 'http://192.168.8.3:3080/api/firmware/devices/atoms3u-sensor-rig/manifest'
        }),
        topicPrefix
      )?.config
    ).toMatchObject({
      nodeId: 'atoms3u-sensor-rig',
      projectName: 'stackdrift.atoms3u-sensor-rig',
      installedVersion: 'v1.2.2'
    });
  });

  it('parses app-owned retained channel config', () => {
    const config = buildFirmwareChannelConfig('atoms3u-sensor-rig', 'edge', '2026-06-20T18:00:00.000Z');
    expect(parseFirmwareChannelPayload(`${topicPrefix}/_app/firmware/atoms3u-sensor-rig/channel`, JSON.stringify(config), topicPrefix)).toEqual({
      nodeId: 'atoms3u-sensor-rig',
      config
    });
  });

  it('extracts ESPHome project versions from swVersion text', () => {
    expect(parseProjectVersion('v1.2.3 (ESPHome 2026.6.2)')).toBe('v1.2.3');
    expect(parseProjectVersion('edge-20260620T180102Z-012345abcdef')).toBe('edge-20260620T180102Z-012345abcdef');
    expect(parseProjectVersion('Version: 2026.5.3')).toBeNull();
  });
});

describe('firmware package selection and manifests', () => {
  const packages = [
    { name: 'atoms3u-sensor-rig', version: 'v1.2.0', type: 'generic', createdAt: '2026-06-10T00:00:00Z' },
    { name: 'atoms3u-sensor-rig', version: 'v1.10.0', type: 'generic', createdAt: '2026-06-12T00:00:00Z' },
    { name: 'atoms3u-sensor-rig', version: 'v1.2-cache-test', type: 'generic', createdAt: '2026-06-13T00:00:00Z' },
    { name: 'atoms3u-sensor-rig', version: 'edge-20260620T180102Z-aaaaaaaaaaaa', type: 'generic', createdAt: '2026-06-20T18:01:02Z' },
    { name: 'atoms3u-sensor-rig', version: 'edge-20260620T190102Z-bbbbbbbbbbbb', type: 'generic', createdAt: '2026-06-20T19:01:02Z' }
  ] satisfies CodebergPackage[];

  it('selects latest stable semver and newest edge packages', () => {
    expect(selectPackageVersion(packages, 'stable')?.version).toBe('v1.10.0');
    expect(selectPackageVersion(packages, 'edge')?.version).toBe('edge-20260620T190102Z-bbbbbbbbbbbb');
  });

  it('lists package versions across Codeberg pagination', async () => {
    const requests: string[] = [];
    const authHeaders: Array<string | null> = [];
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push(url);
      authHeaders.push(new Headers(init?.headers).get('authorization'));
      const page = new URL(url).searchParams.get('page');
      if (page === '1') {
        return Response.json(
          [
            { name: 'atoms3u-sensor-rig', version: 'v1.0.0', type: 'generic', created_at: '2026-06-10T00:00:00Z' },
            { name: 'other-device', version: 'v9.9.9', type: 'generic', created_at: '2026-06-10T00:00:00Z' }
          ],
          {
            headers: {
              link: '<https://codeberg.org/api/v1/packages/stackdrift?limit=50&page=2&q=atoms3u-sensor-rig&type=generic>; rel="next"'
            }
          }
        );
      }
      return Response.json([{ name: 'atoms3u-sensor-rig', version: 'v1.1.0', type: 'generic', created_at: '2026-06-11T00:00:00Z' }]);
    };

    await expect(
      listCodebergPackages('stackdrift-firmware', 'atoms3u-sensor-rig', fetchImpl as typeof fetch, {
        auth: { authUser: 'stackdrift', token: 'secret', scheme: 'basic' }
      })
    ).resolves.toEqual([
      { name: 'atoms3u-sensor-rig', version: 'v1.0.0', type: 'generic', createdAt: '2026-06-10T00:00:00Z' },
      { name: 'atoms3u-sensor-rig', version: 'v1.1.0', type: 'generic', createdAt: '2026-06-11T00:00:00Z' }
    ]);
    expect(requests.map((url) => new URL(url).searchParams.get('page'))).toEqual(['1', '2']);
    expect(requests.map((url) => new URL(url).searchParams.get('limit'))).toEqual(['50', '50']);
    expect(authHeaders).toEqual(['Basic c3RhY2tkcmlmdDpzZWNyZXQ=', 'Basic c3RhY2tkcmlmdDpzZWNyZXQ=']);
  });

  it('lists OCI firmware tags through a registry auth challenge', async () => {
    const requests: string[] = [];
    const authHeaders: Array<string | null> = [];
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push(url);
      authHeaders.push(new Headers(init?.headers).get('authorization'));
      if (url.includes('/token')) {
        expect(new Headers(init?.headers).get('authorization')).toBe('Basic ZGVwaGVrdDpnZ2dn');
        return Response.json({ token: 'registry-token' });
      }
      if (new Headers(init?.headers).get('authorization') === 'Bearer registry-token') {
        return Response.json({ tags: ['v1.2.3', 'edge-20260620T190102Z-bbbbbbbbbbbb'] });
      }
      return new Response(null, {
        status: 401,
        headers: {
          'www-authenticate':
            'Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="repository:dephekt/grow-fleet-firmware-atoms3u-sensor-rig:pull"'
        }
      });
    };

    await expect(
      listOciFirmwarePackages('atoms3u-sensor-rig', fetchImpl as typeof fetch, {
        provider: 'ghcr-oci',
        baseUrl: 'https://ghcr.io',
        registry: 'ghcr.io',
        owner: 'dephekt',
        packagePrefix: 'grow-fleet-firmware',
        auth: { authUser: 'dephekt', token: 'gggg', scheme: 'basic' }
      })
    ).resolves.toEqual([
      { name: 'atoms3u-sensor-rig', version: 'v1.2.3', type: 'oci', createdAt: null },
      { name: 'atoms3u-sensor-rig', version: 'edge-20260620T190102Z-bbbbbbbbbbbb', type: 'oci', createdAt: null }
    ]);
    expect(requests[0]).toBe('https://ghcr.io/v2/dephekt/grow-fleet-firmware-atoms3u-sensor-rig/tags/list?n=1000');
    expect(authHeaders).toEqual([null, 'Basic ZGVwaGVrdDpnZ2dn', 'Bearer registry-token']);
  });

  it('translates package manifests into ESPHome update manifests', () => {
    expect(toEspHomeManifest(manifest, 'atoms3u-sensor-rig', 'download-token')).toEqual({
      name: 'stackdrift.atoms3u-sensor-rig',
      version: 'v1.2.3',
      builds: [
        {
          chipFamily: 'ESP32-S3',
          ota: {
            path: '/api/firmware/devices/atoms3u-sensor-rig/binary/atoms3u-sensor-rig.ota.bin?version=v1.2.3&token=download-token',
            md5: '4a3b8aa1363813d51abb788cfd4c294e',
            summary: 'Two commits since firmware/atoms3u-sensor-rig/v1.2.2',
            release_url: 'https://github.com/dephekt/grow-fleet/commit/0123456789abcdef'
          }
        }
      ]
    });
  });

  it('validates binary checksums before proxying', async () => {
    const bytes = new TextEncoder().encode('grow firmware\n');
    validateBinaryChecksums(manifest, 'atoms3u-sensor-rig.ota.bin', bytes);

    const fetchImpl = async () =>
      new Response(bytes, {
        status: 200
      });
    await expect(
      downloadAndValidateBinary(manifest, 'atoms3u-sensor-rig.ota.bin', fetchImpl as typeof fetch, {
        baseUrl: 'https://codeberg.org',
        auth: { authUser: 'stackdrift', token: 'secret', scheme: 'basic' }
      })
    ).resolves.toEqual(bytes);

    const bad = new TextEncoder().encode('bad');
    expect(() => validateBinaryChecksums(manifest, 'atoms3u-sensor-rig.ota.bin', bad)).toThrow('SHA256 mismatch');
  });

  it('downloads OCI artifact layers by filename before proxying', async () => {
    const bytes = new TextEncoder().encode('grow firmware\n');
    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/manifests/v1.2.3')) {
        return Response.json({
          layers: [
            {
              digest: 'sha256:manifest',
              annotations: { 'org.opencontainers.image.title': 'atoms3u-sensor-rig.manifest.json' }
            },
            {
              digest: 'sha256:ota',
              annotations: { 'org.opencontainers.image.title': 'atoms3u-sensor-rig.ota.bin' }
            }
          ]
        });
      }
      if (url.endsWith('/blobs/sha256:ota')) {
        return new Response(bytes);
      }
      return new Response(null, { status: 404 });
    };

    await expect(
      downloadAndValidateBinary(manifest, 'atoms3u-sensor-rig.ota.bin', fetchImpl as typeof fetch, {
        provider: 'ghcr-oci',
        baseUrl: 'https://ghcr.io',
        registry: 'ghcr.io',
        owner: 'dephekt',
        packagePrefix: 'grow-fleet-firmware'
      })
    ).resolves.toEqual(bytes);
  });

  it('rejects package manifests without the firmware schema', () => {
    expect(() => parsePackageManifest({ ...manifest, schema: undefined })).toThrow('Unsupported package manifest schema');
  });

  it('rejects package manifests that are not marked flashable', () => {
    expect(() => parsePackageManifest({ ...manifest, flashable: false })).toThrow('Package manifest is not flashable');
  });

  it('uses configured package owner even when retained metadata is stale', async () => {
    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/api/v1/packages/')) {
        expect(url).toContain('/api/v1/packages/stackdrift-firmware?');
        return Response.json([{ name: 'atoms3u-sensor-rig', version: 'v1.2.3', type: 'generic', created_at: '2026-06-10T00:00:00Z' }]);
      }
      expect(url).toContain('/api/packages/stackdrift-firmware/generic/atoms3u-sensor-rig/v1.2.3/');
      return Response.json(manifest);
    };

    await expect(
      resolveFirmwarePackage(
        {
          schema: 'grow-firmware-device.v1',
          nodeId: 'atoms3u-sensor-rig',
          projectName: 'stackdrift.atoms3u-sensor-rig',
          packageOwner: 'stackdrift',
          package: 'atoms3u-sensor-rig',
          device: 'atoms3u-sensor-rig',
          chipFamily: 'ESP32-S3',
          installedVersion: 'v1.2.2',
          manifestUrl: 'http://192.168.8.3:3080/api/firmware/devices/atoms3u-sensor-rig/manifest'
        },
        'stable',
        fetchImpl as typeof fetch,
        {
          baseUrl: 'https://codeberg.org',
          owner: 'stackdrift-firmware'
        }
      )
    ).resolves.toMatchObject({ manifest: { package_owner: 'stackdrift-firmware' } });
  });
});

describe('firmware update proxy access', () => {
  const originalToken = process.env.FIRMWARE_UPDATE_TOKEN;

  afterEach(() => {
    if (originalToken === undefined) delete process.env.FIRMWARE_UPDATE_TOKEN;
    else process.env.FIRMWARE_UPDATE_TOKEN = originalToken;
  });

  it('accepts the shared firmware update token', () => {
    process.env.FIRMWARE_UPDATE_TOKEN = 'download-token';

    expect(requireFirmwareUpdateToken(new URL('http://localhost/manifest?token=download-token'))).toEqual({ token: 'download-token' });
  });

  it('rejects missing or invalid firmware update tokens', async () => {
    process.env.FIRMWARE_UPDATE_TOKEN = 'download-token';

    const response = requireFirmwareUpdateToken(new URL('http://localhost/manifest?token=wrong'));

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(401);
  });
});

describe('ESPHome update state parsing', () => {
  it('parses update JSON payloads and raw fallback states', () => {
    expect(
      parseFirmwareUpdateState(
        JSON.stringify({
          state: 'ON',
          installed_version: 'v1.2.2',
          latest_version: 'v1.2.3',
          release_summary: 'Two commits',
          release_url: 'https://example.invalid/release',
          error: ''
        })
      )
    ).toMatchObject({
      state: 'ON',
      installedVersion: 'v1.2.2',
      latestVersion: 'v1.2.3',
      releaseSummary: 'Two commits',
      releaseUrl: 'https://example.invalid/release',
      error: null
    });

    expect(parseFirmwareUpdateState('OFF')).toMatchObject({ state: 'OFF', latestVersion: null });
  });
});
