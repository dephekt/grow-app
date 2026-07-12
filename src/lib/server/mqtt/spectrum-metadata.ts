import { numberValue } from './coerce';
import { PIXEL_COUNT } from '$lib/spectrum/calibration';

/** A raw spectrometer frame as published to `<prefix>/<node>/spectrum/state`.
 *  Firmware sends raw ADC counts only; all science is applied downstream. */
export interface RawSpectrumFrame {
  seq: number;
  integrationUs: number;
  saturated: boolean;
  adcBits: number;
  counts: number[];
  fw: string | null;
}

export interface ParsedSpectrum {
  nodeId: string;
  frame: RawSpectrumFrame | null; // null clears (retained-clear), mirroring ui-metadata
}

export function parseSpectrumTopic(topic: string, topicPrefix: string): string | null {
  if (!topic.startsWith(`${topicPrefix}/`) || !topic.endsWith('/spectrum/state')) return null;
  const nodeId = topic.slice(topicPrefix.length + 1, -'/spectrum/state'.length);
  return nodeId.length > 0 && !nodeId.includes('/') ? nodeId : null;
}

export function parseSpectrumPayload(topic: string, payloadText: string, topicPrefix: string): ParsedSpectrum | null {
  const nodeId = parseSpectrumTopic(topic, topicPrefix);
  if (!nodeId) return null;
  if (payloadText.trim().length === 0) return { nodeId, frame: null };

  let payload: unknown;
  try {
    payload = JSON.parse(payloadText);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload as Record<string, unknown>;

  const counts = raw.counts;
  if (!Array.isArray(counts) || counts.length !== PIXEL_COUNT) return null;
  const parsed: number[] = new Array(PIXEL_COUNT);
  for (let i = 0; i < PIXEL_COUNT; i++) {
    const v = counts[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    parsed[i] = v;
  }

  return {
    nodeId,
    frame: {
      seq: numberValue(raw.seq, 0),
      integrationUs: numberValue(raw.integration_us, 0),
      saturated: raw.saturated === true,
      adcBits: numberValue(raw.adc_bits, 14),
      counts: parsed,
      fw: typeof raw.fw === 'string' ? raw.fw : null
    }
  };
}
