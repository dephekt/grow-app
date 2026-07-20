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
 * The substrate this grow runs. Fixes the batch pH target to Athena's coco/rockwool window
 * (5.8–6.2) rather than the peat window, and records the coco's own buffered EC for context.
 */
export const MEDIUM = {
  label: 'Coco block',
  detail: '8×8×7 in · 3 gal · 80% coir / 20% chips · 58% WHC',
  /** The medium's own buffered EC (its starting EC before feed). */
  bufferedEc: '0.1–0.2',
  /** Batch pH window for coco. A reading within ±0.2 of this reads "near"; further out is "off". */
  ph: { min: 5.8, max: 6.2, label: '5.8–6.2' }
} as const;

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
  key: 'clone' | 'veg' | 'flower' | 'fade';
  label: string;
  weeks: string;
  /** Target reservoir EC (mS/cm) for the stage. */
  ec: number;
  /** The Grow-or-Bloom concentrate used this stage, mL per 10 L. */
  primary: { name: string; ml: number };
  /** Pro Core (or its late-flower swap), described for the reference row. */
  core: string;
  /** Athena Cleanse, mL per 10 L. */
  cleanse: string;
  /** Batch pH target/range for the stage. */
  ph: string;
  note?: string;
}

/** The schedule this grow follows (Athena Pro Feed Schedule, metric). */
export const FEED_SCHEDULE: FeedStage[] = [
  {
    key: 'clone',
    label: 'Clone / Pre-soak',
    weeks: 'start',
    ec: 2.0,
    primary: { name: 'Pro Bloom', ml: 57 },
    core: 'Core 34',
    cleanse: '3',
    ph: '5.6',
    note: 'Athena runs clones at EC 2.0 — seedlings from seed are gentler (dial EC 1.0–1.5 in the calculator).'
  },
  {
    key: 'veg',
    label: 'Veg',
    weeks: 'W1–4',
    ec: 3.0,
    primary: { name: 'Pro Grow', ml: 90 },
    core: 'Core 54',
    cleanse: '5–13',
    ph: '5.8–6.2 coco·rockwool (6.0–6.4 peat)'
  },
  {
    key: 'flower',
    label: 'Flower',
    weeks: 'W1–9',
    ec: 3.0,
    primary: { name: 'Pro Bloom', ml: 90 },
    core: 'Core 54',
    cleanse: '5–13',
    ph: '5.8–6.2 coco·rockwool (6.0–6.4 peat)'
  },
  {
    key: 'fade',
    label: 'Fade',
    weeks: 'late flower W8–9',
    ec: 3.0,
    primary: { name: 'Pro Bloom', ml: 90 },
    core: 'Fade 51 (swap for Core)',
    cleanse: '5–13',
    ph: '6.0–6.4',
    note: 'Swap Core→Fade in late flower (cultivar-dependent) — verify pH after switching.'
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
    detail: 'Into the water first. Dose to pH in ~1 mL steps (potassium-silicate buffer, adds Si). Target pH 5.6 clone · 5.8–6.2 coco·rockwool (6.0–6.4 peat).'
  },
  { order: 2, name: 'Pro Grow (veg) / Pro Bloom (flower)', detail: 'Add the concentrate for the stage — measured for your EC and volume below.' },
  { order: 3, name: 'Pro Core', detail: 'Add separately — never combine concentrates undiluted (they precipitate).' },
  { order: 4, name: 'Cleanse', detail: '5–13 mL per 10 L (3 at pre-soak). Then mix well and check EC + pH.' }
];
