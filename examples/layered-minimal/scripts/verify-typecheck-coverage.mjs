#!/usr/bin/env node
/**
 * Guards against Minor 3 of the type-check-gate review: this program's covered file set is
 * import-driven, not declared. If someone deletes an import from src/theme.tsx (or anywhere
 * else in src/), the covered `lib/**` set can silently shrink while `tsc --noEmit` still exits
 * 0 — a green gate that checks less than it did, with nothing in the exit code to say so.
 *
 * This script re-derives the same `--listFiles` counts recorded in
 * docs/superpowers/core-typecheck-gate.md and fails loudly if any directory's count drops below
 * its last-recorded value. A drop is exactly the failure mode above; it is not by itself proof
 * of a problem (a genuine refactor can legitimately shrink a count), which is why this checks
 * a floor rather than an exact match — but any drop must be a deliberate, reviewed edit to the
 * EXPECTED table below, never a silent side effect of an unrelated import change.
 *
 * Run via `npm run verify-coverage` (also wired into `npm run typecheck`, so the normal gate
 * command catches this automatically).
 */
import { execFileSync } from 'node:child_process';

// Keep in sync with the "What this gate covers" counts in
// docs/superpowers/core-typecheck-gate.md. Update both together, deliberately, when a change
// legitimately moves a count (new file, deleted file, file relocated across these directories).
const EXPECTED_MINIMUMS = {
  'lib/render/': 9,
  'lib/transitions/': 14,
  'lib/theming/': 22, // +registry.ts (Task 1); +effects/{index,primitives,ken-burns} (Task 2); +tokens.ts and generic/{GenericOutro,GenericMultiClip,GenericCard,media-source} (Task 3); +brand-track.tsx and generic/GenericDisclaimer.tsx (Task 4); +generic/{GenericCaptions.tsx,caption-lines.ts} (Task 5)
  'lib/reel-config-base/': 8,
  'lib/transcripts/': 1,
};

const output = execFileSync('npx', ['tsc', '--noEmit', '--listFiles'], {
  encoding: 'utf8',
  // tsc --listFiles still prints the file list to stdout even when there are type errors;
  // let a real type error be reported by the normal `tsc --noEmit` step, not smothered here.
  stdio: ['ignore', 'pipe', 'inherit'],
});

const files = output.split('\n').filter(Boolean);

let ok = true;
for (const [dir, minimum] of Object.entries(EXPECTED_MINIMUMS)) {
  const count = files.filter((f) => f.includes(`/${dir}`)).length;
  const status = count >= minimum ? 'ok' : 'SHRUNK';
  console.log(`${status === 'ok' ? '  ' : '! '}${dir} ${count} files (expected >= ${minimum}) ${status}`);
  if (count < minimum) ok = false;
}

if (!ok) {
  console.error(
    '\nType-check coverage shrank below the counts recorded in ' +
      'docs/superpowers/core-typecheck-gate.md. This program\'s covered file set is import-driven ' +
      '(examples/layered-minimal/src imports pull in the lib/** files above) — a drop usually means ' +
      'an import was removed from src/ and lib/** files quietly fell out of the type-check program, ' +
      'not that anything got fixed. If this drop is deliberate (a file was legitimately deleted or ' +
      'moved), update EXPECTED_MINIMUMS here and the counts in the doc together.',
  );
  process.exit(1);
}

console.log('\nType-check coverage holds at or above recorded counts.');
