#!/usr/bin/env node
/**
 * Renders the at-cut transition probe stills — the evidence behind
 * docs/superpowers/at-cut-transition-findings.md.
 *
 * The kind list is NOT written here. It is read off `getCompositions()`, which
 * returns whatever `src/TransitionMatrix.tsx` registered from
 * `TRANSITION_CATALOG` — so a kind added to the catalog later is probed
 * automatically, with no edit to this file.
 *
 * Bundles ONCE and then drives `renderStill` in a loop; `npx remotion still`
 * would re-bundle per frame, which is minutes rather than seconds across a few
 * hundred stills.
 *
 * Output goes to out/matrix/ (gitignored) as one contact sheet per kind, built
 * with ImageMagick `montage`: rows = mode (enter / exit / cut), columns =
 * progress. The individual stills are throwaway evidence — the findings doc is
 * the deliverable.
 *
 *   node scripts/render-transition-matrix.mjs [kind ...]
 */
import { bundle } from '@remotion/bundler';
import { getCompositions, renderStill } from '@remotion/renderer';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out', 'matrix');
const SHEETS = path.join(ROOT, 'out', 'sheets');

// Must match TransitionMatrix.tsx: 20-frame transition, 60-frame clips.
const FRAMES = 20;
const CLIP_F = 60;
const PROGRESS = [0, 0.25, 0.5, 0.75, 1];

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

const only = process.argv.slice(2);

rmSync(OUT, { recursive: true, force: true });
rmSync(SHEETS, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
mkdirSync(SHEETS, { recursive: true });

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
const comps = (await getCompositions(serveUrl)).filter((c) => c.id.startsWith('Probe-'));

// "Probe-<kind>-<mode>" — mode is the LAST segment, kind is everything between
// (kinds contain dashes: zoom-through, scanline-glitch, …).
const parsed = comps.map((c) => {
  const parts = c.id.split('-');
  const mode = parts.pop();
  parts.shift();
  return { comp: c, kind: parts.join('-'), mode };
});

const kinds = [...new Set(parsed.map((p) => p.kind))].filter((k) => only.length === 0 || only.includes(k));
console.log(`${kinds.length} kinds × ${new Set(parsed.map((p) => p.mode)).size} modes × ${PROGRESS.length} progress points`);

const started = Date.now();
let n = 0;
for (const kind of kinds) {
  for (const mode of ['enter', 'exit', 'cut']) {
    const entry = parsed.find((p) => p.kind === kind && p.mode === mode);
    if (!entry) continue;
    for (const p of PROGRESS) {
      const output = path.join(OUT, `${kind}__${mode}__p${String(p).replace('.', '')}.png`);
      await renderStill({
        composition: entry.comp,
        serveUrl,
        output,
        // Clamp: in `exit` mode the transition's own end (progress 1) lands on
        // the frame one PAST the composition's last, since the exiting window
        // runs to the clip's final frame. p=1 there is really p=0.95 — the last
        // frame that exists.
        frame: Math.min(frameFor(mode, p), entry.comp.durationInFrames - 1),
        overwrite: true,
      });
      n++;
    }
  }
  // Contact sheet: 5 columns (progress) × 3 rows (mode), labelled.
  const tiles = [];
  for (const mode of ['enter', 'exit', 'cut']) {
    for (const p of PROGRESS) tiles.push(path.join(OUT, `${kind}__${mode}__p${String(p).replace('.', '')}.png`));
  }
  execFileSync('montage', [
    ...tiles.flatMap((t) => ['-label', path.basename(t, '.png').replace(`${kind}__`, ''), t]),
    '-tile', `${PROGRESS.length}x3`,
    '-geometry', '180x320+4+4',
    '-background', '#222222',
    '-fill', '#ffffff',
    '-pointsize', '11',
    path.join(SHEETS, `${kind}.png`),
  ]);
  console.log(`  ${kind} — ${n} stills, ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

console.log(`\n${n} stills → ${OUT}\ncontact sheets → ${SHEETS}`);
