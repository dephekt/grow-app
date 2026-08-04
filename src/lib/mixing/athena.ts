// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/** Athena Pro Line reservoir mixing, from the "Pro Line Stock Concentrate Mixing" (226 g/L)
 *  and "Pro Feed Schedule" sheets; concentrates go in SEPARATELY or they precipitate. */

export interface DoseRow {
  /** Target solution EC (mS/cm). */
  ec: number;
  /** Pro Grow OR Pro Bloom concentrate, mL per 10 L (they share one column). */
  growBloom: number;
  /** Pro Core concentrate, mL per 10 L. */
  core: number;
}

/** Athena Pro Line 226 g/L concentrate — mL per 10 L of reservoir, by target EC (the printed chart). */
export const DOSE_TABLE: DoseRow[] = [
  { ec: 1.0, growBloom: 27, core: 16 },
  { ec: 1.5, growBloom: 42, core: 25 },
  { ec: 2.0, growBloom: 57, core: 34 },
  { ec: 2.5, growBloom: 73, core: 44 },
  { ec: 3.0, growBloom: 90, core: 54 },
  { ec: 3.5, growBloom: 107, core: 64 },
  { ec: 4.0, growBloom: 124, core: 75 }
];

/** Bounds of the printed chart — outside this, doses are extrapolated (and flagged). */
export const EC_MIN = DOSE_TABLE[0].ec; // 1.0
export const EC_MAX = DOSE_TABLE[DOSE_TABLE.length - 1].ec; // 4.0

/** Measured volumes: `full` is a fill from dry, `refill` is the ~38 L a top-up actually adds. */
export const TANK = {
  full: 47.5,
  refill: 38
} as const;

export type MixMode = 'full' | 'refill' | 'custom';

/** The substrate this grow runs; fixes batch pH to the CCI coco target of 6.0 ± 0.2. */
export const MEDIUM = {
  label: 'Coco block',
  detail: '8×8×7 in · 3 gal · 80% coir / 20% chips · 58% WHC',
  /** The medium's own buffered EC (its starting EC before feed). */
  bufferedEc: '0.1–0.2',
  /** Batch pH for coco per the CCI book (6.0); the live flag treats 5.8–6.2 as on-target. */
  ph: { min: 5.8, max: 6.2, target: 6.0, label: '6.0' }
} as const;

/** Working feed EC for CCI LED coco veg / early flower, the fallback when the stage is unknown. */
export const WORKING_EC = 3.5;

/** Grow stages — same string values as the light plan's StageKey. */
export type FeedStageKey = 'seedling' | 'veg' | 'flower' | 'ripen';

export interface FeedTarget {
  stage: FeedStageKey;
  stageLabel: string;
  /** Feed (drip) EC for the stage — the calculator's default target. */
  ec: number;
  /** Batch pH target/window for the stage's live flag. */
  ph: { min: number; max: number; target: number; label: string };
}

/** Seedlings run lower than the coco 6.0: CCI p.26 / Grodan target pH 5.5–5.6. */
const SEEDLING_PH = { min: 5.5, max: 5.7, target: 5.6, label: '5.5–5.6' } as const;

/** Feed EC and pH for the current stage; flower defaults to early-flower 3.5, see FEED_SCHEDULE. */
export function feedTargetForStage(stage: FeedStageKey): FeedTarget {
  switch (stage) {
    case 'seedling':
      return { stage, stageLabel: 'Seedling', ec: 1.5, ph: { ...SEEDLING_PH } };
    case 'ripen':
      return { stage, stageLabel: 'Ripen / fade', ec: 2.5, ph: { ...MEDIUM.ph } };
    case 'flower':
      return { stage, stageLabel: 'Flower', ec: WORKING_EC, ph: { ...MEDIUM.ph } };
    case 'veg':
    default:
      return { stage: 'veg', stageLabel: 'Veg', ec: WORKING_EC, ph: { ...MEDIUM.ph } };
  }
}

export interface PerTenL {
  growBloom: number;
  core: number;
  /** True when EC is outside the printed chart (1.0–4.0) and the dose is extrapolated. */
  extrapolated: boolean;
}

/** mL per 10 L for a target EC, piecewise-linear on Athena's chart; outside [1.0, 4.0] extrapolates. */
export function perTenLitres(ec: number): PerTenL {
  const rows = DOSE_TABLE;
  let lo = rows[0];
  let hi = rows[1];
  let extrapolated = false;

  if (ec <= rows[0].ec) {
    lo = rows[0];
    hi = rows[1];
    extrapolated = ec < rows[0].ec;
  } else if (ec >= rows[rows.length - 1].ec) {
    lo = rows[rows.length - 2];
    hi = rows[rows.length - 1];
    extrapolated = ec > rows[rows.length - 1].ec;
  } else {
    for (let i = 0; i < rows.length - 1; i++) {
      if (ec >= rows[i].ec && ec <= rows[i + 1].ec) {
        lo = rows[i];
        hi = rows[i + 1];
        break;
      }
    }
  }

  const span = hi.ec - lo.ec;
  const f = span === 0 ? 0 : (ec - lo.ec) / span;
  return {
    growBloom: Math.max(0, lo.growBloom + f * (hi.growBloom - lo.growBloom)),
    core: Math.max(0, lo.core + f * (hi.core - lo.core)),
    extrapolated
  };
}

export interface MixResult {
  ec: number;
  volumeL: number;
  /** Per-10 L basis used (the chart curve). */
  perTenL: { growBloom: number; core: number };
  /** Total pour for the whole volume, mL. */
  growBloom: number;
  core: number;
  extrapolated: boolean;
}

/** Concentrate pours for a target EC in a given water volume: dose = perTenL × volume/10. */
export function mix(ec: number, volumeL: number): MixResult {
  const p = perTenLitres(ec);
  const scale = Math.max(0, volumeL) / 10;
  return {
    ec,
    volumeL,
    perTenL: { growBloom: p.growBloom, core: p.core },
    growBloom: p.growBloom * scale,
    core: p.core * scale,
    extrapolated: p.extrapolated
  };
}

/** Resolve a mix mode to litres (custom passes its own volume). */
export function volumeForMode(mode: MixMode, customL: number): number {
  if (mode === 'full') return TANK.full;
  if (mode === 'refill') return TANK.refill;
  return customL;
}

/** A dose in mL to 1 decimal, trailing `.0` trimmed — full tank (427.5) and a 1 L pitcher (2.7) alike. */
export function fmtDose(n: number): string {
  const s = (Math.round(n * 10) / 10).toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

/* --------------------------------------------------------------------------------------------- */
/* Reference — this tank's Pro Feed Schedule (Metric, 226 g/L) and the batch procedure.          */
/* Display data for the page; the numbers reconcile with DOSE_TABLE (Bloom 57 + Core 34 = EC 2.0, */
/* Grow/Bloom 90 + Core 54 = EC 3.0). Balance is a pH adjust (dose to pH), not a fixed pour.      */
/* --------------------------------------------------------------------------------------------- */

export interface FeedStage {
  key: string;
  label: string;
  weeks: string;
  /** Reservoir feed (drip) EC — what you mix in the batch. */
  ec: number;
  /** The Grow-or-Bloom concentrate for the stage, mL per 10 L (Athena 226 g/L chart at `ec`). */
  primary: { name: string; ml: number };
  /** Pro Core (or its late-flower Fade swap), described for the reference row. */
  core: string;
  /** Athena Cleanse, mL per 10 L. */
  cleanse: string;
  /** Batch pH target for the stage. */
  ph: string;
  /** In-substrate EC to steer toward (pour-through) — NOT the mix; climbs as coco holds salts. */
  substrateEc: string;
  note?: string;
}

/** CCI Black Book LED coco setpoints (p.57 "4.A", p.64); `ec` is what you MIX, `substrateEc` is
 *  what you steer toward — never mix to it. */
export const FEED_SCHEDULE: FeedStage[] = [
  {
    key: 'seedling',
    label: 'Seedling',
    weeks: 'from seed',
    ec: 1.5,
    primary: { name: 'Pro Grow', ml: 42 },
    core: 'Core 25',
    cleanse: '3',
    ph: '5.5–5.6',
    substrateEc: '—',
    note: 'From seed (CCI p.26 / Grodan): EC 1.5, pH 5.5–5.6 — gentler than Athena’s clone column (2.0).'
  },
  {
    key: 'veg',
    label: 'Veg',
    weeks: 'wk1–2',
    ec: 3.5,
    primary: { name: 'Pro Grow', ml: 107 },
    core: 'Core 64',
    cleanse: '5–13',
    ph: '6.0',
    substrateEc: '4–6'
  },
  {
    key: 'flower-gen',
    label: 'Flower · early',
    weeks: 'wk1–3',
    ec: 3.5,
    primary: { name: 'Pro Bloom', ml: 107 },
    core: 'Core 64',
    cleanse: '5–13',
    ph: '6.0',
    substrateEc: '5–12',
    note: 'Generative setting — feed 3.5 and let substrate EC climb (5→12) on a hard dryback.'
  },
  {
    key: 'flower-bulk',
    label: 'Flower · bulk',
    weeks: 'wk4–7',
    ec: 3.0,
    primary: { name: 'Pro Bloom', ml: 90 },
    core: 'Core 54',
    cleanse: '5–13',
    ph: '6.0',
    substrateEc: '4–7'
  },
  {
    key: 'finish',
    label: 'Finish / fade',
    weeks: 'last 1–2 wk',
    ec: 2.5,
    primary: { name: 'Pro Bloom', ml: 73 },
    core: 'Fade (swap Core)',
    cleanse: '5–13',
    ph: '6.0',
    substrateEc: '6–8',
    note: 'Drip EC steps down 2.5 → 2.0 into harvest; swap Core→Fade (cultivar-dependent), verify pH.'
  }
];

export interface MixStep {
  order: number;
  name: string;
  detail: string;
}

export interface MixProcedure {
  key: string;
  title: string;
  /** One-line framing for when this order applies. */
  when: string;
  steps: MixStep[];
}

/** Two procedures because the Balance dose is unknowable until the (acidic) nutrients are in:
 *  measure it last on the first batch, then dose it up front on every batch after. */
export const MIX_PROCEDURES: MixProcedure[] = [
  {
    key: 'calibrate',
    title: 'First batch — find your Balance dose',
    when: "You don't know the Balance dose yet, so dose it to pH last and record it.",
    steps: [
      { order: 1, name: 'RO water', detail: 'Start from your measured volume of RO / filtered water.' },
      { order: 2, name: 'Pro Grow (veg) / Pro Bloom (flower)', detail: 'Add the stage concentrate — the mL measured below. Add separately.' },
      { order: 3, name: 'Pro Core', detail: 'Add separately — never combine concentrates undiluted (they precipitate).' },
      {
        order: 4,
        name: 'Balance — dose to pH, then record it',
        detail: 'The concentrates pull pH down, so balance now: add in ~1 mL steps up to target pH (6.0 coco · 5.5–5.6 seedlings). Write down the total mL — that is your reusable Balance dose for this recipe.'
      },
      { order: 5, name: 'Cleanse', detail: '5–13 mL per 10 L (3 at pre-soak). Mix well, then confirm EC + pH.' }
    ]
  },
  {
    key: 'repeat',
    title: 'Every batch after — reuse it',
    when: 'You know the Balance dose, so it goes in up front and the pH lands on target.',
    steps: [
      { order: 1, name: 'RO water', detail: 'Same measured volume as the batch you calibrated.' },
      {
        order: 2,
        name: 'Balance — the recorded dose, up front',
        detail: 'Add the mL you recorded straight into the water (scale it if the volume or EC target changed).'
      },
      { order: 3, name: 'Pro Grow (veg) / Pro Bloom (flower)', detail: 'Add the stage concentrate. Add separately.' },
      { order: 4, name: 'Pro Core', detail: 'Add separately — never combine concentrates undiluted.' },
      {
        order: 5,
        name: 'Cleanse',
        detail: '5–13 mL per 10 L. Mix well, then check EC + pH — it should land on target; nudge with a little Balance if needed.'
      }
    ]
  }
];
