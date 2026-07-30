# lib/render

Shared "at-the-cut" transition engine for layered-model reel renderers (every brand template consumes it), split into two files: `transition-record.ts` is the pure, Remotion-free "is this a real transition?" gate (`TransitionRecord`, `getTransitionRecord`) and is unit-tested here in core (`lib/editor/src/transition-record.test.ts`); `at-cut-transitions.tsx` is the Remotion engine (`resolveTransition`/`transitionNodeFor`/`presentationFor`, `fromRemotionPresentation`, `TransitionLayer`, `AtCutTransition`, plus a re-export of the pure gate so consumers can import everything from one path).

**Since Phase 4 Task 1.3 a transition is ONE NODE WITH TWO INPUTS.** `AtCutTransition` is a *boundary* compositor: it resolves one node and calls it ONCE with `(from, to, progress)`, where `from` is the outgoing clip, `to` the incoming one, and either may be `null` — which is how the reel's leading and trailing edges stop being special cases. It is no longer a per-item wrapper invoked twice with a `direction`; that was `TransitionSeries`' shape and the root of the defect family (seven kinds that no-op when exiting, `checkerboard`'s empty cells, `wipe`'s two beats running at once, a trailing edge that drew nothing). One-sided presentations — the five official `@remotion/transitions` ones, and any brand registration written against the Task 1.2 contract — are LIFTED into the two-input form by `fromRemotionPresentation`, so nothing that already worked had to migrate. `buildVideoNodes` (`video-track.tsx`) emits one `Sequence` per boundary and blanks each clip's own `Sequence` for the frames the boundary took over, so nothing is painted twice. Task 1.3 was behaviour-preserving and measured so: `examples/layered-minimal`'s `npm run pixel-gate:strict` reported 293 of 300 cells byte-identical with 0 same-picture-different-bytes; the 7 that moved were all `glitch`, the one presentation that reads `useCurrentFrame()` itself and therefore changes clock when its mount moves from the clip to the boundary (see `docs/superpowers/phase4-migrations.md` §1.3-d). The split originally existed because `lib/editor` had no `@remotion/transitions`, so the engine half could not even be imported here. **That is no longer true** — both `remotion` and `@remotion/transitions` are now declared `lib/editor` devDependencies — so the split is now about what a unit test can *settle*, not what it can load: **core can render** — `examples/layered-minimal` is a complete, installed Remotion project (`npx remotion still src/index.ts MinimalReel out/probe.png --frame=45` bundles and renders a real PNG there, exit 0) — so whether a transition looks right *at a cut* is settleable here, by authoring a reel literal in `examples/layered-minimal` that exercises the transition at a cut and rendering a still. See `docs/superpowers/HANDOFF.md`'s at-cut visual-confirmation risk entry.

Accordingly, the engine half now *is* unit-tested here too, in `lib/editor/src/at-cut-transitions.test.tsx` — but only for its **wiring**, and the file says so at the top. Driven off `TRANSITION_CATALOG` (never a hardcoded kind list, so a kind added to the catalog is covered the moment it exists), it pins that every kind resolves to a presentation, mounts in both directions across the progress range without throwing, and receives its authored params under the key the presentation actually reads — plus accent-key→hex resolution through a brand palette, and `AtCutTransition`'s progress ramps and compositing order. It settles **nothing** about appearance.

> **⚠ The paragraph below is HISTORICAL.** All **four** defects it names —
> `checkerboard`'s exiting no-op, `pixelate`'s opaque-black root, and
> `scanline-glitch`/`wipe` both painting opaquely at entering progress 0 — were
> FIXED in Phase 4 Task 2.1: all four are now native two-input nodes and the
> `it.fails` pins that recorded them are gone (`grep -n 'it\.fails'
> lib/editor/src/at-cut-transitions.test.tsx` returns nothing). Graded in
> `docs/superpowers/phase4-migrations.md` § Task 2.1. The catalog is also **21**
> kinds now, not 20 (Task 2.3 added `fade-to-color`).

~~**Four** known defects are recorded as `it.fails` rather than fixed: `checkerboard` is a no-op in the exiting direction; `pixelate`'s root is unconditionally opaque black, which at a cut hides the neighbouring clip for the duration of the transition window instead of blending with it; and `scanline-glitch` and `wipe` both paint opaquely at entering progress 0, so at a cut they replace the outgoing clip instead of dissolving into it.~~ Appearance *was* settled separately, by rendering: see `docs/superpowers/at-cut-transition-findings.md` (20 kinds after the Phase 4 removal of the brand-named fade kind, both directions) and the at-cut entry in `docs/superpowers/HANDOFF.md`.

Neither file defines what a transition *is*: the vocabulary lives in `lib/reel-config-base/transition-schema.ts` (the catalog `TransitionSchema` and the editor's `TRANSITION_KINDS` are both built from). `presentationFor` maps it to Remotion via a `Record<TransitionKind, …>`, so adding a kind to the catalog produces a **compile error** here until the renderer handles it — rather than a kind that silently plays as a hard cut.

`layered-composition-props.ts` is on the pure side of that split too — it deliberately has no `remotion` import. It is the one definition of the `<Composition>` prop bundle every layered reel needs (`layeredCompositionProps`, `layeredDurationInFrames`): id/component/fps/width/height passthrough, the placeholder `durationInFrames`, and the `calculateMetadata` that derives the real duration from `meta.totalDurationMs` with the exported `MIN_FRAMES` (60-frame) floor. A brand `Root.tsx` spreads it onto `<Composition>` alongside its own `defaultProps` literal. Unit-tested in `lib/editor/src/layered-composition-props.test.ts`. The editor's own `lib/editor/host/host-duration.ts` (`framesForReel`) deliberately does NOT reuse `layeredDurationInFrames` — the editor's timeline must extend past the authored total when an item is dragged beyond it — but it imports this file's `MIN_FRAMES` rather than hardcoding a second copy of the floor.

The same split applies to brand font loading: `fonts.ts` is the pure side — `FontSpec`, `fontFaceDescriptors` — normalising a brand's font list into `FontFace` descriptors (defaulting `weight` to `'400'`, `style` to `'normal'`, and — critically — `display` to `'block'` so a render never bakes in a fallback-font frame), with no `remotion` import, unit-tested in `lib/editor/src/fonts.test.ts`. `load-fonts.ts` is the Remotion shell — `loadBrandFonts` — that turns those descriptors into real `FontFace` objects, registers them via `delayRender`/`continueRender`, and is unit-tested here, in `lib/editor/src/load-fonts.test.ts`, against a mocked `remotion` (`remotion` itself is a declared `lib/editor` devDependency in its own right, alongside `@remotion/player`). The distinction `at-cut-transitions.tsx` rests on is not "importing `remotion`" and no longer "needing a package core lacks" either — it is simply that a module importing `remotion` can be imported against a mock here but never *rendered*. Its `{ timeoutInMilliseconds: 120_000, retries: 2 }` defaults are not padding: under multi-tab render concurrency, fresh browser contexts re-reading TTFs from disk can exceed Remotion's 28s default under I/O contention, which is the flake that used to force `--concurrency=1`. Call `loadBrandFonts` once at module scope of the brand's reel component so Studio, the editor Player, and a headless render all pick it up.

**The spread must be written inline.** The editor's surgical reader/writer (`lib/editor/src/default-props-writer.ts`) resolves a `<Composition>`'s `id` through a `{...layeredCompositionProps({ id: '…', … })}` spread by reading the `id:` property straight out of the call's first-argument object literal — it does not evaluate the call. `{...layeredCompositionProps(OPTS)}` with a hoisted `OPTS` const has no literal to read and fails loudly instead of guessing. Always write the options object inline on `<Composition>`, as every current `Root.tsx` does.

## Preview vs. render, and what is actually preview-gated

Studio/the editor `<Player>` ("preview") and a headless render extract frames differently — a
preview keeps a live DOM across frames and reconciles it the way any React app does, while a
render calls Remotion's frame-extraction independently per frame with no persistent DOM. That gap
is real and has produced a real regression: Phase 4 Task R1 found that `buildVideoNodes`
(`video-track.tsx`) mounts an item's media at two different POSITIONS in the React tree across a
transition boundary's frames, which React reconciles by tree position — so the element unmounted
and remounted twice per boundary in a live preview, visible as a colour flash. A render is
unaffected regardless, because there is no persistent DOM to flash.

**Not everything R1 shipped is preview-gated, and that distinction matters for anyone changing
this file.** Three fixes landed:

1. Hiding instead of unmounting a blanked frame (`video-track.tsx` ~`:81`) — gated on
   `isPreviewEnvironment()` (`preview-environment.ts`). Outside preview this branch never runs.
2. Premounting the boundary's rebased copy (`video-track.tsx` ~`:182`) — also gated on
   `isPreviewEnvironment()`.
3. **The `transitionNodeFor` memoization cache** (`at-cut-transitions.tsx` ~`:449`) — **universal,
   not preview-gated**. It runs unconditionally, preview or render, because it is pure caching of
   a pure function's result: it changes nothing about what a given (transition record, palette,
   size) resolves to, only whether two calls with the same inputs get back the identical node
   reference or two equivalent-but-distinct ones.

Calling all three "preview-gated, so the render path is unchanged by construction" — which this
programme's own review told reviewers more than once — overstates the guarantee for #3
specifically: it was never gated OUT of the render path, because it never entered it in a way
that could change output in the first place. The reasoning that makes it safe is an ARGUMENT, not
a structural guarantee: every current transition presentation's own per-mount state is limited to
FOUR unseeded random SVG element `id`s — `burn.tsx` and `glitch.tsx` (`useState(() =>
String(random(null))...)`, one mask/filter id each), and, since Phase 5, `checkerboard.tsx`'s
default `squareAnimation: 'fade'` path (Task 0.1) and `scanline-glitch.tsx` (Task 0.2) — both the
identical `random(null)`-derived pattern reused verbatim from `burn.tsx`/`glitch.tsx` rather than a
new technique each time — no presentation holds any OTHER
`useState` across frames, and none runs a `useEffect`, so handing back a cached node instead of a
freshly-constructed one changes nothing a render (or a preview, past the R1/R2 fixes) can observe:
the cached node still re-derives a fresh random id on its own next mount, exactly as an uncached
one would. **The first transition presentation that accumulates frame state in `useState` OTHER
THAN a random, per-mount, never-revisited id breaks that argument**, not the cache's own
correctness, and would need this section re-read before assuming the cache is still inert for it.
This count has drifted before — re-derive it (`git grep -n "useState(() =>" lib/transitions/`)
rather than carrying it forward the next time a presentation changes. See
`docs/superpowers/HANDOFF.md`'s Task R1/R2 entry for the fuller account and the corrected framing.

## Consumption requirement (webpack `resolve.modules`)

`at-cut-transitions.tsx` does a **runtime** import of `@remotion/transitions/*`. When a project imports it via the `@video-toolkit/lib` alias, the importing file resolves to `toolkit/lib/render/…`, which lives **outside** the project's own directory tree — so webpack's default module resolution (walking up from the importing file's ancestors) never reaches the project's `node_modules`, where `@remotion/transitions` is actually installed. Any consuming project's `remotion.config.ts` must therefore add its own `node_modules` to `resolve.modules`:

```ts
Config.overrideWebpackConfig((c) => ({
  ...c,
  resolve: {
    ...c.resolve,
    modules: [path.resolve(process.cwd(), 'node_modules'), 'node_modules'],
    alias: { '@video-toolkit/lib': toolkitLib, /* … */ },
  },
}));
```

Without it the bundle fails with `Can't resolve '@remotion/transitions/…'`. (The brand templates and their projects already carry this.)

The **test runner needs the same class of workaround**, for the same reason, and `lib/editor/vitest.config.ts` carries it: a small `resolveId` plugin re-resolves `@remotion/transitions*` from `lib/editor` (a plain Vite string alias can't do it — the package exposes its subpaths through an `exports` map, so a prefix rewrite to a directory produces a path that doesn't exist). That config also sets `esbuild.jsx: 'automatic'`, matching the `"jsx": "react-jsx"` every tsconfig here uses: Vite's default is the *classic* runtime, which needs `React` in lexical scope, and this file legitimately uses JSX without importing React.

## Type-check gate

`lib/editor`'s tsconfig `include` names `src`/`app`/`host`/`../theming` **and, explicitly, five files from this directory** — `at-cut-transitions.tsx`, `audio-track.tsx`, `layered-composition.tsx`, `video-track.tsx` and `load-fonts.ts`. They are *declared* rather than left to arrive through `src/at-cut-transitions.test.tsx`'s and `load-fonts.test.ts`'s imports, so deleting a test can't silently shrink the gate. The rest of this directory and all of `lib/transitions` still ride in transitively from those entry points — which is why `lib/editor/tsconfig.json` gained the same `@remotion/transitions*` and `react`/`react/jsx-runtime` `paths` that `examples/layered-minimal` carries. In total that program pulls in **14** `lib/render` files (the five named directly above, plus `audio-gain.ts`, `fonts.ts`, `layered-composition-props.ts`, `overlay-anchor.ts`, `overlay-routing.ts`, `preview-environment.ts`, `transition-record.ts`, `video-track-layout.ts`, `warn-once.ts`, riding in transitively) and **16** `lib/transitions` files (`index.ts`, `edge-plate.tsx`, all 13 presentations, **and `TransitionGallery.tsx`** — it arrives through `lib/editor/src/transition-gallery*.test.tsx`, not the other way round) — check with `npx tsc --noEmit --listFiles`; the counts grow as presentations are added, re-derive rather than trust this line. (Side effect worth knowing: those mappings also resolved 25 of `lib/editor`'s 29 pre-existing errors, which were unresolved-`react`/`remotion` noise in the out-of-tree `../theming` files. Its baseline is now **3**.)

The authoritative surface for the render/transitions **`.tsx` components** is still **`examples/layered-minimal`**, core's only real Remotion install — it is the one that also enforces file-count coverage. (It does not reach every file in `lib/render/`: `load-fonts.ts` and `fonts.ts` are not in that program at all — `load-fonts.ts` is checked only by `lib/editor`'s `tsc` gate, where it is named directly in that tsconfig's `include` — precisely so it no longer depends on `load-fonts.test.ts`'s import surviving; see `docs/superpowers/HANDOFF.md`'s Minor-4 note.)

```bash
cd examples/layered-minimal && npm run typecheck    # baseline: 0 errors
```

It reaches these out-of-tree files through the same class of workaround as the `resolve.modules` line above, expressed as tsconfig `paths`. Read **`docs/superpowers/core-typecheck-gate.md`** before editing that tsconfig — notably: `react` must map to `@types/react` (mapping it to the JS package silently `any`s the whole render surface), and `@remotion/transitions/*` declarations live under `dist/presentations/`, not `dist/esm/`.
