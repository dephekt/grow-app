// Sanitize a captured /api/snapshot into a committable typed fixture.
// Usage: node scripts/sanitize-fixture.mjs <raw.json> <out.ts>
import { readFileSync, writeFileSync } from 'node:fs';

const [, , src, out] = process.argv;
const snap = JSON.parse(readFileSync(src, 'utf8'));

// Redact identity diagnostics (wifi SSID/BSSID, MAC, IP address sensors) by objectId.
const identityRe = /(^|_)(ssid|bssid|mac|mac_address|ip_address|ip)($|_)/i;
const byId = new Map(snap.entities.map((e) => [e.id, e]));
for (const [id, state] of Object.entries(snap.states ?? {})) {
  const e = byId.get(id);
  if (e && identityRe.test(e.objectId ?? '') && state && typeof state.value === 'string') {
    state.value = 'redacted';
  }
}

// Strip verbose discovery payloads — the UI never reads entity.raw.
for (const e of snap.entities) e.raw = {};

let json = JSON.stringify(snap, null, 2);
// Private (RFC1918) LAN IPs -> RFC5737 TEST-NET-1 (keep last octet for shape).
json = json
  .replace(/\b10\.\d{1,3}\.\d{1,3}\.(\d{1,3})\b/g, '192.0.2.$1')
  .replace(/\b172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.(\d{1,3})\b/g, '192.0.2.$1')
  .replace(/\b192\.168\.\d{1,3}\.(\d{1,3})\b/g, '192.0.2.$1');
// Known device MACs (no-colon identifiers and colon forms) -> distinct placeholders.
const macMap = {
  '30eda0c8f338': '0123456789ab',
  f024f9e85d04: 'fedcba987654',
  'CA:85:72:9D:F9:DE': '02:00:00:00:00:0a',
  'F0:24:F9:E8:5D:04': '02:00:00:00:00:0b'
};
for (const [k, v] of Object.entries(macMap)) json = json.split(k).join(v);
// Catch any *other* colon-MAC, but never the distinct placeholders just assigned
// (else the two devices' MACs would collapse to one).
json = json.replace(/\b([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}\b/g, (m) =>
  /^02:00:00:00:00:0[ab]$/i.test(m) ? m : '02:00:00:00:00:ff'
);

const header = `import type { Snapshot } from '../../src/lib/server/mqtt/types';

/**
 * Sanitized snapshot captured from the live daniel-home site (~130 entities, the
 * real Atlas hydro kit + AtomS3U rig). Used by the Playwright screenshot spec so
 * the generated screenshots reflect production. Sanitized: LAN IPs -> 192.0.2.x,
 * MACs + wifi SSID/BSSID redacted, entity.raw stripped. Re-capture with
 * scripts/capture-fixture.sh.
 */
export const liveSnapshot = `;

writeFileSync(out, `${header}${json} satisfies Snapshot;\n`);
console.log(`Wrote ${out} (${snap.entities.length} entities)`);
