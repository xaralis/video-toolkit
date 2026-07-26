# Handoff — core architecture rework

**Last updated:** 2026-07-26, at the end of `fix/core-has-remotion` — a correction branch
between Phase 2 and Phase 3. Phase 2 completed on `refactor/phase2-core-shell` (2026-07-25).

This file is the durable record across sessions. The working ledger
(`.superpowers/sdd/progress.md`) is **gitignored** and will not survive a
`git clean` — anything that must outlive a session belongs here instead.

---

## The programme

The toolkit is an AI-native video framework: the AI does the heavy lifting (cut,
theming, media handling, rendering) and the editor exists only for final tuning.
For that to hold, **core must own every reusable mechanism**, and a brand repo
must contribute only theming plus genuinely exotic one-off components.

The full audit and phase plan live at
`~/.claude/plans/vyvijime-tu-framework-kter-luminous-salamander.md`. Phases:

| Phase | What | Status |
|---|---|---|
| 0 | Unblock (fast-forward core, pin zod) | ✅ closed in Phase 2 — `docs/zod-version.md`; roost's pin is a brand migration |
| 1 | Subtract — remove drift surfaces | ✅ merged `73bd891` |
| 2 | Core owns the brand shell (editor host, composition wiring, config, fonts) | ✅ `refactor/phase2-core-shell` |
| 3 | Close the extension contract (registries, effects, generators, captions) | ⬜ |
| 4 | Tighten the model (real schemas, pre-save validation) | ⬜ |
| 5 | NLE alignment (effect stack, music track, transition entities, media pool) | ⬜ |
| 6 | `brand.json` becomes the theming contract | ⬜ |

---

## Phase 1 outcome

18 commits, 116 files, **+4197 / −6998 (net −2801)**. 47 test files / **485 tests**
green. `tsc --noEmit` held at its then-34-error pre-existing baseline — verified by
diffing error *sets* against a worktree at the branch point, not by comparing counts.
(That 34 is **historical**. The live baseline is 4 — see "Working conventions" below.)

What landed: the retired segment-era editor and the entire legacy theming system
deleted; four definitions of a transition collapsed into one `CATALOG` in
`lib/reel-config-base/transition-schema.ts`; six previously-unreachable transitions
wired in; every brand constant evicted from core's schema, derivation and editor UI;
duplicated `AccentColor`/`Crop` declarations collapsed; `examples/hello-world`
replaced by `examples/layered-minimal`, which renders and is pinned by a test that
runs the real `readDefaultProps` against it.

Two live bugs fixed: montage transitions were silently dropped at every boundary,
and editing an array in the editor destroyed authored comments and `as const`.

---

## Phase 2 outcome

The whole branch, re-derived from `git log`/`git diff --stat` rather than carried forward from an
earlier count: 18 commits (`bb9a89d..8351451` — every commit since Phase 1 merged, including the
Phase 2 plan doc's own commit), 40 files, **+4035 / −80**, excluding the 2007-line plan document
committed at the branch point (`docs/superpowers/plans/2026-07-25-phase2-core-owns-brand-shell.md`);
including that file, 41 files / **+6042 / −80**. 55 test files /
**561 tests** green. `tsc --noEmit` in `lib/editor` held at its then-34-error
pre-existing baseline — verified by diffing error *sets* against a worktree at the
merge base (`bb9a89d`); the two sets were byte-identical, no line added or removed.
(Both figures are **historical**: the live numbers are 57 files / 650 tests and a
4-error `tsc` baseline — see "Working conventions" below.)
The brand-leak gate returns exactly its 2 known pre-existing hits (comments in
`lib/theming/segment/SegmentMedia.tsx` and `lib/transitions/presentations/burn.tsx`).

What landed — five mechanisms that each brand repo had its own copy of:

- **`lib/render/layered-composition-props.ts`** — `layeredCompositionProps` +
  `layeredDurationInFrames`, replacing every brand `Root.tsx`'s hand-copied
  `calculateMetadata`, its 60-frame floor and its throwaway `durationInFrames`.
  This also required teaching `lib/editor/src/default-props-writer.ts` to resolve a
  composition id arriving through a `{...layeredCompositionProps({ id })}` spread —
  and hardening it: an allowlisted callee, first-argument-only, and a throw on a
  duplicate id (which previously picked `comps[0]` silently).
- **`lib/render/{fonts.ts,load-fonts.ts}`** — one `loadBrandFonts`, with the
  render-concurrency hardening (`timeoutInMilliseconds: 120_000, retries: 2`) that
  existed in exactly one of the three brand copies now everyone's default.
- **`lib/project/{paths,remotion-config,vitest-config}.ts` + `tsconfig.base.json`** —
  one home for the `zod$` single-instance alias, the webpack `resolve.modules` fix
  and the `toolkit/lib` `existsSync` guard.
- **`lib/editor/host/*`** — `EditorHost` + `mountEditorHost` on the browser side,
  `createEditorPlugin` + `createEditorViteConfig` + `formatWithProjectPrettier` on
  the Node side, plus the extracted primitives (`framesForReel`,
  `attachCropGestures`, the toolbar chrome). A brand's `.editor/` drops from ~730 lines
  across `main.tsx` + `vite.config.mts` + `editor-plugin.mts` to **33 lines (PP) / 29 (roost)**
  across those same two files (`editor-plugin.mts` is deleted; `index.html`, 12 more lines,
  is unchanged — **45 / 41** across the three files that remain in `.editor/`).
- **`docs/zod-version.md`** — the zod contract: exactly `3.22.3`, decided by
  **Remotion**, not by core. Remotion 4.0.425 (PP + core's example) is zod-3-only;
  4.0.489 (roost) accepts both; the intersection is one version. Core is nearly
  major-agnostic (560/561 under zod 4.4.3) — the one divergence, an unbounded
  `z.number().minValue` reading `-Infinity` instead of `null`, was fixed with a
  `Number.isFinite` guard in `transition-schema.ts`.

**Paste-ready brand migrations: `docs/superpowers/phase2-migrations.md`.** That file
carries Phase 1's five pending items forward too, so it alone is enough to move a
brand repo from its current pin.

---

## `fix/core-has-remotion` outcome (between Phase 2 and Phase 3)

Not a phase — a correction. Phase 2 carried forward a **false premise**: that core has no
`remotion`, therefore anything importing it cannot be tested here. That premise was written
into this file, into `lib/` comments, and into the reasoning for Phase 2's top residual risk.
It was wrong, and it cost coverage. Four tasks:

1. **Declared what was already installed.** `remotion@4.0.498` and
   `@remotion/transitions@4.0.498` in `lib/editor/package.json` — `remotion` had always
   resolved there as `@remotion/player`'s hard dependency. Added `load-fonts` unit coverage
   via `vi.mock('remotion')`, and a tsconfig `paths` entry for the out-of-tree bare
   specifiers.
2. **Made `examples/layered-minimal` a type-check gate** over `lib/render/` and
   `lib/transitions/`, with a coverage guard that fails if the checked file count shrinks.
   `docs/superpowers/core-typecheck-gate.md`.
3. **Wiring coverage for every at-cut transition kind** (all 20, derived from the catalog),
   which surfaced the two `it.fails`-pinned defects recorded further down.
4. **This record**, corrected.

Net effect on the gates: tests 561 → **650**, editor `tsc` 34 → **4**, and a third gate that
did not exist before. Phase 2's top residual risk: **closed** (see below).

---

## ⚠️ Pending brand migrations — apply when the submodule pin bumps

**→ `docs/superpowers/phase2-migrations.md` is the authoritative, paste-ready
document.** It has complete before/after file contents per brand repo, the two
hard-won rules (config files import core by *relative* path; a template's own
`tsconfig.json` must still declare `@video-toolkit/lib/*`), and a suggested order.
The summary below is an index, not a substitute.

Phases 1 and 2 were both deliberately **core-only**. Phase 1 queued five migrations;
Phase 2 queues seven more (A–G in that document) and **retires Phase 1's #4**.

1. **roost — `withTransitionOverrides`** *(tsc-caught)*
   `projects/roost-reel-01/src/LayeredRoostReel.tsx:110` spreads `Transition | undefined`,
   which yields `kind?:` and no longer satisfies the tightened `VideoItem['transitionOut']`.
   Core now exports `withTransitionOverrides()` for exactly this. One file — the template
   is a shim with no spread. Rendering is unaffected; nothing parses at render time.

2. **PP — union mirror** *(tsc-caught)*
   `projects/pp-05-zastupitelsky-klub/src/config/types.ts:18` hand-mirrors the transition
   union and needs `color?: string`. Only that project; the template has no such mirror.

3. **roost — drop `applyEndpoint`** *(tsc-caught)*
   `templates/roost-reels/src/overlays/TextOverlay.tsx:43` and its vendored copy in
   `projects/roost-reel-01/`. **This is a PURE DELETION of `applyEndpoint={false}`.**
   Do **not** pass an `endpointKey`: roost deliberately has the endpoint rule off, and
   absent `endpointKey` now means off. Passing one would switch on an accent rule roost
   disabled and change its rendered captions. PP needs nothing.

4. **All editor hosts — pass `meta`** — **✅ SUPERSEDED BY PHASE 2. DO NOT HAND-EDIT.**
   This was **14 call sites**: 12 PP (`templates/campaign-reels/.editor` + 11
   `projects/pp-*/.editor`) and 2 roost (`templates/roost-reels/.editor` +
   `projects/roost-reel-01/.editor`) — re-verified against both repos.
   Core's `EditorHost` passes `meta` to **both** `LayeredTimeline` and
   `LayeredInspector` itself, so adopting `mountEditorHost` (Phase 2 migration **E**)
   fulfils this at all 14 sites as a side effect. The 14-file hand-edit is wasted work
   and would be overwritten. Caveat: passing an *actual* `EditorMeta` still needs the
   brand to author one — neither brand has a `src/config/editor-meta` module today.

5. **PP web-program-intro — pass the palette** *(SILENT, latent)*
   `projects/pp-program-{klima,obvody,verejny-prostor}/src/WebProgramIntro.tsx:26` calls
   `presentationFor(t, { width, height })` with no palette, so a `wipe` carrying an accent
   key would resolve to `#000` instead of the brand colour. Latent only — there is currently
   zero `kind: 'wipe'` in any project. Pass `palette: theme.accentSlots`.
   Related: the old wipe presentation defaulted an unset colour to **lime**; it is now `#000`.
   Intended (core must not default to a brand colour), affects nothing today.

---

## Carried into later phases

**Phase 3 is next** — close the extension contract (registries, effects, generators,
captions).

**Deliberately NOT done in Phase 2, now a Phase 3 task:**
`video_toolkit/sync_template.py:136,141` still mirrors only
`templates/<t>/src → projects/<p>/src`, so it does **not** carry `.editor/`. With the
host in core, `.editor/` is 45 (PP) / 41 (roost) lines across three files that rarely change, which
lowers the cost a lot — but the next `.editor/` change still hits **14 directories**
by hand (12 PP, 2 roost).
The same gap covers `remotion.config.ts`, `vitest.config.ts`, `tsconfig.json` and
`package.json`, none of which the mirror carries either.

**Phase 0 leftover — decided, half-applied.** `docs/zod-version.md` settles the
question (exactly `3.22.3`, forced by Remotion 4.0.425). Core and
`examples/layered-minimal` already carry it. **roost is still on `^4.3.6`** and PP on
`^3.22.0`; both are Phase 2 migration **G**. Sequenced follow-up: a core-side check
that the resolved zod major is 3 must land **after** roost migrates (added now it
would fire on the one repo that is not broken) and must **warn, not throw** — a hard
assertion turns a routine submodule bump into a hard stop. Recorded in
`docs/zod-version.md`; no guard code exists yet.

**New in the fix-pass-2 re-review, now a Phase 3 candidate:**
- **`lib/transitions/TransitionGallery.tsx` and `showcase/transitions/src/TransitionGallery.tsx`
  are a divergent fork, and only the second one runs.** `showcase/transitions/src/Root.tsx` (and
  therefore `npm run render` in that project) imports the showcase copy exclusively; the lib copy
  has no runtime consumer anywhere in this repo or in either brand repo
  (`~/Workspace/progpce/video-toolkit`, `~/Workspace/roost/video-toolkit` — both only reference
  `toolkit/lib/transitions/TransitionGallery.tsx` and `toolkit/showcase/transitions/src/*` via the
  submodule, neither imports the lib copy directly). The lib copy's only reason to exist right now
  is that `examples/layered-minimal/tsconfig.json` lists it directly in `include` so the type-check
  gate (`docs/superpowers/core-typecheck-gate.md`) can reach it — meaning **the gate's "0 errors"
  claim for `TransitionGallery.tsx` covers a file nothing renders.** The showcase copy still carries
  the exact `TransitionDemo`'s `presentation: ReturnType<typeof glitch>` mis-typing that was just
  fixed in the lib copy (fix-pass-1, `51150ad`) — every non-glitch entry in its `TRANSITIONS` array
  is silently accepted only because the showcase project has no type-check gate of its own. The two
  files have also drifted apart in content, not just typing: the showcase copy adds a `checkerboard`
  transition entry (four variants) and a `TRANSITION_NOTES` block plus a materially reworked visual
  layout (grid background, corner markers, per-scene labels) that the lib copy lacks entirely; the
  lib copy in turn carries the generic `TransitionEntry`/`makeTransitionEntry` factory pattern and
  the `transitionMap`/`SingleTransitionPreview` programmatic-access API (README-documented, fix-pass-2
  above) that the showcase copy lacks.
  **Recommendation:** make the showcase copy the single source (it is the one with real content —
  `checkerboard`, notes, the richer layout — and the one actually exercised by a render), have
  `showcase/transitions/src/Root.tsx` import it as today, and either (a) delete
  `lib/transitions/TransitionGallery.tsx` and drop the `examples/layered-minimal/tsconfig.json`
  `include` entry, accepting that the gallery/demo surface goes back to un-type-checked, or (b) keep
  one copy in `lib/transitions/` as the canonical version (porting `checkerboard` + notes + layout
  into it) and have the showcase project import it instead of vendoring its own — which restores a
  single type-checked source and gives the showcase real coverage for free. (b) is preferable if the
  gate is meant to mean what it currently implies. Not fixed here — this is a decision for the user,
  and fix-pass-2's charter was explicitly not to delete/merge/rewrite either copy.

**New in Phase 2, deferred:**
- **`loadBrandFonts` dedupes on a module-level `handle`**, so a *second* call from a
  different composition in one JS realm is a silent no-op. This mirrors all three brand
  originals exactly, so it is not a regression — but Studio can mount several
  compositions, and two of them wanting different font sets would silently get only the
  first. No `delayRender` hang path (verified).
- **`EDITOR_ACCENT` (`lib/editor/host/ui.ts:6`) and `EditorShell.module.css:42`** hold
  the same colour literal (`#b6ff5a`), and it is not just those two: the literal also appears
  at `FrameOverlay.module.css:23,25,31`, `AccentEditor.module.css:27,46`, and
  `LayeredTimeline.tsx:715` — 8 occurrences across 5 files, TS and CSS both, with nothing
  keeping them in sync.
- **`lib/project/paths.ts:55`**'s error message says "working directory", but the vitest
  path passes an explicit `projectRoot` — reword.
- **`lib/editor/src/project-config.test.ts:115`** creates an `mkdtempSync` fixture that
  is never cleaned up (a tmpdir leak per run).
- **`readDefaultProps`'s "first argument only" narrowing** has no dedicated test of its
  own (it is exercised indirectly by the spread-id cases).
- **The Save-test rewrite dropped** the old "clicking a disabled Save does not POST"
  assertion. No mutation-killing power was lost — the replacement drives the real
  dirty-tracking path — but the disabled-button guard is no longer asserted.
- ~~`lib/project/README.md` says "these three" and then discusses two.~~ **Fixed in the
  final fix wave** — reworded to "these two" (`paths.ts` is never imported by a brand
  config file; only `remotion-config.ts`/`vitest-config.ts` are).

**Closed in the final fix wave (whole-branch review, before merge):**
- **The spread-form Save spine had zero test coverage.** Every real brand Save goes through
  `save-endpoint.ts` → `updateDefaultPropsSurgically` + `verifyDefaultProps`, never
  `rewriteDefaultProps` — but the spread-form fixtures added during Phase 2 only drove
  `readDefaultProps`/`rewriteDefaultProps`. Closed: `src/default-props-writer.test.ts` now
  has a `SPREAD_TWO_COMPS_WITH_ARRAY` fixture driven through `updateDefaultPropsSurgically`
  with an array splice (the one path, `applyArraySpliceToSource`, that re-parses intermediate
  source and re-resolves the id via `findDefaultPropsAttr` a second time against already-edited
  spread-form source) plus a `verifyDefaultProps` round-trip. Verified by mutation. No stale
  risk remains — this was pure missing coverage, not a production bug.
- **`idOf`'s explicit-`id`-vs-spread-id precedence was inverted relative to JSX.** The resolver
  preferred an explicit `id="…"` attribute over a `{...layeredCompositionProps({ id })}` spread
  regardless of source order, but JSX/React apply props in source order — whichever is written
  LAST wins at runtime. Fixed in `lib/editor/src/default-props-writer.ts`'s `idOf`: it now picks
  whichever candidate has the higher index in `el.getAttributes()`. Two new tests cover both
  orderings, each verified by mutation to fail independently. Closed — this was pathological and
  self-limiting (no real `Root.tsx` writes both `id=` and a `layeredCompositionProps` spread on
  the same element today) but is now correct either way.
- **A second 60-frame floor.** `lib/render/layered-composition-props.ts`'s `MIN_FRAMES` is now
  exported and `lib/editor/host/host-duration.ts`'s `framesForReel` imports it instead of
  hardcoding its own `60`. Cross-file drift is no longer possible — verified by mutating
  `MIN_FRAMES` and confirming both `layered-composition-props.test.ts` and
  `host-duration.test.ts`'s floor assertions fail. Closed.

**Deferred, judged genuinely fine to carry:**
- The `AccentKey` marker in `transition-schema.ts` patches zod's `describe()` so clones stay
  marked. Tested and correct for its one use, but `.min()`, `.nullable()`, `.readonly()` and
  `.catch()` chains silently lose the mark — and the failure mode is a field with *no editor
  control at all*, with no warning. Replace with an `_def` mark (every zod-3 clone path spreads
  `_def`) or a declarative `ACCENT_FIELDS` set beside the existing `PROP_LABELS`.
- Test fixtures still speak PP's `{lime:…}`/`{teal:…}` vocabulary. Mechanical rename — worth
  doing because that very vocabulary is what hid the `ACCENT_RE` leak Phase 1 found in
  production code.
- `LayeredTimeline.tsx:25-32` media-path conventions (`/recordings/`, `/broll/`) → Phase 3's
  `resolveMediaSource`. Deliberately not half-solved in Phase 1.
- From the writer rework: inline arrays reflow on insert; `lcsAnchors` allocates n×m; one
  asymmetric filter typing. All bounded, reels are tens of items.
- `fade-coal` is a brand-derived **kind name**. Renaming touches every baked `Root.tsx`, so it
  is deliberately kept — see the NAME NOTE on its catalog entry.

**Open risk, actionable in core (no longer blocked on a brand repo):** 11 transition kinds have
**no at-cut visual confirmation** — the six newly wired ones plus `wipe`, `glitch`, `whip-pan`,
`zoom-through`, `gradient-wipe`, which were previously marked verified only by inference from the
`TransitionSeries` path. Only `burn` is at-cut confirmed. At-cut composites differently
(handle-borrowed overlap, not a shrinking sequence), so a presentation that looks right in
`showcase/transitions` can still misbehave at a cut.

*Update (fix/core-has-remotion, Task 3).* `lib/editor/src/at-cut-transitions.test.tsx` now gives
**every** catalog kind — all 20, derived from `TRANSITION_CATALOG` rather than a hardcoded list —
**wiring** coverage: it resolves to a presentation, mounts in both directions at progress 0/0.5/1
without throwing, and receives its authored params under the key the presentation reads (plus
accent-key→hex resolution through a brand palette, and `AtCutTransition`'s own progress ramps and
compositing order). That is the whole of what a wiring test (jsdom, no pixels) can settle. **The
visual risk is unchanged: none of the 11 has at-cut *appearance* confirmation, and a wiring test
cannot give it** — but closing it no longer needs a brand repo.

*Update (fix/core-has-remotion, Task 4).* **Core can render.**
`examples/layered-minimal` is a complete, installed Remotion project — `@remotion/cli`,
`@remotion/renderer`, `@remotion/compositor-darwin-arm64` and `@remotion/web-renderer` are all
present in its `node_modules`, and its `package.json` has `render`/`still` scripts. Measured
directly: `cd examples/layered-minimal && npx remotion still src/index.ts MinimalReel
out/probe.png --frame=45` bundles, prints `Rendered 1/1`, exits 0, and produces a real ~130 KB
PNG (`out/` is gitignored; delete probes after checking them). A first run on a cold machine may
need to fetch a headless-browser shell, which is the only external dependency involved.

That makes closing this risk a **concrete core task**: author a reel literal in
`examples/layered-minimal` exercising each of the 11 unconfirmed kinds at a cut (both directions,
as `transitionIn` and `transitionOut`), and render stills at a few progress points to eyeball the
composite. It is sizeable enough to be its own piece of work — a Phase 3 candidate, not something
folded into this task. Two known suspects make it concrete rather than speculative: Task 3 found
`checkerboard` a no-op when exiting (see below) and `pixelate`'s opaque root occluding the
neighbouring clip at a cut — a still render of either would confirm or refute the defect
directly, in core, without a brand repo.

Both named suspects turned out to be real, and are **recorded, not fixed** (what a transition
renders is a look decision, and neither kind has ever had its at-cut appearance confirmed, so a
"fix" would be a guess). Each is pinned as an `it.fails` in that test file, so it flips to a
normal `it` the day it is addressed and the runner shouts if it starts passing:

- **`checkerboard` has no effect in the EXITING direction.** Its cells are rendered empty on exit
  — the children are drawn once, whole, in the base layer beneath them, and the cell divs carry no
  content and no background — so a `checkerboard` used as a `transitionOut` plays as a hard cut.
  Only the entering direction reveals cell by cell.
- **`pixelate` paints its root `AbsoluteFill` opaque black unconditionally**, including at
  progress 0. Bounded under `TransitionSeries` — it lasts only the transition's length and reads
  as a dip to black, since the presentation only exists for the transition's length and composites
  over the outgoing sequence; *not* bounded at a cut, where the wrapper is mounted for the item's
  whole sequence and the neighbouring clip sits beneath it in a sibling `Sequence` — so the black
  root hides the neighbour for the entire clip instead of blending with it.

**Nothing that renders today can regress** — every one of those kinds was unreachable before
Phase 1.

**✅ CLOSED — Phase 2's stated top residual risk, settled favorably in core.**
Phase 2 recorded that `layeredCompositionProps` (`lib/render/layered-composition-props.ts`)
had never been type-checked against a real Remotion `<Composition>`, and that its
unconstrained `<C>` type parameter on `LayeredCompositionOptions<C>['component']` might defeat
Remotion's own `Props` inference and silently **loosen** a brand's `defaultProps` check —
the opposite of what migration item A's *tsc-caught* grade promises. It said only a brand-side
`tsc` could settle it. That reasoning rested on the false "core has no `remotion`" premise
above; core could settle it all along, and now has:

- **Positive:** `examples/layered-minimal/src/Root.tsx` spreads
  `{...layeredCompositionProps({ id, component, fps, width, height })}` onto a real
  `<Composition>` from `remotion` 4.0.425 alongside its own `defaultProps` literal, and
  `cd examples/layered-minimal && npm run typecheck` reports **0 errors**.
- **Negative (the check is real, not vacuous):** temporarily changing `defaultProps`'
  `meta.totalDurationMs` from `6000` to `'6000'` in that same file produces exactly

  ```
  src/Root.tsx(39,51): error TS2322: Type 'string' is not assignable to type 'number'.
  ```

  Re-verified on `fix/core-has-remotion`, then reverted; the tree is clean.

So the spread does **not** loosen `defaultProps` type strictness — inference survives it, and
item A's *tsc-caught* grade is accurate in direction as well as severity. Nothing about this
needs a brand repo any more. The residual value of the first brand-side `npx tsc --noEmit` is
now ordinary migration verification, not risk closure.

---

## Working conventions established

- **Source of truth for a project's cut is the `defaultProps` literal in `src/Root.tsx`.**
  `reel.config.json` is a one-way authoring INPUT and is *expected* to diverge once the cut
  is hand-tuned. Never validate against it; never re-sync it over a tuned literal. A review
  reached a false conclusion this way during Phase 1.
- **Rendering an existing baked literal is frozen; derivation output is free to change.**
  Improving what `deriveLayered`/`deriveMontageLayered` emit is intended.
- **Signing is never a blocker.** If a commit fails on a 1Password error, re-commit with
  `--no-gpg-sign` immediately. (Also recorded in `~/.claude/CLAUDE.md`.)
- **Core DOES have `remotion`, and a module importing it CAN be unit-tested here.** The
  older claim in this file — "core has no `remotion` installed, so anything importing it
  cannot be unit tested" — was false, and it cost real coverage before `fix/core-has-remotion`
  disproved it. The measured facts:
  - `remotion` **4.0.498** resolves in `lib/editor/node_modules`. It was always there as a
    hard dependency of `@remotion/player`; Task 1 declared it outright in
    `lib/editor/package.json` alongside `@remotion/transitions@4.0.498` so it stops being
    an accident of hoisting.
  - `examples/layered-minimal` is a complete Remotion **4.0.425** project inside this repo,
    which is what makes the third quality gate (`npm run typecheck` there) possible over
    `lib/render/` and `lib/transitions/` — see `docs/superpowers/core-typecheck-gate.md`.
  - A module importing `remotion` is unit-tested by mocking it: `vi.mock('remotion', …)`.
    Five test files do this today — `segment-media`, `generic-watermark`, `text-overlay-base`,
    `load-fonts`, and `at-cut-transitions`. `lib/editor/vitest.config.ts:51` documents the
    resolution detail that makes it work.
  - **Core CAN render.** `examples/layered-minimal` is a complete, installed Remotion project
    (`@remotion/cli`, `@remotion/renderer`, a platform compositor, `@remotion/web-renderer` all
    present) — `cd examples/layered-minimal && npx remotion still src/index.ts MinimalReel
    out/probe.png --frame=45` bundles, renders, and exits 0 with a real PNG (`out/` is
    gitignored). This was also asserted false and unmeasured; see the at-cut visual-confirmation
    risk entry above, which this fact reopens as a core-doable task. What `lib/editor`'s own
    `vitest` suite genuinely cannot do is drive a real `Player` instance or real pointer gestures
    — that's jsdom's limit, not core's; see the next bullet.
  Keep the pure/JSX split documented in `lib/render/README.md` — it is still worth having,
  because a pure module needs no mock at all. It is a convenience, not a necessity.
- **`EditorHost`'s verification boundary, named explicitly** (`lib/editor`'s `vitest` suite runs
  under jsdom, which has no real `Player` instance or real pointer/gesture pipeline — a
  narrower limit than "core cannot render," which is no longer true): the Focus/Zoom crop-gesture overlay, the
  `setFocal`/`setZoom` POSITIVE path (a real drag/pinch actually moving a clip's crop), the
  transport toolbar's play/pause/scrub controls, and Remotion `Player` playback events are all
  unreachable in jsdom — they need a real timeline selection and a real Player instance, neither
  of which jsdom provides. These are inspected (rendered, snapshot-checked, prop-shape-checked)
  by the existing tests, not exercised end-to-end. Same caveat added to
  `lib/editor/host/README.md`, which otherwise advertises Focus/Zoom with no verification note.
- The brand-leak gate needs its exclusions or it walks `node_modules` and is permanently red:
  `grep -riE 'lime|teal|roost|progresivn|sand-brown' lib/ --exclude-dir=node_modules --exclude='*.test.*'`
- **Current gate numbers, measured on `fix/core-has-remotion` (2026-07-26).** Any figure
  quoted elsewhere in this file from Phase 1 or Phase 2 is historical; these are live:
  | Gate | Command | Now |
  |---|---|---|
  | Editor tests | `cd lib/editor && npx vitest run` | **57 files / 650 tests**, green |
  | Editor types | `cd lib/editor && npx tsc --noEmit` | **4** errors |
  | Render/transition types | `cd examples/layered-minimal && npm run typecheck` | **0**, coverage guard ok |

  The editor `tsc` baseline was **34** through Phase 2 and briefly **29**; this branch took it
  to **4** in two steps, without touching any of the code the errors were about — a `paths`
  entry mapping the out-of-tree bare specifiers `remotion`, `react` and `@remotion/transitions`
  into `lib/editor/node_modules`, plus `DOM.Iterable` in `lib`, resolved 29 errors that were
  pure module-resolution noise rather than real type defects. Treat **4** as the baseline from
  here on; if you read 29 or 34 in a doc, that doc is stale.
- **`examples/layered-minimal` is also a type-check gate**, over `lib/render` and
  `lib/transitions` (`cd examples/layered-minimal && npm run typecheck`, baseline 0) — the
  surface `lib/editor`'s own `tsc --noEmit` doesn't reach. See
  `docs/superpowers/core-typecheck-gate.md` and the `CLAUDE.md` "Quality Gates" table. No CI
  runs any of these three gates; they are manual and easy to forget — run them before calling
  render/transitions work in `lib/` done.
- **Capability claims must carry the command that demonstrates them, or not be written down.**
  This branch exists because "core has no `remotion`, so anything importing it can't be
  unit-tested" was written into this file unmeasured and false. The same pattern recurred twice
  more on this same branch before it was caught: "core cannot render, only jsdom" (also
  unmeasured, also false — `examples/layered-minimal` renders real stills today) shaped both a
  stale `lib/editor` tsc baseline left uncorrected in a second doc and an open risk parked as
  "needs a brand repo." Each time, the false absence was cheap to assert and expensive to
  unwind once decisions were built on it. Going forward: don't write "core cannot X" (or "core
  has no Y") without the command you ran to check, in the same sentence or the one after it. If
  you haven't run it, say "unverified," not "cannot."
