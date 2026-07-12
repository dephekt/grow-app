import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { LiveSpectrum } from '$lib/server/mqtt/types';
import { processSpectrum, type ProcessedSpectrum } from '$lib/spectrum/calibration';

export interface CaptureSummary {
  id: string;
  capturedAt: string;
  seq: number | null;
  saturated: boolean;
  peakNm: number | null;
  ppfd: number | null;
  calibrated: boolean;
  label: string | null;
  thumb: number[]; // downsampled relative curve for the history sparkline
}

export interface CaptureDetail {
  id: string;
  nodeId: string;
  capturedAt: string;
  seq: number | null;
  integrationUs: number | null;
  saturated: boolean;
  adcBits: number | null;
  fw: string | null;
  label: string | null;
  note: string | null;
  counts: number[];
  processed: ProcessedSpectrum; // reprocessed on read → reflects current calibration
}

interface Row {
  id: string;
  node_id: string;
  captured_at: string;
  seq: number | null;
  integration_us: number | null;
  saturated: number;
  adc_bits: number | null;
  fw: string | null;
  counts: string;
  label: string | null;
  note: string | null;
}

function downsample(values: number[], points: number): number[] {
  const per = values.length / points;
  const out: number[] = [];
  for (let i = 0; i < points; i++) out.push(values[Math.min(values.length - 1, Math.floor(i * per))] ?? 0);
  return out;
}

function reprocess(row: Row): ProcessedSpectrum {
  const counts = JSON.parse(row.counts) as number[];
  return processSpectrum(counts, {
    adcFullScale: (1 << (row.adc_bits ?? 14)) - 1,
    integrationUs: row.integration_us ?? undefined
  });
}

export function saveCapture(
  db: DatabaseSync,
  input: { live: LiveSpectrum; label?: string | null; note?: string | null }
): CaptureSummary {
  const { live } = input;
  const p = live.processed;
  const id = randomUUID();
  db.prepare(
    `INSERT INTO captures (id, node_id, captured_at, seq, integration_us, saturated, adc_bits, fw, counts, label, note)
     VALUES (?,?,?,?,?,?,?,?,?, ?,?)`
  ).run(
    id,
    live.nodeId,
    live.capturedAt,
    live.seq,
    live.integrationUs,
    live.saturated ? 1 : 0,
    live.adcBits,
    live.fw,
    JSON.stringify(live.counts),
    input.label ?? null,
    input.note ?? null
  );
  return {
    id,
    capturedAt: live.capturedAt,
    seq: live.seq,
    saturated: live.saturated,
    peakNm: p.peakWavelengthNm,
    ppfd: p.ppfd,
    calibrated: p.calibrated,
    label: input.label ?? null,
    thumb: downsample(p.relative, 48)
  };
}

export function listCaptures(db: DatabaseSync, limit = 100): CaptureSummary[] {
  const rows = db
    .prepare(
      `SELECT id, node_id, captured_at, seq, integration_us, saturated, adc_bits, fw, counts, label, note
       FROM captures ORDER BY captured_at DESC LIMIT ?`
    )
    .all(limit) as unknown as Row[];
  return rows.map((row) => {
    const p = reprocess(row);
    return {
      id: row.id,
      capturedAt: row.captured_at,
      seq: row.seq,
      saturated: Boolean(row.saturated),
      peakNm: p.peakWavelengthNm,
      ppfd: p.ppfd,
      calibrated: p.calibrated,
      label: row.label,
      thumb: downsample(p.relative, 48)
    };
  });
}

export function getCapture(db: DatabaseSync, id: string): CaptureDetail | null {
  const row = db
    .prepare(
      `SELECT id, node_id, captured_at, seq, integration_us, saturated, adc_bits, fw, counts, label, note
       FROM captures WHERE id = ?`
    )
    .get(id) as unknown as Row | undefined;
  if (!row) return null;
  return {
    id: row.id,
    nodeId: row.node_id,
    capturedAt: row.captured_at,
    seq: row.seq,
    integrationUs: row.integration_us,
    saturated: Boolean(row.saturated),
    adcBits: row.adc_bits,
    fw: row.fw,
    label: row.label,
    note: row.note,
    counts: JSON.parse(row.counts) as number[],
    processed: reprocess(row)
  };
}
