#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Snider

/**
 * Does the climate suite actually discriminate?
 *
 * A test that passes proves nothing on its own — it may be passing through a path that never
 * reaches the code it names. Twice on this loop a test could not have failed for the reason it
 * existed: one asserted a new conjunct that an earlier condition already rejected, and one
 * asserted the 1.20 rail with the minimum-on timer disabled by its own fixture.
 *
 * So: break the control law on purpose, one edit at a time, and require the suite to notice.
 * A surviving mutant is a guard with no test behind it.
 *
 * Usage: node scripts/mutate-climate.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const TARGET = 'src/lib/climate/decide.ts';
const SUITE = [
  'tests/unit/climate-decide.test.ts',
  'tests/unit/climate-replay.test.ts',
  'tests/unit/climate-loop.test.ts'
];

/** Each mutation is a real defect this loop has actually shipped or nearly shipped. */
const MUTANTS = [
  // Two sites test the same conjunction, so each mutant carries enough context to pick one.
  {
    name: 'start ignores the fast window',
    from: 'if (vpd < band.low && fast < band.low) {',
    to: 'if (vpd < band.low) {'
  },
  {
    name: 'too-cold start ignores the fast window',
    from: 'return vpd < band.low && fast < band.low\n',
    to: 'return vpd < band.low\n'
  },
  {
    name: 'stop reads the median, not the fast window',
    from: 'if (fast >= band.high) {',
    to: 'if (vpd >= band.high) {'
  },
  {
    name: 'minimum on may defer a band-top stop',
    from: '        urgent: true,\n        why: `air VPD ${kpa(fast)} reached',
    to: '        urgent: false,\n        why: `air VPD ${kpa(fast)} reached'
  },
  {
    name: 'humidifier engages on the fast window alone',
    from: 'if (fast >= AIR_VPD_HARD_MAX && vpd >= AIR_VPD_HARD_MAX) {',
    to: 'if (fast >= AIR_VPD_HARD_MAX) {'
  },
  {
    name: 'humidifier releases on the median',
    from: 'return fast > release',
    to: 'return vpd > release'
  },
  {
    name: 'too-cold no longer stops a running fan',
    from: 'if (exhaust.on) return { on: false, urgent: true,',
    to: 'if (false) return { on: false, urgent: true,'
  },
  {
    name: 'futility gate never blocks a start',
    from: 'if (vented !== null && vented < vpd + config.minGainKpa) {',
    to: 'if (false) {'
  }
];

const original = readFileSync(TARGET, 'utf8');
let survived = 0;

for (const m of MUTANTS) {
  if (!original.includes(m.from)) {
    console.log(
      `SKIP  ${m.name}\n      pattern no longer present — the mutant needs rewriting, not the code`
    );
    survived++;
    continue;
  }
  writeFileSync(TARGET, original.replace(m.from, m.to));
  let killed = false;
  try {
    execFileSync('pnpm', ['exec', 'vitest', 'run', ...SUITE], { stdio: 'pipe' });
  } catch {
    killed = true;
  }
  console.log(`${killed ? 'killed' : 'SURVIVED'}  ${m.name}`);
  if (!killed) survived++;
}

writeFileSync(TARGET, original);
console.log(`\n${MUTANTS.length - survived}/${MUTANTS.length} killed`);
process.exit(survived === 0 ? 0 : 1);
