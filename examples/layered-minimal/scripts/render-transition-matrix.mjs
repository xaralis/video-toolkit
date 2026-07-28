#!/usr/bin/env node
/**
 * THE TRANSITION PIXEL HARNESS — a gate, not a contact sheet.
 *
 * Until this file became an asserting harness, ZERO tests in this repo looked at
 * a pixel. The discriminator that found the `scanline-glitch` and `wipe`
 * defects — "at progress 0 the composite must still show the OUTGOING clip" —
 * existed only as a human squinting at a montage, so nothing would have caught
 * a NEW kind reintroducing the same bug family.
 *
 * It asserts two independent things:
 *
 *   1. GOLDENS per kind × mode × progress, committed to
 *      `goldens/transition-matrix.json` and compared on every run. This catches
 *      CHANGE. It is what lets a rewrite of transition rendering claim the
 *      already-correct kinds came through byte-identical, as a measurement
 *      rather than a hope. Each golden carries an exact sha256 AND an 8×8 grid
 *      of mean RGB, so the run can distinguish "different bytes" (reported,
 *      non-fatal — see DETERMINISM) from "different picture" (a failure).
 *   2. SEMANTIC CHECKS over the decoded pixels (see `lib/pixel-metrics.mjs`).
 *      This catches WRONGNESS — including in a kind that has no golden yet,
 *      which is exactly the case a hash can say nothing about.
 *
 * THE AXIS NAMED `mode` IS DELIBERATELY NOT "direction".
 * A `mode` here is a REEL-LEVEL SCENARIO, defined entirely by how the probe
 * reel is configured in `src/TransitionMatrix.tsx` and observable in the
 * rendered output:
 *
 *   enter  a lone clip carrying the kind as its `transitionIn`  — a clip's head
 *          with nothing before it.
 *   exit   a lone clip carrying it as its `transitionOut`       — a clip's tail
 *          with nothing after it.
 *   cut    two clips meeting at a real cut                      — the composite
 *          a reel actually renders.
 *
 * None of those three is a statement about the one-sided `direction` parameter
 * the renderer currently threads through a presentation. When transition
 * rendering moves to a two-input (outgoing + incoming) model, "direction" as an
 * internal concept may not survive — but "a clip's head", "a clip's tail" and
 * "two clips meeting" are scenarios a reel can always be in, and they stay
 * expressible and observable. That is why the harness is written against them.
 * Nothing in this file or in `lib/pixel-metrics.mjs` reads `direction`.
 *
 * DETERMINISM — measured here, not assumed. Probe content is flat colour plus a
 * numeral: no photo, no video, which is where this repo's known ~1-in-20 render
 * flake lives. Neither this harness nor `remotion.config.ts` sets a Chromium
 * OpenGL renderer, and the one configuration measured to be non-deterministic in
 * this programme (a brand reel) is the one that sets `angle`. Do not add either.
 *
 * Even so, these renders are NOT byte-deterministic — and after ~2,070 renders
 * of investigation the flake is characterised precisely rather than tolerated
 * vaguely (full write-up in docs/superpowers/transition-pixel-harness.md):
 *
 *   - every differing pixel sits in the RIGHTMOST 8 COLUMNS of the 540px frame,
 *     16-28 pixels out of 518,400, alpha never changing;
 *   - it is strictly BIMODAL — exactly two globally stable hashes per affected
 *     cell, the same two across independent runs, both orderings and 16 fresh
 *     processes, never a third;
 *   - it is a PER-RENDER coin flip at 9-50% per cell, not run-scoped (an earlier
 *     version of this comment claimed eight isolated renders agree 8/8; that was
 *     wrong — measured, one browser: A A B A A B B B);
 *   - the worst 8×8 cell mean shift it produces is 0.0183/255, two orders of
 *     magnitude below FP_TOLERANCE, so it always reports delta 0.
 *
 * Because it is bimodal and stable, it is RECORDED, not exempted: a golden may
 * carry two accepted hashes (`<a>|<b>`) for a cell listed in `bimodalCells`, and
 * either matches as `ok`. Byte-exact enforcement therefore still applies to all
 * 300 cells — there is no exempted kind and no blind spot. Consequences, all
 * visible in the output, never silent:
 *   - a mismatch is re-rendered once before it is called drift (on the SAME
 *     browser: replacing the browser mid-run was tried and crashes the run with
 *     an unhandled EPIPE — see the browser-lifecycle note below);
 *   - a mismatch against every accepted hash whose 8×8 picture still agrees is
 *     `NEAR`: reported and counted by default, FATAL under `--strict`. Use
 *     `--strict` for any claim that rendering came through unchanged — the
 *     tolerance is wide enough (~8100 px per cell) that a localised real change,
 *     or a uniform ±1-2/255 shift across the whole frame, would sit inside it,
 *     and a uniform shift is exactly what restacking compositing layers
 *     produces;
 *   - `--update-goldens` renders each still `--repeat=N` times (default 2), so a
 *     flake is never baked into a baseline; at `--repeat=8` or more it also
 *     RECORDS a two-hash cell instead of majority-voting one away;
 *   - `--audit-bimodal` re-samples the recorded cells, so a cell that stopped
 *     flaking must be de-listed rather than lingering as dead tolerance.
 *
 * USAGE
 *   node scripts/render-transition-matrix.mjs                # the gate
 *   node scripts/render-transition-matrix.mjs --strict       # …NEAR fatal — REQUIRED for a parity claim
 *   node scripts/render-transition-matrix.mjs fade wipe      # only these kinds
 *   node scripts/render-transition-matrix.mjs --self-test    # no rendering; proves the checks have teeth
 *   node scripts/render-transition-matrix.mjs --sheets       # also write contact sheets (needs ImageMagick)
 *   node scripts/render-transition-matrix.mjs --update-goldens              # re-baseline (REVIEW THE DIFF)
 *   node scripts/render-transition-matrix.mjs --update-goldens --repeat=12  # …and re-seed bimodal cells
 *   node scripts/render-transition-matrix.mjs --audit-bimodal[=12]          # re-sample the recorded bimodal cells
 *
 * RE-BASELINING is always a reviewed edit: `--update-goldens` rewrites a
 * committed JSON file and prints every added / removed / changed key, and it
 * REFUSES to shrink coverage without `--allow-shrink`. It is not a way to make
 * a red run go away quietly.
 */
import { bundle } from '@remotion/bundler';
import { getCompositions, openBrowser, renderStill } from '@remotion/renderer';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from './lib/png.mjs';
import {
  encodeGolden,
  hashFrame,
  isBimodalGolden,
  modalColor,
  semanticChecks,
  toHex,
  verifyFrame,
} from './lib/pixel-metrics.mjs';
import { runSelfTest } from './lib/harness-self-test.mjs';

const DEFAULT_COMMENT =
  'Golden pixel hashes for the at-cut transition matrix. One entry per <kind>__<mode>__<progress>, ' +
  'hashed over the DECODED RGBA buffer (not the PNG file). Regenerate with ' +
  '`node scripts/render-transition-matrix.mjs --update-goldens` and REVIEW THE DIFF — a re-baseline ' +
  'asserts the new pixels are correct. `knownDefective` records kinds whose goldens are ' +
  'WRONG-BUT-CURRENT (see docs/superpowers/at-cut-transition-findings.md): a change to those ' +
  'goldens is expected, not a regression. `semanticXfail` is the subset the semantic checks ' +
  'actually catch today; the harness fails if one of those starts passing without being removed ' +
  'from the list in the same commit. `bimodalCells` lists the individual cells whose entry carries ' +
  'TWO accepted hashes separated by "|" — this renderer is nondeterministic in the rightmost 8 ' +
  'columns of the frame, strictly bimodal and globally stable, so both attractors are recorded and ' +
  'either is accepted; every other cell is still enforced byte-exactly. A cell may only carry a ' +
  'second hash if it is listed here, and `--audit-bimodal` re-samples the list so a cell that has ' +
  'stopped flaking must be de-listed.';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out', 'matrix');
const SHEETS = path.join(ROOT, 'out', 'sheets');
const GOLDEN_FILE = path.join(ROOT, 'goldens', 'transition-matrix.json');

// Must match TransitionMatrix.tsx: 20-frame transition, 60-frame clips.
const FRAMES = 20;
const CLIP_F = 60;
const PROGRESS = [0, 0.25, 0.5, 0.75, 1];
const MODES = ['enter', 'exit', 'cut'];

/** Global frame at which a mode's transition sits at `p`. */
function frameFor(mode, p) {
  const off = Math.round(p * FRAMES);
  if (mode === 'enter') return off; // entering window is [0, FRAMES]
  if (mode === 'exit') return CLIP_F - FRAMES + off; // trailing edge of a lone clip
  // 'cut': clip A borrows ceil(FRAMES/2) handle frames, so its sequence runs
  // 0..70 and its exiting window starts at 70-20 = 50 — which is also where
  // clip B's sequence (seqFrom 60-10) puts its entering window.
  return CLIP_F - FRAMES / 2 + off;
}

const pKey = (p) => `p${String(p).replace('.', '')}`;
const keyOf = (kind, mode, p) => `${kind}__${mode}__${pKey(p)}`;

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const UPDATE = flag('--update-goldens');
const ALLOW_SHRINK = flag('--allow-shrink');
const SELF_TEST = flag('--self-test');
const STRICT = flag('--strict');
const WANT_SHEETS = flag('--sheets');
// How many times each still is rendered while re-baselining. 2 is enough to
// reject a one-off; the two thresholds below decide when an observation is
// strong enough to RECORD a bimodal cell, and when it is strong enough to
// DE-LIST one.
// ASYMMETRIC on purpose. Observing two distinct hashes is evidence of PRESENCE
// and needs only enough samples to rule out a one-off, so recording a cell as
// bimodal is cheap. Observing one hash is evidence of ABSENCE, which is much
// weaker: measured minorities here run as low as 1 in 24, and at p=0.1 twelve
// samples miss a flaking cell ~28% of the time. So de-listing a cell demands far
// more samples than listing one.
const BIMODAL_RECORD_SAMPLES = 8;
const BIMODAL_DELIST_SAMPLES = 24;
const repeatArg = argv.find((a) => a.startsWith('--repeat='));
const REPEAT = repeatArg ? Math.max(1, Number(repeatArg.split('=')[1])) : 2;
const auditArg = argv.find((a) => a.startsWith('--audit-bimodal'));
const AUDIT = Boolean(auditArg);
const AUDIT_N = auditArg?.includes('=') ? Math.max(2, Number(auditArg.split('=')[1])) : BIMODAL_DELIST_SAMPLES;
const only = argv.filter((a) => !a.startsWith('--'));

if (SELF_TEST) {
  process.exit(runSelfTest() ? 0 : 1);
}

const problems = [];
const notes = [];
const fail = (msg) => problems.push(msg);

// ---------------------------------------------------------------- goldens ---
let goldens;
try {
  goldens = JSON.parse(readFileSync(GOLDEN_FILE, 'utf8'));
} catch (err) {
  if (!UPDATE) {
    console.error(`no goldens at ${path.relative(ROOT, GOLDEN_FILE)} — run with --update-goldens to seed them`);
    process.exit(1);
  }
  goldens = { probe: {}, kindCount: 0, knownDefective: [], frames: {} };
}
const oldFrames = { ...(goldens.frames ?? {}) };
// TWO lists, deliberately not one. `knownDefective` is documentation — the
// kinds whose goldens record wrong-but-current pixels, so Workstream 2 knows a
// change there is expected. `semanticXfail` is the ENFORCED subset: the kinds
// the semantic checks currently catch. They differ, and pretending otherwise
// would be a lie in the gate: `checkerboard`'s defect is that its EXITING layer
// does nothing, which is pixel-identical to the seven kinds that legitimately
// do nothing when exiting (fade, dissolve, fade-coal, burn, clock-wipe, iris,
// gradient-wipe — see the findings doc). No pixel test can separate those, so
// `checkerboard` is pinned by its golden hashes only.
const knownDefective = new Set(goldens.knownDefective ?? []);
const semanticXfail = new Set(goldens.semanticXfail ?? []);

// CELLS — not kinds — measured to render bimodally. Each listed cell's golden
// carries two accepted hashes; either matches as `ok`, anything else is
// near/drift as normal, so byte-exact enforcement is retained everywhere.
//
// This replaced a kind-level `flakyUnderStrict` exemption, which was wrong three
// ways: it blinded 30 cells to cover 10 (all `exit`-mode cells are structurally
// incapable of the flake — both presentations apply their clip path only when
// `presentationDirection !== 'exiting'`), it was scoped by the wrong predictor
// ("curved edge" — `clock-wipe`'s flaking boundary is a straight radial ray and
// `light-leak` has no clip path at all), and it was incomplete, so `--strict`
// could still go red on an unchanged tree.
// Two sets, deliberately. `declaredBimodal` is what the COMMITTED file says and
// is what the guards below validate against; `bimodalCells` is the set that will
// be WRITTEN, which a seeding pass adds to. Conflating them made the guards
// validate the old goldens against a list the same run had just extended, so a
// seeding pass failed against its own findings.
const declaredBimodal = new Set(goldens.bimodalCells ?? []);
const bimodalCells = new Set(declaredBimodal);

// ---------------------------------------------------------------- render ----
// Clearing the scratch directory must never be able to fail the RUN. Back to
// back invocations raced here: a previous run's Chrome was still writing into
// out/matrix, and `rmSync` threw `EACCES, Directory not empty` before a single
// still had been rendered — a housekeeping error masquerading as a red gate.
// Retry, then shrug: every still is written with `overwrite: true`, so a
// leftover file is harmless.
function clearDir(dir) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  } catch (err) {
    notes.push(`could not clear ${path.relative(ROOT, dir)} (${err.code ?? err.message}); stills are overwritten in place`);
  }
  mkdirSync(dir, { recursive: true });
}

clearDir(OUT);
if (WANT_SHEETS) clearDir(SHEETS);

console.log('bundling…');
// Mirrors remotion.config.ts. The CLI reads that file; the programmatic
// bundler does not, so the `@video-toolkit/lib` alias and the node_modules
// search path have to be restated here or nothing under lib/ resolves.
const toolkitLib = path.resolve(ROOT, '../../lib');
const serveUrl = await bundle({
  entryPoint: path.join(ROOT, 'src', 'index.ts'),
  webpackOverride: (current) => ({
    ...current,
    resolve: {
      ...current.resolve,
      modules: [path.join(ROOT, 'node_modules'), 'node_modules'],
      alias: { ...(current.resolve?.alias ?? {}), '@video-toolkit/lib': toolkitLib },
    },
  }),
});
// ONE warm browser for the whole matrix, replaced ONLY when a render actually
// throws. Every other arrangement was tried here and measured worse:
//   - letting `renderStill` launch its own Chrome per still is ~7x slower and
//     dies around 60 stills ("Timed out after 25000ms while trying to connect
//     to the browser");
//   - recycling on a fixed count (every 15 stills) crashes the run outright with
//     an unhandled `EPIPE` when a write lands on a replaced browser's socket,
//     and leaves `chrome-headless-shell` processes behind that then wedge the
//     NEXT run for minutes.
// A single instance carries all 300 stills once the machine has no orphaned
// Chrome processes on it; the 105-still hang seen earlier was on a machine still
// holding orphans from a killed run. If a gate run ever hangs at startup, check
// for stray `chrome-headless-shell` processes first.
let browser = await openBrowser('chrome', { logLevel: 'error' });

async function recycleBrowser(why) {
  try {
    await browser.close({ silent: true });
  } catch {
    /* a wedged browser is exactly what we are replacing */
  }
  browser = await openBrowser('chrome', { logLevel: 'error' });
  notes.push(`browser replaced after a render error: ${why}`);
}

const comps = (await getCompositions(serveUrl, { puppeteerInstance: browser })).filter((c) =>
  c.id.startsWith('Probe-'),
);

// "Probe-<kind>-<mode>" — mode is the LAST segment, kind is everything between
// (kinds contain dashes: zoom-through, scanline-glitch, …). The kind list is
// NOT written here: it is whatever `TransitionMatrix.tsx` registered from
// TRANSITION_CATALOG, so a kind added to the catalog is covered automatically.
const parsed = comps.map((c) => {
  const parts = c.id.split('-');
  const mode = parts.pop();
  parts.shift();
  return { comp: c, kind: parts.join('-'), mode };
});
const allKinds = [...new Set(parsed.map((p) => p.kind))];
const kinds = allKinds.filter((k) => only.length === 0 || only.includes(k));
for (const k of only) if (!allKinds.includes(k)) fail(`no probe compositions for requested kind "${k}"`);

const entryFor = (kind, mode) => parsed.find((p) => p.kind === kind && p.mode === mode);

/** Render one still and hand back the decoded RGBA frame. */
async function shoot(entry, frame, file) {
  const output = path.join(OUT, file);
  const once = () =>
    renderStill({
      composition: entry.comp,
      serveUrl,
      output,
      puppeteerInstance: browser,
      logLevel: 'error',
      // Clamp: in `exit` mode the transition's own end (progress 1) lands on
      // the frame one PAST the composition's last, since the exiting window
      // runs to the clip's final frame. p=1 there is really p=0.95 — the last
      // frame that exists.
      frame: Math.min(frame, entry.comp.durationInFrames - 1),
      overwrite: true,
    });

  try {
    await once();
  } catch (err) {
    // A wedged browser is an INFRASTRUCTURE failure, not a rendering finding —
    // replace it and try the same still once more. If it fails again the error
    // propagates and the run dies loudly rather than skipping a still.
    await recycleBrowser(`${file}: ${String(err.message ?? err).split('\n')[0]}`);
    await once();
  }
  return decodePng(readFileSync(output));
}

// The plate colours are DERIVED, not restated: frame 0 of any `cut` probe is
// pure clip A (the transition window does not open until frame 50) and its last
// frame is pure clip B. So the harness stays correct if the probe's palette in
// TransitionMatrix.tsx ever changes, and the change shows up in the golden
// file's metadata diff rather than silently skewing every measurement.
const refEntry = entryFor(kinds[0] ?? allKinds[0], 'cut');
if (!refEntry) {
  console.error('no `cut` probe composition found — cannot derive plate colours');
  await browser.close({ silent: true });
  process.exit(1);
}
const plateA = modalColor(await shoot(refEntry, 0, '_ref_a.png'));
const plateB = modalColor(await shoot(refEntry, refEntry.comp.durationInFrames - 1, '_ref_b.png'));
if (toHex(plateA) === toHex(plateB)) {
  console.error(`probe plates are indistinguishable (${toHex(plateA)}) — the harness cannot measure anything`);
  await browser.close({ silent: true });
  process.exit(1);
}
console.log(`plates: outgoing ${toHex(plateA)} · incoming ${toHex(plateB)}`);
console.log(`${kinds.length} kinds × ${MODES.length} modes × ${PROGRESS.length} progress points`);

const started = Date.now();
const newFrames = {};
const results = { ok: 0, secondHash: 0, near: 0, drift: 0, missing: 0, retried: 0, nondeterministic: 0 };
const semanticFailures = [];
const xfail = [];
const xpass = [];
let n = 0;

for (const kind of kinds) {
  const decoded = {};
  for (const mode of MODES) {
    const entry = entryFor(kind, mode);
    if (!entry) {
      fail(`kind "${kind}" has no "${mode}" probe composition`);
      continue;
    }
    for (const p of PROGRESS) {
      const key = keyOf(kind, mode, p);
      const file = `${key}.png`;
      let frame = await shoot(entry, frameFor(mode, p), file);
      n++;
      newFrames[key] = encodeGolden(frame);

      if (UPDATE) {
        // Every still is rendered `--repeat=N` times (default 2) while
        // re-baselining, so a one-off is never baked into the baseline.
        //
        // With N >= BIMODAL_RECORD_SAMPLES the pass is also the SEEDING pass: two
        // distinct hashes are then not a flake to be majority-voted away but a
        // measured property of the cell, and BOTH are recorded as accepted. The
        // renderer's nondeterminism is a per-render coin flip at 9-50% per
        // affected cell, so two samples cannot tell "bimodal" from "unlucky" —
        // which is exactly why the old majority vote produced a baseline that
        // could not be verified.
        const samples = [frame];
        for (let r = 1; r < REPEAT; r++) {
          samples.push(await shoot(entry, frameFor(mode, p), `${key}.r${r}.png`));
          n++;
        }
        const distinct = [...new Set(samples.map(hashFrame))];
        const wasAccepted = (oldFrames[key] ?? '').split(' ')[0].split('|');
        if (distinct.length === 1) {
          newFrames[key] = encodeGolden(frame);
          if (bimodalCells.has(key)) {
            // Guard C: a cell listed as bimodal that no longer flakes has to be
            // de-listed, exactly as `semanticXfail` demands of a fixed defect.
            // Only meaningful with enough samples to be evidence — below that,
            // the cell's existing second hash is CARRIED FORWARD rather than
            // dropped, so an ordinary `--repeat=2` re-baseline cannot silently
            // un-record a bimodal cell.
            if (REPEAT >= BIMODAL_DELIST_SAMPLES) {
              fail(`BIMODAL XPASS: "${key}" is listed in bimodalCells but produced ONE hash in ${REPEAT} renders. Remove it from bimodalCells in the same commit.`);
            } else if (wasAccepted.includes(distinct[0])) {
              newFrames[key] = `${[...new Set(wasAccepted)].sort().join('|')} ${newFrames[key].split(' ')[1]}`;
              notes.push(`${key} is listed bimodal and showed one hash in ${REPEAT} renders — too few samples to conclude, so its recorded pair is kept. Re-run with --repeat=${BIMODAL_DELIST_SAMPLES} or more to settle it.`);
            }
          }
        } else if (distinct.length === 2 && REPEAT >= BIMODAL_RECORD_SAMPLES) {
          const minority = Math.min(...distinct.map((h) => samples.filter((s) => hashFrame(s) === h).length));
          newFrames[key] = encodeGolden(samples);
          bimodalCells.add(key);
          notes.push(`BIMODAL: ${key} produced two stable hashes in ${REPEAT} renders (minority ${minority}/${REPEAT}); both recorded as accepted`);
        } else if (distinct.length === 2) {
          const counts = distinct.map((h) => samples.filter((s) => hashFrame(s) === h).length);
          const winner = samples.find((s) => hashFrame(s) === distinct[counts[0] >= counts[1] ? 0 : 1]);
          notes.push(`FLAKY UNDER RE-BASELINE: ${key} rendered two different images in ${REPEAT}; took the majority. Re-run with --repeat=${BIMODAL_RECORD_SAMPLES} to record it as bimodal instead.`);
          newFrames[key] = encodeGolden(winner);
          frame = winner;
        } else {
          // Three or more distinct images. The flake this renderer has is
          // strictly bimodal (never a third value across ~2,070 renders), so a
          // third value is not the known flake and cannot be baselined.
          fail(`UNSTABLE UNDER RE-BASELINE: ${key} rendered ${distinct.length} different images in ${REPEAT}; the known flake is strictly bimodal, so this is something else and cannot be baselined`);
        }
      } else if (AUDIT) {
        // Guard C, standalone: re-sample the cells recorded as bimodal.
        if (bimodalCells.has(key)) {
          const samples = [frame];
          for (let r = 1; r < AUDIT_N; r++) {
            samples.push(await shoot(entry, frameFor(mode, p), `${key}.a${r}.png`));
            n++;
          }
          const seen = new Set(samples.map(hashFrame));
          const accepted = new Set((oldFrames[key] ?? '').split(' ')[0].split('|'));
          const unexpected = [...seen].filter((h) => !accepted.has(h));
          if (unexpected.length) {
            fail(`BIMODAL AUDIT: ${key} produced a hash outside its accepted set (${unexpected.map((h) => h.slice(0, 12)).join(', ')}) in ${AUDIT_N} renders`);
          } else if (seen.size === 1) {
            fail(`BIMODAL XPASS: "${key}" is listed in bimodalCells but produced ONE hash in ${AUDIT_N} renders. Remove it from bimodalCells (and drop the second hash) in the same commit.`);
          } else {
            const minority = Math.min(...[...seen].map((h) => samples.filter((s) => hashFrame(s) === h).length));
            console.log(`  AUDIT ${key} — both attractors seen (minority ${minority}/${AUDIT_N}) ok`);
          }
        }
      } else {
        let v = verifyFrame(key, frame, oldFrames);
        if (v.status === 'near' || v.status === 'drift') {
          // Re-render once before calling it drift — loudly, never silently.
          console.log(`  RETRY ${key} — ${v.status === 'near' ? 'bytes differ (picture matches)' : 'picture differs'}; re-rendering`);
          results.retried++;
          const again = await shoot(entry, frameFor(mode, p), `${key}.retry.png`);
          n++;
          const h2 = hashFrame(again);
          if (h2 !== v.actual) {
            results.nondeterministic++;
            notes.push(`NON-DETERMINISTIC render: ${key} produced two different images in one run (${v.actual.slice(0, 12)} / ${h2.slice(0, 12)})`);
          }
          const v2 = verifyFrame(key, again, oldFrames);
          if (v2.status === 'ok' || (v.status === 'drift' && v2.status === 'near')) {
            notes.push(`FLAKE RECOVERED: ${key} ${v2.status === 'ok' ? 'matched the golden' : 'matched the golden picture'} on the second render`);
            frame = again;
            newFrames[key] = encodeGolden(again);
          }
          v = v2;
        }
        if (v.status === 'drift') {
          results.drift++;
          fail(`PIXEL DRIFT: ${key} — the picture changed (max cell delta ${v.delta})\n    expected ${v.expected}\n    actual   ${v.actual}`);
        } else if (v.status === 'near') {
          // Bytes moved, the picture did not — within a tolerance that is wide
          // by necessity, not by preference. Counted and named either way; under
          // `--strict` it is also FATAL, because a claim that rendering came
          // through unchanged cannot be made on a lenient run.
          results.near++;
          const line = `NEAR ${key} — bytes differ, picture identical within tolerance (max cell delta ${v.delta})`;
          if (STRICT) fail(`${line} — fatal under --strict`);
          else console.log(`  ${line}`);
        } else if (v.status === 'missing-golden') {
          results.missing++;
          fail(`NO GOLDEN for ${key} — a kind is covered by the matrix but not baselined; run --update-goldens and review the diff`);
        } else {
          results.ok++;
          // Count matches on the cell's SECOND recorded hash — `matchedIndex`,
          // not `accepted`. An earlier version incremented on ANY accepted match
          // on a bimodal cell, which made the number a constant (16 on every full
          // sweep) dressed up as a measurement, and printed a false summary line
          // on every single run. It is a measurement now: it varies run to run,
          // and a bimodal cell whose second hash never comes up is what
          // `--audit-bimodal` exists to catch.
          if (v.matchedIndex === 1) results.secondHash++;
        }
      }

      decoded[`${mode}__${pKey(p)}`] = frame;
    }
  }

  // `cut` is the instantaneous kind: it has no `frames` at all, so the
  // "must be mid-transition at halfway" check does not apply to it.
  const sem = semanticChecks({ kind, frames: decoded, a: plateA, b: plateB, isInstant: kind === 'cut' });
  if (semanticXfail.has(kind)) {
    if (sem.length === 0) xpass.push(kind);
    else xfail.push(...sem);
  } else {
    semanticFailures.push(...sem);
  }

  if (WANT_SHEETS) writeSheet(kind);
  console.log(`  ${kind} — ${n} stills, ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

const elapsed = (Date.now() - started) / 1000;
await browser.close({ silent: true });

// ------------------------------------------------------- coverage guards ----
// A gate that silently covers less than it claims is worse than no gate. These
// guards are the reason `--update-goldens` cannot be used to make a shrinking
// matrix disappear.
// These run even on a FILTERED run: they compare the catalog against the golden
// file and never depend on what was rendered, so `node … fade` still tells you
// the matrix has stopped covering what it claims to.
{
  const expectedKinds = goldens.kindCount ?? 0;
  if (allKinds.length < expectedKinds && !(UPDATE && ALLOW_SHRINK)) {
    fail(`COVERAGE SHRANK: goldens were taken over ${expectedKinds} kinds, this run found ${allKinds.length}. If that is intended, re-baseline with --update-goldens --allow-shrink.`);
  }
  for (const key of Object.keys(oldFrames)) {
    const kind = key.split('__')[0];
    if (!allKinds.includes(kind)) fail(`STALE GOLDEN: "${key}" is baselined but kind "${kind}" no longer exists`);
  }
  // …and the converse, cross-producted rather than observed. The per-still
  // `missing-golden` check below only ever fires for kinds this run RENDERED, so
  // on a filtered run a newly added catalog kind with no goldens at all used to
  // slip through silently — and `kindCount` only guards against SHRINKING, so it
  // did not catch it either. That is precisely the failure this harness exists to
  // prevent, so the check is done here, off the catalog, with no renders involved.
  if (!UPDATE) {
    const unbaselined = [];
    for (const kind of allKinds) {
      for (const mode of MODES) {
        for (const p of PROGRESS) if (!(keyOf(kind, mode, p) in oldFrames)) unbaselined.push(keyOf(kind, mode, p));
      }
    }
    if (unbaselined.length) {
      const kindsAffected = [...new Set(unbaselined.map((k) => k.split('__')[0]))];
      fail(
        `UNBASELINED COVERAGE: ${unbaselined.length} of ${allKinds.length * MODES.length * PROGRESS.length} matrix cells have no golden, ` +
          `across ${kindsAffected.length} kind(s): ${kindsAffected.join(', ')}. Run --update-goldens and review the diff.`,
      );
    }
  }
  for (const k of knownDefective) {
    if (!allKinds.includes(k)) fail(`knownDefective lists "${k}", which is not a transition kind any more`);
  }
  for (const k of semanticXfail) {
    if (!knownDefective.has(k)) fail(`semanticXfail lists "${k}" but knownDefective does not — the two lists have drifted`);
  }
  // A second accepted hash may NEVER appear without the cell being listed: a
  // newly bimodal cell is information, not noise, and must reach a reviewer as a
  // one-line addition to `bimodalCells` rather than hiding inside a hash column.
  for (const [key, value] of Object.entries(oldFrames)) {
    if (isBimodalGolden(value) && !declaredBimodal.has(key))
      fail(`UNDECLARED BIMODAL GOLDEN: "${key}" carries two accepted hashes but is not listed in bimodalCells`);
  }
  for (const key of declaredBimodal) {
    if (!(key in oldFrames)) fail(`bimodalCells lists "${key}", which has no golden at all`);
    else if (!isBimodalGolden(oldFrames[key]))
      fail(`bimodalCells lists "${key}" but its golden carries only one accepted hash — re-seed with --update-goldens --repeat=${BIMODAL_RECORD_SAMPLES} or de-list it`);
  }
  const probe = goldens.probe ?? {};
  const now = { width: refEntry.comp.width, height: refEntry.comp.height, frames: FRAMES, clipFrames: CLIP_F, progress: PROGRESS, modes: MODES };
  if (!UPDATE && probe.width !== undefined) {
    for (const field of ['width', 'height', 'frames', 'clipFrames']) {
      if (probe[field] !== now[field]) fail(`PROBE GEOMETRY CHANGED: ${field} was ${probe[field]}, is now ${now[field]} — the goldens describe a different matrix`);
    }
    for (const field of ['progress', 'modes']) {
      if (JSON.stringify(probe[field]) !== JSON.stringify(now[field])) {
        fail(`PROBE AXIS CHANGED: ${field} was ${JSON.stringify(probe[field])}, is now ${JSON.stringify(now[field])}`);
      }
    }
  }
}

for (const f of semanticFailures) {
  fail(`SEMANTIC: ${f.kind} — ${f.check} (${f.detail})`);
}
for (const k of xpass) {
  fail(`XPASS: "${k}" is listed as knownDefective but now passes every semantic check. If it was fixed, remove it from goldens/transition-matrix.json's knownDefective list in the same commit.`);
}

// --------------------------------------------------------------- goldens ----
if (UPDATE) {
  const merged = { ...oldFrames, ...newFrames };
  // A filtered run must not delete the keys it did not render; an unfiltered
  // one prunes stale keys so a removed kind cannot linger as dead coverage.
  const frames = only.length === 0 ? newFrames : merged;
  const added = Object.keys(frames).filter((k) => !(k in oldFrames));
  const removed = Object.keys(oldFrames).filter((k) => !(k in frames));
  const changed = Object.keys(frames).filter((k) => k in oldFrames && oldFrames[k] !== frames[k]);
  const nextCount = only.length === 0 ? allKinds.length : Math.max(goldens.kindCount ?? 0, allKinds.length);
  if (nextCount < (goldens.kindCount ?? 0) && !ALLOW_SHRINK) {
    fail(`refusing to re-baseline: kind coverage would drop from ${goldens.kindCount} to ${nextCount}. Pass --allow-shrink if a kind was genuinely removed.`);
  } else if (problems.length) {
    // The run already recorded failures — a semantic defect in a kind that is not
    // pinned, an unstable still, a broken coverage guard. Writing goldens anyway
    // would let `--update-goldens` launder exactly the thing the gate is for.
    console.log(`\nNOT writing goldens: this run recorded ${problems.length} failure(s). Fix them, then re-baseline.`);
  } else {
    const next = {
      // Unconditional, NOT `goldens.$comment ?? …`. With the `??` the constant was
      // dead the moment the file had a comment at all, so a corrected description
      // shipped in source while the committed artifact — the thing a reviewer reads
      // first — went on documenting a mechanism that no longer existed.
      $comment: DEFAULT_COMMENT,
      generatedBy: 'examples/layered-minimal/scripts/render-transition-matrix.mjs --update-goldens',
      probe: {
        width: refEntry.comp.width,
        height: refEntry.comp.height,
        frames: FRAMES,
        clipFrames: CLIP_F,
        progress: PROGRESS,
        modes: MODES,
        plateOutgoing: toHex(plateA),
        plateIncoming: toHex(plateB),
      },
      kindCount: nextCount,
      knownDefective: [...knownDefective].sort(),
      semanticXfail: [...semanticXfail].sort(),
      bimodalCells: [...bimodalCells].sort(),
      frames: Object.fromEntries(Object.keys(frames).sort().map((k) => [k, frames[k]])),
    };
    mkdirSync(path.dirname(GOLDEN_FILE), { recursive: true });
    writeFileSync(GOLDEN_FILE, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`\nre-baselined ${path.relative(ROOT, GOLDEN_FILE)}: +${added.length} added, -${removed.length} removed, ~${changed.length} changed`);
    for (const k of [...added.map((k) => `  + ${k}`), ...removed.map((k) => `  - ${k}`), ...changed.map((k) => `  ~ ${k}`)]) console.log(k);
    console.log('REVIEW THE DIFF before committing — a re-baseline is an assertion that the new pixels are correct.');
  }
}

// ---------------------------------------------------------------- report ----
console.log(`\n${n} stills in ${elapsed.toFixed(0)}s → ${path.relative(ROOT, OUT)}`);
if (!UPDATE)
  console.log(
    `goldens: ${results.ok} accepted (${results.secondHash} matched a bimodal cell's SECOND recorded hash), ` +
      `${results.near} same-picture-different-bytes, ${results.drift} drifted, ` +
      `${results.missing} missing, ${results.retried} retried`,
  );
for (const note of notes) console.log(`NOTE  ${note}`);
if (xfail.length) {
  console.log(`\n${xfail.length} EXPECTED semantic failures across ${new Set(xfail.map((f) => f.kind)).size} known-defective kinds (see docs/superpowers/at-cut-transition-findings.md):`);
  for (const f of xfail) console.log(`  xfail ${f.kind} — ${f.check} (${f.detail})`);
}
if (knownDefective.size) {
  console.log(
    `\ngoldens for ${[...knownDefective].sort().join(', ')} record WRONG-BUT-CURRENT pixels — ` +
      'a change to those specific goldens is expected when the defects are fixed, not a regression.',
  );
}
if (problems.length) {
  console.log(`\n${problems.length} FAILURES:`);
  for (const p of problems) console.log(`  ✗ ${p}`);
  process.exit(1);
}
console.log('\nPASS');

// ---------------------------------------------------------------- sheets ----
function writeSheet(kind) {
  const tiles = [];
  for (const mode of MODES) for (const p of PROGRESS) tiles.push(path.join(OUT, `${keyOf(kind, mode, p)}.png`));
  try {
    execFileSync('montage', [
      ...tiles.flatMap((t) => ['-label', path.basename(t, '.png').replace(`${kind}__`, ''), t]),
      '-tile', `${PROGRESS.length}x${MODES.length}`,
      '-geometry', '180x320+4+4',
      '-background', '#222222',
      '-fill', '#ffffff',
      '-pointsize', '11',
      path.join(SHEETS, `${kind}.png`),
    ]);
  } catch (err) {
    notes.push(`contact sheet for ${kind} skipped: ${err.message.split('\n')[0]}`);
  }
}
