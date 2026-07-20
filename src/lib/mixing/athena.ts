/**
 * Athena Pro Line reservoir mixing — the math + the schedule reference for this tank.
 *
 * Athena's "Pro Line" is a dry 3-part line pre-mixed into a 226 g/L stock concentrate
 * (Pro Grow, Pro Bloom, Pro Core). The batch-reservoir chart gives each concentrate's dose
 * in mL per 10 L of reservoir water for a target EC. Grow and Bloom share one column (you
 * swap Grow→Bloom at flip); Core is dosed alongside. This module turns (target EC, water
 * volume) into the two concentrate pours, and carries the stage schedule + procedure this
 * tank runs so the Mixing page has one source of truth.
 *
 * Sources: Athena "Pro Line Stock Concentrate Mixing" sheet (226 g/L, metric) and the
 * "Pro Feed Schedule (Metric)". Add Balance to the water FIRST (dose to pH), then each
 * concentrate SEPARATELY — combining concentrates undiluted precipitates — then check EC + pH.
 */

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

/**
 * This reservoir's measured volumes (float-fill vs. drain-to-valve):
 *  - `full`   — a fresh fill by the float valve (an initial mix from empty-and-dry).
 *  - `refill` — the water a normal top-up adds: drained to the usable valve point (~38 L still in),
 *               then the float brings it back to 47.5 L, so you're dosing the 38 L you added.
 */
export const TANK = {
  full: 47.5,
  refill: 38
} as const;

export type MixMode = 'full' | 'refill' | 'custom';

/**
 * The substrate this grow runs. Fixes the batch pH to the CCI coco target (6.0) and records the
 * coco's own buffered EC for context. The live pH flag treats 5.8–6.2 (6.0 ± 0.2) as on-target.
 */
export const MEDIUM = {
  label: 'Coco block',
  detail: '8×8×7 in · 3 gal · 80% coir / 20% chips · 58% WHC',
  /** The medium's own buffered EC (its starting EC before feed). */
  bufferedEc: '0.1–0.2',
  /** Batch pH for coco per the CCI book (6.0); the live flag treats 5.8–6.2 as on-target. */
  ph: { min: 5.8, max: 6.2, target: 6.0, label: '6.0' }
} as const;

/**
 * Primary working feed (drip) EC — CCI LED coco veg / early flower. The calculator + quick reference
 * default here; the other stages (seedling 1.5, bulk 3.0, finish 2.5) are one chip tap away.
 */
export const WORKING_EC = 3.5;

export interface PerTenL {
  growBloom: number;
  core: number;
  /** True when EC is outside the printed chart (1.0–4.0) and the dose is extrapolated. */
  extrapolated: boolean;
}

/**
 * mL of each concentrate per 10 L for a target EC. Piecewise-linear across the chart points so an
 * in-between EC lands on Athena's own curve; outside [1.0, 4.0] we extrapolate the nearest segment
 * (flagged) and clamp at zero so a near-water EC never goes negative.
 */
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

/**
 * This grow's feed schedule — CCI Black Book LED crop-steering setpoints for coco (p.57 "4.A" +
 * p.64), dosed with Athena Pro (226 g/L). `ec` is the drip/feed EC you MIX; `substrateEc` is the
 * in-pot EC you steer toward via dryback (higher — never mix to it). pH 6.0 for coco (CCI p.64).
 * Seedlings from seed start ~1.5 EC / pH 5.5–5.6 (CCI p.26, Grodan Grow Guide), not the clone column.
 */
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

/** The batch mixing order (order matters — wrong order precipitates). */
export const MIX_ORDER: MixStep[] = [
  {
    order: 1,
    name: 'Balance',
    detail: 'Into the water first. Dose to pH in ~1 mL steps (potassium-silicate buffer, adds Si). Target pH 6.0 for coco (5.5–5.6 for seedlings).'
  },
  { order: 2, name: 'Pro Grow (veg) / Pro Bloom (flower)', detail: 'Add the concentrate for the stage — measured for your EC and volume below.' },
  { order: 3, name: 'Pro Core', detail: 'Add separately — never combine concentrates undiluted (they precipitate).' },
  { order: 4, name: 'Cleanse', detail: '5–13 mL per 10 L (3 at pre-soak). Then mix well and check EC + pH.' }
];
