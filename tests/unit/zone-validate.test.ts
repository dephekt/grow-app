// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

import { describe, expect, it } from 'vitest';
import { MAX_RUN_SECONDS_CEILING } from '../../src/lib/irrigation/model';
import { parseZoneCreate, parseZonePatch } from '../../src/lib/server/opensprinkler/validate';

const base = { name: '4x4', stationSid: 0 };

describe('substrate threshold validation', () => {
  it('accepts a band, an open side, and no band at all', () => {
    expect(parseZoneCreate({ ...base, vwcMinPct: 30, vwcMaxPct: 60 })).toMatchObject({
      vwcMinPct: 30,
      vwcMaxPct: 60
    });
    expect(parseZoneCreate({ ...base, vwcMinPct: 30 })).toMatchObject({
      vwcMinPct: 30,
      vwcMaxPct: null
    });
    expect(parseZoneCreate(base)).toMatchObject({ vwcMinPct: null, vwcMaxPct: null });
  });

  /**
   * A crossed band is almost always a transposed pair of inputs, and it can never be
   * satisfied — every reading would be both high and low at once. Rejecting it here
   * keeps that impossible state out of the store entirely.
   */
  it('rejects a band whose ends cross', () => {
    expect(() => parseZoneCreate({ ...base, vwcMinPct: 60, vwcMaxPct: 30 })).toThrow(/VWC/);
    expect(() =>
      parseZoneCreate({ ...base, substrateTempMinC: 30, substrateTempMaxC: 18 })
    ).toThrow(/temperature/i);
    expect(() => parseZoneCreate({ ...base, pwecMin: 6, pwecMax: 2 })).toThrow(/Pore EC/i);
  });

  it('allows a degenerate band whose ends are equal', () => {
    expect(parseZoneCreate({ ...base, pwecMin: 3, pwecMax: 3 })).toMatchObject({
      pwecMin: 3,
      pwecMax: 3
    });
  });

  it('holds bounds to physically meaningful ranges', () => {
    expect(() => parseZoneCreate({ ...base, vwcMinPct: -1 })).toThrow(/vwcMinPct/);
    expect(() => parseZoneCreate({ ...base, vwcMaxPct: 101 })).toThrow(/vwcMaxPct/);
    expect(() => parseZoneCreate({ ...base, pwecMin: -0.1 })).toThrow(/pwecMin/);
    expect(() => parseZoneCreate({ ...base, substrateTempMinC: -80 })).toThrow(/substrateTempMinC/);
  });

  /** Zero is a real bound; optPositiveNumber would have rejected it. */
  it('accepts a zero bound', () => {
    expect(parseZoneCreate({ ...base, pwecMin: 0 })).toMatchObject({ pwecMin: 0 });
    expect(parseZoneCreate({ ...base, vwcMinPct: 0 })).toMatchObject({ vwcMinPct: 0 });
  });

  it('rejects a non-numeric bound rather than coercing it', () => {
    expect(() => parseZoneCreate({ ...base, vwcMinPct: 'wet' })).toThrow(/vwcMinPct/);
  });

  it('carries the bands through a patch', () => {
    expect(parseZonePatch({ vwcMinPct: 30, vwcMaxPct: 60 })).toMatchObject({
      vwcMinPct: 30,
      vwcMaxPct: 60
    });
    expect(parseZonePatch({ vwcMinPct: null })).toMatchObject({ vwcMinPct: null });
  });

  /** The parser sees only what was sent, so the crossed check belongs where the merged
   *  row is known — updateZone. See the store tests. */
  it('leaves the crossed-band check to the merge', () => {
    expect(() => parseZonePatch({ vwcMinPct: 60, vwcMaxPct: 30 })).not.toThrow();
  });

  /** A patch that mentions no band must not overwrite the stored ones with nulls. */
  it('leaves the bands absent from a patch that does not mention them', () => {
    const patch = parseZonePatch({ name: 'Tent A' });
    expect('vwcMinPct' in patch).toBe(false);
    expect('pwecMax' in patch).toBe(false);
  });

  /**
   * Bands are independent. Rebuilding all six from the body would null the two the
   * caller never mentioned, silently wiping a grower's pore-EC thresholds because they
   * adjusted VWC.
   */
  it('patches one band without clearing the others', () => {
    const patch = parseZonePatch({ vwcMinPct: 30, vwcMaxPct: 60 });
    expect(patch).toMatchObject({ vwcMinPct: 30, vwcMaxPct: 60 });
    expect('pwecMin' in patch).toBe(false);
    expect('pwecMax' in patch).toBe(false);
    expect('substrateTempMinC' in patch).toBe(false);
  });

  /**
   * Naming one end must not touch the other. Filling the unnamed end with null — which
   * this originally did — meant PATCH {vwcMaxPct} wrote NULL over a stored floor.
   */
  it('patches one end of a band without clearing the other', () => {
    const patch = parseZonePatch({ vwcMaxPct: 60 });
    expect(patch).toMatchObject({ vwcMaxPct: 60 });
    expect('vwcMinPct' in patch).toBe(false);
  });

  it('rejects values Number() would coerce to a legal bound', () => {
    expect(() => parseZoneCreate({ ...base, pwecMin: true })).toThrow(/pwecMin/);
    expect(() => parseZoneCreate({ ...base, pwecMin: [] })).toThrow(/pwecMin/);
    // An empty string is the editor's "no bound", not a hard zero.
    expect(parseZoneCreate({ ...base, pwecMin: '' })).toMatchObject({ pwecMin: null });
    expect(parseZoneCreate({ ...base, pwecMin: '  ' })).toMatchObject({ pwecMin: null });
  });
});

/**
 * optBound carried the only guard against this; the rest of the numeric helpers coerced with a
 * bare Number(), which maps [4] to 4, true to 1 and '' to 0 — all finite, all plausible, none of
 * them a value anyone sent. They share one definition of a number now.
 */
describe('numeric coercion at the request boundary', () => {
  it('rejects the non-scalars that used to resolve to station 0', () => {
    // 0 is a legal sid, so unlike the other fields these could not be caught by a range check:
    // each of them silently bound the zone to a real valve.
    for (const stationSid of [null, false, '', '   ', [], [4], {}]) {
      expect(() => parseZoneCreate({ name: '4x4', stationSid })).toThrow(/stationSid/);
    }
  });

  it('still takes a number or a numeric string', () => {
    expect(parseZoneCreate({ name: '4x4', stationSid: 0 })).toMatchObject({ stationSid: 0 });
    expect(parseZoneCreate({ name: '4x4', stationSid: '4' })).toMatchObject({ stationSid: 4 });
    expect(parseZoneCreate({ ...base, emitterLph: '2' })).toMatchObject({ emitterLph: 2 });
  });

  it('rejects them across the zone spec, not just the sid', () => {
    expect(() => parseZoneCreate({ ...base, emitterLph: [2] })).toThrow(/emitterLph/);
    expect(() => parseZoneCreate({ ...base, drippers: true })).toThrow(/drippers/);
    expect(() => parseZoneCreate({ ...base, substrateVolumeMl: [4000] })).toThrow(
      /substrateVolumeMl/
    );
    expect(() => parseZoneCreate({ ...base, maxRunSeconds: [300] })).toThrow(/maxRunSeconds/);
    expect(() => parseZonePatch({ emitterLph: [2] })).toThrow(/emitterLph/);
  });
});

/**
 * The clamp exists so grow-app never commands a run the pump plug would cut short. The plug
 * latches its supply off after a 12 min dry-run session and only a physical rearm clears it,
 * so a zone allowed past the ceiling turns a legitimate long soak into a trip to the tent.
 * Nothing enforced this before: the column defaults to 300 and took any positive integer.
 */
describe('max run clamp', () => {
  it('accepts the ceiling and anything under it', () => {
    expect(parseZoneCreate({ ...base, maxRunSeconds: MAX_RUN_SECONDS_CEILING })).toMatchObject({
      maxRunSeconds: MAX_RUN_SECONDS_CEILING
    });
    expect(parseZoneCreate({ ...base, maxRunSeconds: 135 })).toMatchObject({ maxRunSeconds: 135 });
    // Omitted keeps the column default rather than the ceiling.
    expect(parseZoneCreate(base)).toMatchObject({ maxRunSeconds: 300 });
  });

  it('rejects a run longer than the pump plug tolerates', () => {
    expect(() => parseZoneCreate({ ...base, maxRunSeconds: MAX_RUN_SECONDS_CEILING + 1 })).toThrow(
      /maxRunSeconds/
    );
    expect(() => parseZoneCreate({ ...base, maxRunSeconds: 900 })).toThrow(/rearm/);
  });

  /** The patch path is the one the finding named — the editor writes through it. */
  it('applies the same ceiling on patch', () => {
    expect(parseZonePatch({ maxRunSeconds: 600 })).toMatchObject({ maxRunSeconds: 600 });
    expect(() => parseZonePatch({ maxRunSeconds: 1200 })).toThrow(/maxRunSeconds/);
    // Not naming it must still leave it untouched.
    expect('maxRunSeconds' in parseZonePatch({ name: 'x' })).toBe(false);
  });

  it('still rejects the non-integers it always did', () => {
    expect(() => parseZoneCreate({ ...base, maxRunSeconds: 0 })).toThrow(/positive integer/);
    expect(() => parseZoneCreate({ ...base, maxRunSeconds: -5 })).toThrow(/positive integer/);
    expect(() => parseZoneCreate({ ...base, maxRunSeconds: 12.5 })).toThrow(/positive integer/);
  });

  /** The ceiling has to stay under the firmware's dry-run timeout or it guarantees the trip. */
  it('leaves headroom under the 12 min firmware guard', () => {
    expect(MAX_RUN_SECONDS_CEILING).toBeLessThan(12 * 60);
  });
});
