# lib/render

Shared "at-the-cut" transition engine for layered-model reel renderers (every brand template consumes it), split into two files: `transition-record.ts` is the pure, Remotion-free "is this a real transition?" gate (`TransitionRecord`, `getTransitionRecord`) and is unit-tested here in core (`lib/editor/src/transition-record.test.ts`); `at-cut-transitions.tsx` is the Remotion engine (`resolveTransition`/`transitionNodeFor`, `wrapRemotionPresentation`, plus a re-export of the pure gate so consumers can import everything from one path).

**`presentationFor` is DELETED** (the "one transition contract" task — see
`docs/superpowers/specs/2026-08-01-unified-transition-contract-design.md`). It
was the one-sided view of a resolved kind (`resolveTransition` null'd out,
with a warning, whenever the kind was a native two-input node), kept alive
through Phase 5 only because six call sites in the PP brand repo's
`web-program-intro` template still drove `TransitionSeries.Transition` off
it. That template is rewritten onto `buildVideoNodes` now, same as every
other template, and a repo-wide sweep found zero remaining production
callers. `resolveTransition` and `getTransitionRecord` are untouched by the
deletion; `buildVideoNodes`/`transitionNodeFor` is the one render path left.

**PHASE 5 TASK 5 — THE FLIP. There is only ONE arm now: `plan`.** A transition node is `{ plan: (props) => TransitionComposite }`, called through `buildVideoNodes` (`video-track.tsx`), which applies the returned description to the mounts that ALREADY EXIST — two always-mounted, style-only shells (`video-track-plan.tsx`'s `LayerShell`) that wrap every item for its whole life — rather than instantiating the clip a second time. Nothing is ever relocated in the tree, so nothing ever remounts. A plan's media-free `PlateLayer`s and its materialised reel-edge plate are emitted as real timeline siblings between the two item Sequences; its `post` (`filter`/`transform` only) goes on the track wrapper. `buildVideoNodes` keeps its `React.ReactNode[]` signature and returns a **single-element array** holding the always-mounted wrapper — unchanged, because 12 hand-rolled brand call sites depend on it.

**What used to be here, historically (Phase 4 Task 1.3 → Phase 5 Task 5).** Before this task, a node could ALSO expose `composite` — a JSX component `AtCutTransition` (a *boundary* compositor) called once with `(from, to, progress)` where `from`/`to` were subtrees the component instantiated itself. One-sided presentations — the five official `@remotion/transitions` ones, and any brand registration — were LIFTED into that two-input form by `fromRemotionPresentation`. That arm required re-basing each clip into the boundary's own coordinates and blanking the clip's own Sequence for the frames the boundary took over (`ItemBody`), which is what forced the exact remount defect this whole phase exists to remove: React reconciles by tree position, and content rendered inside the boundary for some frames and under its own Sequence for the rest is two mounts, not one moved mount. Stages 0-4 migrated every catalog kind off that arm onto `plan`, one mechanism at a time; Task 5 deleted the arm itself — `AtCutTransition`, `fromRemotionPresentation`, `TransitionLayer`'s public export, `ItemBody`, and the boundary `Sequence`/`rebased()` in `video-track.tsx`, plus `lib/render/preview-environment.ts` (its only consumer) — once nothing resolved to it any more. **`BOUNDARY_TAIL` is NOT among the deletions** — it survives (`video-track.tsx:64`), repurposed: it now sizes the plan boundary's own Sequence (`durationInFrames={b.frames + BOUNDARY_TAIL}`, `:278`), because a plan boundary owns the same inclusive progress-1 frame the old boundary Sequence did. `wrapRemotionPresentation` is `fromRemotionPresentation`'s full replacement: it lifts a one-sided presentation into `plan`/`wrap` instead, universally (core's own kinds and any brand renderer's alike — the old `WRAP_PLAN_KINDS` gate that limited this to a named subset is gone too, since there is no second lift target left to gate against). Full account: `.superpowers/sdd/phase5-single-mount-design/task-5-report.md`.

The engine half is unit-tested here too, in `lib/editor/src/at-cut-transitions.test.tsx` — but only for its **wiring**, and the file says so at the top. Driven off `TRANSITION_CATALOG` (never a hardcoded kind list, so a kind added to the catalog is covered the moment it exists), it pins that every kind resolves to a node, mounts in both directions across the progress range without throwing, and receives its authored params under the key the node/presentation actually reads — plus accent-key→hex resolution through a brand palette. It settles **nothing** about appearance.

> **⚠ The paragraph below is HISTORICAL.** All **four** defects it names —
> `checkerboard`'s exiting no-op, `pixelate`'s opaque-black root, and
> `scanline-glitch`/`wipe` both painting opaquely at entering progress 0 — were
> FIXED in Phase 4 Task 2.1: all four are now native two-input nodes and the
> `it.fails` pins that recorded them are gone (`grep -n 'it\.fails'
> lib/editor/src/at-cut-transitions.test.tsx` returns nothing). Graded in
> `docs/superpowers/phase4-migrations.md` § Task 2.1. The catalog is also **21**
> kinds now, not 20 (Task 2.3 added `fade-to-color`). **CORRECTED IN PLACE — overcounted by one.**
> `TRANSITION_CATALOG` has **20** entries at this HEAD (counted directly in
> `lib/reel-config-base/transition-schema.ts`), so the pre-Task-2.3 catalog was 19, not 20.

~~**Four** known defects are recorded as `it.fails` rather than fixed: `checkerboard` is a no-op in the exiting direction; `pixelate`'s root is unconditionally opaque black, which at a cut hides the neighbouring clip for the duration of the transition window instead of blending with it; and `scanline-glitch` and `wipe` both paint opaquely at entering progress 0, so at a cut they replace the outgoing clip instead of dissolving into it.~~ Appearance *was* settled separately, by rendering: see `docs/superpowers/at-cut-transition-findings.md` (20 kinds after the Phase 4 removal of the brand-named fade kind, both directions) and the at-cut entry in `docs/superpowers/HANDOFF.md`.

Neither file defines what a transition *is*: the vocabulary lives in `lib/reel-config-base/transition-schema.ts` (the catalog `TransitionSchema` and the editor's `TRANSITION_KINDS` are both built from). `resolveTransition`'s internal `PRESENTATIONS` map maps it to Remotion via a `Record<TransitionKind, …>`, so adding a kind to the catalog produces a **compile error** here until the renderer handles it — rather than a kind that silently plays as a hard cut.

`layered-composition-props.ts` is on the pure side of that split too — it deliberately has no `remotion` import. It is the one definition of the `<Composition>` prop bundle every layered reel needs (`layeredCompositionProps`, `layeredDurationInFrames`): id/component/fps/width/height passthrough, the placeholder `durationInFrames`, and the `calculateMetadata` that derives the real duration from `meta.totalDurationMs` with the exported `MIN_FRAMES` (60-frame) floor. A brand `Root.tsx` spreads it onto `<Composition>` alongside its own `defaultProps` literal. Unit-tested in `lib/editor/src/layered-composition-props.test.ts`. The editor's own `lib/editor/host/host-duration.ts` (`framesForReel`) deliberately does NOT reuse `layeredDurationInFrames` — the editor's timeline must extend past the authored total when an item is dragged beyond it — but it imports this file's `MIN_FRAMES` rather than hardcoding a second copy of the floor.

The same split applies to brand font loading: `fonts.ts` is the pure side — `FontSpec`, `fontFaceDescriptors` — normalising a brand's font list into `FontFace` descriptors (defaulting `weight` to `'400'`, `style` to `'normal'`, and — critically — `display` to `'block'` so a render never bakes in a fallback-font frame), with no `remotion` import, unit-tested in `lib/editor/src/fonts.test.ts`. `load-fonts.ts` is the Remotion shell — `loadBrandFonts` — that turns those descriptors into real `FontFace` objects, registers them via `delayRender`/`continueRender`, and is unit-tested here, in `lib/editor/src/load-fonts.test.ts`, against a mocked `remotion` (`remotion` itself is a declared `lib/editor` devDependency in its own right, alongside `@remotion/player`). The distinction `at-cut-transitions.tsx` rests on is not "importing `remotion`" and no longer "needing a package core lacks" either — it is simply that a module importing `remotion` can be imported against a mock here but never *rendered*. Its `{ timeoutInMilliseconds: 120_000, retries: 2 }` defaults are not padding: under multi-tab render concurrency, fresh browser contexts re-reading TTFs from disk can exceed Remotion's 28s default under I/O contention, which is the flake that used to force `--concurrency=1`. Call `loadBrandFonts` once at module scope of the brand's reel component so Studio, the editor Player, and a headless render all pick it up.

**The spread must be written inline.** The editor's surgical reader/writer (`lib/editor/src/default-props-writer.ts`) resolves a `<Composition>`'s `id` through a `{...layeredCompositionProps({ id: '…', … })}` spread by reading the `id:` property straight out of the call's first-argument object literal — it does not evaluate the call. `{...layeredCompositionProps(OPTS)}` with a hoisted `OPTS` const has no literal to read and fails loudly instead of guessing. Always write the options object inline on `<Composition>`, as every current `Root.tsx` does.

## Preview vs. render — the divergence is gone (Phase 5 Task 5)

Studio/the editor `<Player>` ("preview") and a headless render extract frames differently — a
preview keeps a live DOM across frames and reconciles it the way any React app does, while a
render calls Remotion's frame-extraction independently per frame with no persistent DOM. That gap
used to matter here: Phase 4 Task R1 found that `buildVideoNodes` (`video-track.tsx`) mounted an
item's media at two different POSITIONS in the React tree across a transition boundary's frames
(the `composite` arm's re-based copy vs. the item's own Sequence), which React reconciles by tree
position — so the element unmounted and remounted twice per boundary in a live preview, visible as
a colour flash. Task R1's fixes (hiding instead of unmounting a blanked frame; premounting the
boundary's rebased copy) were **preview-gated** on `isPreviewEnvironment()`
(`preview-environment.ts`), because the defect itself only manifested where a persistent DOM
existed to flash.

**Phase 5 Task 5 deletes all of it** — `ItemBody`, the boundary `Sequence`/`rebased()`,
`isPreviewEnvironment()` and `preview-environment.ts` itself — because the
`composite` arm that made the re-based copy necessary is gone (every catalog kind is `plan` now,
Stages 0-4). The `plan` arm was NEVER preview-gated in the first place: a plan's shells
(`video-track-plan.tsx`'s `LayerShell`) are mounted life-long, unconditionally, in every
environment, since Task 1.2. So the preview/render divergence this section used to document does
not move to a new gate — it simply stops existing. This is the single largest maintenance win of
the whole phase: one code path, one set of pixels, everywhere.

`transitionNodeFor`'s memoization cache (`at-cut-transitions.tsx`) is UNCHANGED by this and remains
universal, not preview-gated — it always was pure caching of a pure function's result and never
depended on the arm split. See its own doc comment for the argument (every transition's own
per-mount state is limited to a handful of unseeded random SVG element `id`s, re-derive with
`git grep -n "useState(() =>" lib/transitions/` rather than trusting any count carried forward).

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

`lib/editor`'s tsconfig `include` names `src`/`app`/`host`/`../theming` **and, explicitly, five files from this directory** — `at-cut-transitions.tsx`, `audio-track.tsx`, `layered-composition.tsx`, `video-track.tsx` and `load-fonts.ts`. They are *declared* rather than left to arrive through `src/at-cut-transitions.test.tsx`'s and `load-fonts.test.ts`'s imports, so deleting a test can't silently shrink the gate. The rest of this directory and all of `lib/transitions` still ride in transitively from those entry points — which is why `lib/editor/tsconfig.json` gained the same `@remotion/transitions*` and `react`/`react/jsx-runtime` `paths` that `examples/layered-minimal` carries. In total that program pulls in **14** `lib/render` files (the five named directly above, plus `audio-gain.ts`, `fonts.ts`, `layered-composition-props.ts`, `overlay-anchor.ts`, `overlay-routing.ts`, `transition-record.ts`, `video-track-layout.ts`, `video-track-plan.tsx`, `warn-once.ts`, riding in transitively — PHASE 5 TASK 5: `preview-environment.ts` is deleted and drops off this list; `video-track-plan.tsx` was already transitively reachable and keeps the count at 14, re-derived with `npx tsc --noEmit --listFiles`, not carried forward from before this task) and **16** `lib/transitions` files (`index.ts`, `edge-plate.tsx`, all 13 presentations, **and `TransitionGallery.tsx`** — it arrives through `lib/editor/src/transition-gallery*.test.tsx`, not the other way round) — check with `npx tsc --noEmit --listFiles`; the counts grow as presentations are added, re-derive rather than trust this line. (Side effect worth knowing: those mappings also resolved 25 of `lib/editor`'s 29 pre-existing errors, which were unresolved-`react`/`remotion` noise in the out-of-tree `../theming` files. Its baseline is now **3**.)

The authoritative surface for the render/transitions **`.tsx` components** is still **`examples/layered-minimal`**, core's only real Remotion install — it is the one that also enforces file-count coverage. (It does not reach every file in `lib/render/`: `load-fonts.ts` and `fonts.ts` are not in that program at all — `load-fonts.ts` is checked only by `lib/editor`'s `tsc` gate, where it is named directly in that tsconfig's `include` — precisely so it no longer depends on `load-fonts.test.ts`'s import surviving; see `docs/superpowers/HANDOFF.md`'s Minor-4 note.)

```bash
cd examples/layered-minimal && npm run typecheck    # baseline: 0 errors
```

It reaches these out-of-tree files through the same class of workaround as the `resolve.modules` line above, expressed as tsconfig `paths`. Read **`docs/superpowers/core-typecheck-gate.md`** before editing that tsconfig — notably: `react` must map to `@types/react` (mapping it to the JS package silently `any`s the whole render surface), and `@remotion/transitions/*` declarations live under `dist/presentations/`, not `dist/esm/`.
