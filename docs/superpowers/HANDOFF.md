# Handoff — core architecture rework

**Last updated:** 2026-07-28, on `refactor/phase4-node-contract` — **Phase 4, Workstreams 1
and 2 complete; Workstreams 3 (bar 3.1), 4, 5 and 6.2–6.4 not started.** Phase 3 (close the
extension contract) preceded it,
Phase 2.5 (the brand migration, and the first end-to-end validation that Phases 1–2 work)
before that; Phase 2 completed on `refactor/phase2-core-shell` (2026-07-25) and
`fix/core-has-remotion` corrected it the same week.

**Start with "Phase 4 outcome" below, then "Workstream 2 outcome" immediately after it** —
together they are the live state, and they say exactly which half of Phase 4 is done. Where
the two disagree on a number, Workstream 2's is the later measurement. Then `docs/superpowers/plans/2026-07-26-phase4-node-contract.md` for the
workstreams still open, `docs/superpowers/phase4-migrations.md` for what a brand pin bump will
need, and the working conventions at the end of this file. Phase 3.5 (`phase3-migrations.md`)
is **still pending** and was not touched by Phase 4.

**The twelve Phase 2 brand migrations are APPLIED.** `docs/superpowers/phase2-migrations.md` is
now a record and a reference for the next brand repo, not pending work. **The seventeen Phase 3
migrations are NOT** — `phase3-migrations.md` is pending work, and it says so at the top.
**The Phase 4 migration notes** (`phase4-migrations.md`) are likewise pending and cover
Workstream 1 only.

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
| 2.5 | Apply the brand migrations — the validation of 1–2 | ✅ both brand repos green, 2026-07-26 |
| 3 | Close the extension contract (registries, effects, generators, captions) | ✅ core-side, `refactor/phase3-extension-contract` |
| 3.5 | Apply the Phase 3 brand migrations — the validation of 3 | ⬜ still pending, `docs/superpowers/phase3-migrations.md` |
| 4 | One node contract for effects and transitions (the model tightening) | 🟡 **in progress**, `refactor/phase4-node-contract` — Workstreams 1 ✅ and 2 ✅ complete, 3.1 ✅, 6.1 ✅; Workstreams 3 (bar 3.1), 4, 5 and 6.2–6.4 **not started** |
| 5 | NLE alignment (effect stack, music track, transition entities, media pool) | ⬜ |
| 6 | `brand.json` becomes the theming contract | ⬜ |

---

## Phase 1 outcome

18 commits, 116 files, **+4197 / −6998 (net −2801)**. 47 test files / **485 tests**
green. `tsc --noEmit` held at its then-34-error pre-existing baseline — verified by
diffing error *sets* against a worktree at the branch point, not by comparing counts.
(That 34 is **historical** — what Phase 1 measured, not the repo's current baseline.
For that, read "Current gate numbers" under "Working conventions established" below.)

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
(Both figures are **historical** — what Phase 2 measured, not what the repo
measures now. For the current numbers read "Current gate numbers" under
"Working conventions established" below; never carry a figure forward from
this paragraph.)
The brand-leak gate returned exactly its 2 known pre-existing hits — also
**historical**: the count is the gate, and the *files* carrying the two comments
move as code is refactored, so the pair named here is not the pair you will find.

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

## ✅ Phase 2.5 outcome — the brand migration, and what it found

**All twelve migrations are applied to both brand repos, and both are green.** The paste-ready
document, `docs/superpowers/phase2-migrations.md`, has been corrected in seven places and marked
applied; read it for the per-item detail. This section is the result.

| | PP (`~/Workspace/progpce/video-toolkit`) | roost (`~/Workspace/roost/video-toolkit`) |
|---|---|---|
| Branch | `chore/phase2.5-toolkit-migration` | `chore/phase2.5-toolkit-migration` |
| Commits | `7a4d698` pin · `f8ff467` G+C · `f7f4095` B/A/items 2,5/endpoint · `ff955c6` E+F | `18953c3` pin · `aaa7279` pin→host fix · `cfe7bd5` everything else |
| Directories migrated | 18 (2 templates + 16 projects), 12 with `.editor/` | 3 at the time (1 template + 2 projects); `roost-promo-01` has since been deleted, leaving 2 |
| `tsc --noEmit` | **0** in every installed dir except the pre-existing WPI `TS2322`s (see finding 3) | **0** in all three |
| Tests | every test-bearing dir green; the 6 with a top-level `tests/` still run 2 files / 6 tests | green |
| Render parity | `pp-ricni-sauna`, 5 frames **byte-identical** to the pre-migration baseline | `roost-reel-01`, 5 frames **byte-identical** |
| Editor | loads, edits, **saves** | loads, `/props` real, no resolution errors |

Core's own gates moved only upward: **650 → 669 tests**, `tsc` baseline still **4**,
`examples/layered-minimal` still **0** with its coverage guard intact, brand-leak grep still
exactly **2**.

**Core's `main` is now pushed, and Phase 2.5 is merged into it.** `main` had been 56 commits
ahead of `origin/main` — Phases 1, 2 and `fix/core-has-remotion` had never left the machine, so no
pin could reference them. `origin/main` is now **`59d4b30`** (the Phase 2.5 merge), and **both
brand branches pin exactly that**, so a fresh clone resolves the submodule. Re-verified against
the merged pin: `tsc` 0 in both, and the two reference frames still render with **0 differing
pixels**.

**The two brand branches are NOT merged** — they are left on
`chore/phase2.5-toolkit-migration` in each repo for review.

### The stage justified itself: five findings, two of them real regressions

**1. The pin bump alone changed what PP renders.** Before any migration was applied,
`pp-ricni-sauna` frames 15 and 75 differed — 306 pixels of 2.07M, peak delta 203/255, localized to
an 18×17 box. Visually: the caption "**Říční sauna** na Labi**.**" had a teal `#2ad4c5`
sentence-final period and rendered it white.

`07eeca9` ("drop the last brand accent default") changed `applyBrandEndpoint` from
`(text, ...rest: [endpointKey?: string])`, whose rest-tuple deliberately distinguished *omitted*
(→ default `'teal'`) from *explicitly undefined* (→ disabled), to a required parameter that
no-ops when absent. PP had two single-argument call sites relying on that default.

**Core was right and the document was wrong.** Evicting a brand colour from core is the whole
point of the programme. The defect was that `phase2-migrations.md` said in as many words
"**PP needs nothing**". It needed an explicit `'teal'`. Fixed brand-side, doc corrected.

The asymmetry is worth remembering because a migrator meets both halves: roost must *not* pass an
`endpointKey` (its rule is deliberately off, and absent now means off), PP must. roost's stills
were unchanged throughout, which is exactly what that predicts.

**2. The brand-side `tsc` gate was worthless, which is why finding 1 hid.** After item C as
written, every PP directory reported **~160 errors** — 174, 159, 167, 162 — *all* of them
`TS2307 Cannot find module 'remotion'` / `TS2875 react/jsx-runtime`, emitted from files outside
the project (`toolkit/lib/**`, `brand-lib/**`). tsc resolves a bare specifier by walking up
`node_modules` from the *importing* file, and that walk never reaches the project's
`node_modules`. Finding 1's real `TS2554` was sitting in that pile the whole time.

Fixed by adding five `paths` entries to item C's tsconfig template — the same fix core already
applies to itself at `lib/editor/tsconfig.json:14-33`. It cannot be hoisted into
`lib/project/tsconfig.base.json`: Rule 2, `paths` does not merge across `extends`. **Result: ~162
→ 0** in every PP campaign directory and in all three roost directories, including
`roost-reel-01`, which had never had a `@video-toolkit/lib/*` entry at all.

**3. Pre-existing, NOT a bump regression: `web-program-intro` literal type errors.** Unmasking the
noise revealed real `TS2322`s in WPI `src/Root.tsx` (a clip literal missing `audioMode`, which is
`.optional().default('voice')` and so required in the inferred output type) — 9 in
`pp-program-klima`, 7 in `pp-program-mobilita`, 1 each in the template and `pp-program-bydleni`.

Settled by controlled experiment rather than assumption: same project, same probe tsconfig, only
the submodule SHA varying — old core `0c452362` → **15** errors, new core `41bf406` → **11**. The
new core *reduced* them. Left alone deliberately; the authored literal is not ours to edit.
Phase 3 already plans to migrate `web-program-intro` onto `LayeredReelComposition`.

**4. A real Phase 2 regression: the core-owned editor never mounted.** ⚠️ The important one.

Every migrated editor served `/` and `/props` — so every smoke check passed — but the app never
mounted. `#root` stayed empty, no console error, and the only evidence anywhere was one line in
the Vite dev-server log:

```
Failed to resolve import "@remotion/player" from "../../toolkit/lib/editor/host/EditorHost.tsx".
```

`createEditorViteConfig`'s pre-plugin re-resolved only `@remotion/transitions`. That sufficed
while the host lived in the brand's own `.editor/main.tsx`, where `@remotion/player` resolved
through the project's `node_modules` like any local import. **Phase 2 moved the host out of the
project tree** and Node's walk-up from the submodule climbs to the brand repo root and stops.
Confirmed a regression, not pre-existing, by restoring the original `.editor/` at the same depth
and watching it mount.

Fixed in core, `cb51d4d`: the pre-plugin now re-resolves `remotion`, `remotion/*` and
`@remotion/*`. Still a `resolveId` hook rather than a dir alias, for the reason the original
comment gives (exports-map-only subpaths). Guarded by tests **verified by mutation** — narrowing
the predicate back fails exactly `@remotion/player`, `remotion`, `remotion/no-react`.

**Findings 2 and 4 are the same lesson on two sides of the toolchain:** core code now lives
outside the project tree, and bare-specifier resolution does not follow it. tsc needed `paths`;
Vite needed a resolver. **Phase 3 moves more code into core — assume this recurs, and check both.**

**5. Pre-existing: 8 of 11 PP project editors cannot start at all.** They declare an `"editor"`
script but no `vite` / `@vitejs/plugin-react` / `@tailwindcss/vite` devDependencies (4 also lack
`@remotion/player`) — `ERR_MODULE_NOT_FOUND` before Vite loads the config. Already broken at HEAD;
the vendored copies never inherited the template's editor devDependencies. Same root as the
`sync_template.py` gap already queued for Phase 3.

### Six things the migration document got wrong, now corrected in it

Recorded here too because the pattern matters: **every one was a miscount or a false negative in a
document that had been carefully checked against the real repos.** Reading files is not the same
as running them.

1. Part 1 item 3 said "PP needs nothing" — PP needed the endpoint key (finding 1).
2. Item C's tsconfig template was missing the five bare-specifier `paths` entries (finding 2).
3. Part 1 item 5 is **6** files, not 3 — and none of the six web themes declared `accentSlots`
   at all, so the instruction was not executable as written. Resolved by adding the same two slots
   campaign-reels declares; latent either way, no project uses a `wipe`.
4. Part 1 item 3 is **3** roost files, not 2 (`roost-promo-01` was the third — since deleted, so it is 2 again for anyone applying this now).
5. Item E claimed roost declares no `accentSlots`. `roost-reel-01`'s editor did — roost's *own*
   palette — and dropping it would have been a real regression. Carried through the host option.
6. Part 1 item 1 has **3** `withTransitionOverrides` sites, not 1: two more in
   `composition-theme.tsx`, passing tsc only because a cast was masking the discriminant.

(Item G's trailing-comma split was also 10/8 rather than as implied. Harmless — the doc's own
"apply by line content" advice covers it.)

### Method notes worth keeping

- **Still renders make an excellent parity gate** — `remotion still` at fixed frames, compared by
  `shasum`. This is what caught finding 1, which no test would have. A mismatch is not a finding
  until it has been re-rendered and reproduced. Two mismatches in this stage; one was real
  (reproduced exactly), one was noise (re-rendered twice, both matched the original).
  **Corrected in place by Phase 4: "byte-deterministic" is false, and "one render in ~20 flakes"
  understates it.** Phase 4 measured ~2070 renders and found the non-determinism is **bimodal** —
  an affected cell has exactly two stable attractor hashes, at per-cell rates of 9–50 %. The
  practical advice above is unchanged (re-render before believing a mismatch); what changes is
  that a *single* re-render is not enough to establish a cell is stable. See "Phase 4 outcome →
  The findings that must survive", finding 1.
- **`npx tsc --noEmit | grep -c 'error TS'` returns 0 when tsc *crashes*.** Hit twice. Check the
  exit code. Related: four PP projects had `node_modules/.bin` entries that were regular files
  instead of symlinks (a `cp -r`'d `node_modules`); `npm install` does *not* repair that,
  `rm -rf node_modules/.bin && npm install` does.
- **`git add -A` in the roost repo swept the then-untracked `roost-promo-01` into a commit.**
  Caught and undone with `git rm --cached -r` + amend; files verified byte-identical on disk
  afterwards, and `git log --all -- projects/roost-promo-01` confirmed it never entered history.
  That directory is gone now, but the habit stands: in a repo with untracked work, stage
  explicitly rather than `-A`.

### Carried out of Phase 2.5

- **The two brand branches are unmerged, awaiting review** — `chore/phase2.5-toolkit-migration`
  in each repo. Their pins are fine (`59d4b30`, on `origin/main`); merging them is a review
  decision, not a blocker. **Still open after Phase 3, and PP's state has moved:** PP's `HEAD` is
  now **`ffcc442` on `main`** (a merge commit, "adopt core's brand shell (Phase 2.5 migration)"),
  while `chore/phase2.5-toolkit-migration` sits behind at **`04fd0d1`** — so PP is effectively
  merged even though the branch is still there. roost's `chore/phase2.5-toolkit-migration` is at
  **`aecf1b9`** and roost is *not* checked out on it (see the moving-target warning below).
- **3 PP projects were edited but never installed or verified** — `pp-cyklostezka-chrudimka`,
  `pp-druzstevni-parkovani`, `pp-plovarna-napojeni` (no `node_modules`, by explicit decision).
  Their `package.json` now says `zod: 3.22.3` while their lockfile still records `^3.22.0` as the
  root spec, so `npm ci` fails there until someone runs `npm install`.
- ~~`roost-promo-01`~~ — **deleted by the user after Phase 2.5, along with its backup tarball.**
  It had been migrated and was at `tsc` 0, but inspection showed it was an empty scaffold created
  the same day, not work in progress: `public/recordings/` held only a `.gitkeep`, there were no
  renders, and its `src/` was byte-identical to `templates/roost-reels/src`. The only unique
  content was a 7-line `project.json`. **Note for the record:** this document and
  `phase2-migrations.md` both described it as "the user's own in-progress work" — accurate about
  its git status, overstated about its contents, and nobody had opened it. roost now has one
  project, `roost-reel-01`.
- **Finding 5** (8 PP editors missing devDependencies) and **finding 3** (WPI literal errors) are
  both unfixed and both pre-existing. **Still open after Phase 3**, with two corrections:
  finding 3 is **18** `TS2322`s, not 4 — measured per tree in Task 11 as 1 / 1 / 9 / 7 / 0 / 0
  across the WPI template and its five projects; still pre-existing, still not a bump regression.
  And finding 5 is now *fixable* — `sync_template` merges `package.json`, so one sync carries the
  template's editor devDependencies to every project — but **fixing it is a brand-repo action**,
  which Phase 3 was forbidden. It stays open.
- The **zod guard** is done — `b02669c`, `lib/project/zod-guard.ts`. It warns and never throws, and
  it landed only after both brand repos moved off zod 4, as sequenced.

---

## ✅ Phase 3 outcome — the extension contract is closed in core, and unproven in a brand

**Branch:** `refactor/phase3-extension-contract`, merge base `d6e9482`.
Re-derived from `git log` / `git diff --stat` against the merge base rather than carried forward
from running totals — that is how Phase 2's counts drifted. Measured over
**`d6e9482..1b2f93a`**: **24 commits** (including the plan document's own commit), **70 files,
+10945 / −752**. Excluding the 1751-line plan document
(`docs/superpowers/plans/2026-07-26-phase3-extension-contract.md`): 69 files, **+9194 / −752**.

> **The range stops short of the branch tip, deliberately.** A commit cannot state its
> own diffstat, and an earlier version of this paragraph was stale for exactly that reason — it
> named a range that excluded the commit carrying the text, without saying so. `1b2f93a` is the
> last commit before the documentation-truthfulness pass that rewrote this paragraph; what came
> after it is doc-only. Re-derive rather than trust it after any further commit:
> ```bash
> git log --oneline $(git merge-base main HEAD)..HEAD | wc -l
> git diff --stat $(git merge-base main HEAD)..HEAD | tail -1
> ```

### Gates, measured fresh at the end of the branch (2026-07-26)

| Gate | Command | Value |
|---|---|---|
| Editor tests | `cd lib/editor && npx vitest run --no-file-parallelism` | **70 files / 905 tests** green — **4** of them are `it.fails` known-defect pins, so "all passed" is *not* full green |
| Editor types | `cd lib/editor && npx tsc --noEmit` | **3** errors, exit code 2 (tsc ran; it did not crash) |
| Render/transition types | `cd examples/layered-minimal && npm run typecheck` | **0**, coverage guard ok (render 9 / transitions 14 / theming 23 / reel-config-base 8 / transcripts 1) |
| Brand leak | the `grep -riE` under Working conventions | exactly **2** known hits |

The editor `tsc` baseline moved **4 → 3** during Task 7, legitimately: one of the two `hide`
errors existed only because its *expression* was the value-presence branch condition
`content.hide !== undefined`, which the additive fix necessarily replaced with a well-typed
`bag[k] !== undefined` over `Record<string, unknown>`. Nothing was fixed to chase the number.
The remaining three are `LayeredInspector.tsx:679` (`hide`), `derive-layered.test.ts:277`, and
`../theming/envelope.test.ts:1` (`Cannot find module 'vitest'`). **Treat 3 as the baseline.**

### What landed — seams 1–7, each a core registry with a generic beneath it

1. **One overlay registry.** `Registration<P>` / `Registry<P>` / `resolveRegistered`
   (`lib/theming/registry.ts`) is now the single resolution rule for every extension axis. The
   two live registries (`BrandTheme.overlays` closed on `OverlayKind = 'text'`, and
   `CompositionTheme.overlayItems` open-keyed) collapsed into one open-keyed registry with the
   core text adapter as the default renderer, so existing brand registrations keep working.
   `Registration<P>` deliberately carries **no index signature** — excess-property checking is
   what catches a typo'd `rendererr`.
2. **An effect registry** (`lib/theming/effects/`) plus core generic `grain`, `scanlines`,
   `vignette`, `grade`, `transform`. `ken-burns` was extracted verbatim into
   `lib/theming/effects/ken-burns.ts`, pinned by a parity test whose literals carry full IEEE
   noise (derived by running, not hand-computed). `applyEffects` is wired at
   `renderVideoItemNode` (`lib/render/layered-composition.tsx`), not inside `SegmentMedia`, and
   covers every video kind.
3. **Core generics for `outro`, `multi-clip` and `card`** (`GenericOutro`, `GenericMultiClip`
   with its four layouts, `GenericCard`), plus `ThemeTokens` reaching renderers through
   `BrandTheme.tokens` → `VideoRenderProps.tokens`. A brand's procedural outro now registers as
   an override — which is the point of the contract.
4. **A brand-layer registry** replacing the `renderBrandTrack` hook, with
   `defaultRenderBrandTrack(items)`, a `disclaimer` kind, and `GenericWatermark` extended with
   the PNG-as-alpha-mask tint.
5. **`GenericCaptions`** in core, parameterized by a new `CaptionTokens`.
6. **`resolveMediaSource(item, role)`** — one media-path rule consumed by the renderers *and*
   by the editor timeline, so the editor stops knowing folder names. Roost registers no source
   resolver at all and renders core's `LayeredReelComposition` directly, so core's rule is now
   the only thing standing between roost and broken paths.
7. **A schema-driven inspector** — `editorMetaFromTheme` derives the inspector vocabulary from
   each registration's `params`, so a brand's own registered kind is editable without touching
   core UI. `ParamField` was deliberately duplicated in Task 1 and collapsed into
   `registry.ts` here.

Alongside those: `sync_template.py` grew from an `src`-only mirror to the full vendored surface
(`.editor/`, `remotion.config.ts`, `vitest.config.ts`, `tsconfig.json`, `tailwind.config.ts`,
`.prettierrc.json`, a merging `package.json`) **and** got a data-loss fix (below); the
`TransitionGallery` fork was resolved; and all 20 at-cut transition kinds got visual
confirmation.

### What Phase 3 did NOT do — and why a Phase 3.5 is required

**Seam 8 is enabled and documented, but NOT applied.** Dissolving PP's `brand-lib/` tier and
migrating `web-program-intro` onto `LayeredReelComposition` are *brand-repo* edits, and Phase 3
was core-only by constraint. More generally: **every one of the seventeen items in
`docs/superpowers/phase3-migrations.md` is pending.** Core now ships a generic for every kind a
reel can contain, and **not one brand has adopted any of them.**

So Phase 3 closes the contract without proving it end-to-end — exactly the position Phase 2 was
in before Phase 2.5 validated it. **A Phase 3.5 will be needed, and it will find things.** Phase
2.5 found five, two of them real regressions, in a document that had been carefully checked
against the real repos. `phase3-migrations.md` was written the same careful way and had to
correct **nine** claims supplied to it as measured; assume it is still wrong somewhere. Read its
own warning at the top before pasting anything from it.

Several items move pixels on purpose rather than refactoring, and need the user's agreement on
the result. Read each item's own **Grade:** line rather than trusting a count here — four carry a
literal *deliberate look change* grade (items **2**, **4**, **6**, **17**), and items **5** and
**8** are graded parity-preserving *except* for a named file or half. The concrete deltas:

- **item 2** — adopting a core effect on PP changes what the effect *covers* (PP draws its title
  inside the renderer, so a core `grade`/`grain` also tints the title text);
- **item 6** — `GenericMultiClip` renders no overlay, so adopting it **deletes an anchored title**
  from `pp-05-zastupitelsky-klub`'s live multi-clip;
- **item 8** — PP's disclaimer padding (`6px 40px 4px`) has no core equivalent (`paddingX` only),
  shifting the line ~4 px (the watermark half of the same item is a pure refactor);
- **item 7** — roost's watermark migration silently loses `variant` (core's `GenericWatermark` has
  `mode`/`color`, no `variant`). Graded a functional loss rather than a look change, but it is
  equally not free;
- **item 17** — PP's one live card item (`pp-paro-2026` `seg-008`) carries `cardKind: ''`, which
  renders a bare `AbsoluteFill` under PP and coal + pixels under `GenericCard`.

And one item is explicitly **not migrated**: roost's `vintage` **stays brand-registered**.
`film` uses `HtmlInCanvas` + `@remotion/effects` — a different rendering mechanism, not a harder
filter — and `vhs` needs hue-rotate, a 1-in-4 scanline duty cycle, a scrolled PNG grain tile and
a tracking band. Only `vignette` maps exactly. Migrating it would be a deliberate look change,
not a refactor. **That outcome is what the registry is for**, and recording it as "stays a brand
effect" is a success of the contract, not a gap in it.

### The one thing on this branch that was a live data-loss bug

`sync_template.py` **destroyed project-authored work**, and had done so silently for as long as
it existed. `PROJECT_OWNED` protected only `{Root.tsx, config/demo.config.json}`; everything
else under `src/` was content-hash mirrored. A dry run against the real PP repo with **no
flags** reported:

```
updated    src/segments/OutroSegment.tsx  (content differs)
```

That is `pp-mov-koalice`'s 83-line project-authored coalition outro, sitting at the exact path
where the template ships a 10-line default. Reported as a routine `updated`, with no flag and no
warning.

**Fixed in `66fff5f` by a provenance manifest**, `.template-sync.json`, mapping each path to the
hash *this tool* wrote there. A file that differs from its record, or has **no** record, is
treated as project-authored → `PROTECTED`, never written. Unknown reads as authored
deliberately: the cost of guessing wrong is destroying client work. `--strict` only deletes
files the manifest says the tool placed and the project has not touched. Legacy projects
self-bootstrap — files already identical to the template are provably safe and get recorded on
first run. `--force` is the only way to lose content.

A longer `PROJECT_OWNED` could **not** have fixed this: no path-based rule can distinguish an
83-line authored file from a 10-line template default at the same path.

### Carried out of Phase 3

**Closed by this branch:** the `sync_template` gap (and its data-loss bug), the
`TransitionGallery` fork, the at-cut visual-confirmation pass and its two named suspects.

**Open, and needing the user:**

- **`wipe` renders as an accent flash, and `MinimalReel` uses it at its first cut.** A look
  decision, not a bug fix — see the at-cut entry below.
- **Expect `PROTECTED` on the first sync of every existing project.** Measured 2026-07-26: PP has
  **16** vendored `src/` trees and roost **1**, and **not one of them has a
  `.template-sync.json` manifest** (`find … -name '.template-sync.json'` → 0 in both repos). No
  manifest means unknown provenance, and unknown provenance reads as project-authored, so the
  first run on each project will report several `PROTECTED` files. **That is correct and safe** —
  it is the fix working — but someone has to *expect* it rather than reach for `--force`. The
  right response is to look at each `PROTECTED` file, confirm whether it really is project work,
  and only then decide. `--force` is the only way to lose content, and it is never the first move.

**Open, unchanged by this branch (all pre-existing):**

- **WPI's `TS2322`s — 18 of them**, not the 4 recorded in Phase 2.5. Pre-existing, not a bump
  regression; the authored literal is not ours to edit. Item 14 of `phase3-migrations.md` scopes
  WPI's migration as needing its own plan and its own session.
- **3 PP projects edited but never installed** (`pp-cyklostezka-chrudimka`,
  `pp-druzstevni-parkovani`, `pp-plovarna-napojeni`) — `npm ci` still fails there.
- **8 PP project editors missing devDependencies.** Now *fixable* by one `sync_template` run;
  running it is a brand-repo action.
- **The two brand `chore/phase2.5-toolkit-migration` branches** — see the note under "Carried
  out of Phase 2.5" for how PP's state has moved since.

**⚠️ The roost repo is a moving target — re-verify before applying anything to it.** During
Phase 3 it was checked out on **`claude/exciting-hellman-35e25a`**, not the reviewed
`chore/phase2.5-toolkit-migration`, with concurrent work from another session: its log carries
`bump toolkit -> core e84473f9 / 1b4dd491 / edd43d3a`, core SHAs that **do not exist in this
repo's history**, and files moved mid-flight (`templates/roost-reels/src/lib/resolve-video-source.ts`
existed at the start of the session that surveyed it and was gone by the end). Every roost item in
`phase3-migrations.md` is therefore written against the **documented baseline** —
`chore/phase2.5-toolkit-migration` @ `aecf1b9`, toolkit pinned at core `59d4b30` — read with
`git show <branch>:<path>`, not from the working tree. **Re-verify every roost item, line numbers
especially, against the branch you are actually on before applying it.**

---

## ✅ Phase 4 outcome — the node contract is open, every kind behaves as its name promises, and the phase is COMPLETE

**Branch:** `refactor/phase4-node-contract`, merge base `9202e79`. **Not merged, not pushed.**

**Status: all six workstreams plus two unplanned tasks are done and reviewed.** Workstream 1 (the
node contract), Workstream 2 (every kind behaves as its name promises — see "Workstream 2 outcome"
below), Workstream 3 (effects: one contract, no exceptions), Workstream 4 (closing the write-only
props), Workstream 5 (geometry tokens), and Workstream 6 (conformance example, dev warnings, this
gate documentation) are **all complete**. Two unplanned tasks were added mid-phase with the user's
authorisation: **Task R1** (an editor-only transition-remount regression a user caught mid-run,
confirmed fixed in a real browser) and **Task R2** (a partial improvement to the same class, which
surfaced that the real fix is architectural and produced
`docs/superpowers/phase5-single-mount-design.md` — Phase 4's successor; see below). This section
and "Workstream 2 outcome" carry the two workstreams' own numbers; where they disagree, the later
one (this section) supersedes.

**Tasks landed:** 1.0, 1.1, 1.2, **1.2b** (added mid-phase, not in the plan, user-approved), 1.3,
1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, **4.4**
(controller-added, user-mandated — the editor surface Important 3 of Task 3.2's review deferred),
5.1, 6.1, 6.2, 6.3, 6.4 (this task), plus the user-directed removal of `fade-coal` from core
(replaced by the generic `fade-to-color`) and making `buildVideoNodes`' `palette` a required
option. **Nothing from the plan is left not-started.** Task R2's wall investigation is what
produced the Phase 5 design; R2 itself shipped a real, partial, user-confirmed improvement (see
"Task R1/R2" below) — the full architectural fix is Phase 5's, by design, not a Phase 4 gap.

Re-derive branch totals rather than trust any figure carried forward — they moved repeatedly
during this session:
```bash
git log --oneline $(git merge-base main HEAD)..HEAD | wc -l
git diff --stat $(git merge-base main HEAD)..HEAD | tail -1
```
Measured 2026-07-30 at HEAD `deb9efb` (the commit before this task's own): **122 commits**,
**120 files changed, +21931 / −1709**. As in Phase 3, **the range cannot include the commit that
carries this text** — a commit cannot state its own diffstat, so re-run the commands above after
this commit lands rather than trusting the numbers above as still current.

### Gates, measured fresh at the Task 6.4 hand-off (2026-07-30, HEAD `deb9efb`)

Every figure recorded earlier in this section (and in `CLAUDE.md` before this task) is now stale;
these replace them. Exit codes were captured **separately** from error counts, because
`grep -c 'error TS'` reports 0 when tsc *crashes*.

| Gate | Command | Value |
|---|---|---|
| Editor tests | `cd lib/editor && npx vitest run --no-file-parallelism` | **103 files / 1464 tests** — 1460 passed, **4 skipped**, 71 s this run. **A kind, task or warning added/removed moves this number** — re-derive per file, never carry forward |
| Editor types | `cd lib/editor && npx tsc --noEmit ; echo "exit=$?"` | **3** errors, **exit 2** — `LayeredInspector.tsx:1052` (`hide`), `derive-layered.test.ts:277`, `../theming/envelope.test.ts:1` (`Cannot find module 'vitest'`) |
| Render/transition types | `cd examples/layered-minimal && npm run typecheck` | **0**, coverage guard ok (render 12 / transitions 16 / theming 26 / reel-config-base 10 / transcripts 1 — each at or above its recorded floor) |
| Pixel harness | `cd examples/layered-minimal && npm run pixel-gate:strict` | **PASS**, 301 stills (one cell needed its documented one-shot retry) in **59 s**. `300 accepted (12 on a bimodal cell's second recorded hash), 0 same-picture-different-bytes, 0 drifted, 0 missing`. **Zero** `knownDefective`/`semanticXfail` entries (both empty since Task 2.1). `bimodalCells` is **24** (`clock-wipe` 9, `iris` 7, `light-leak` 8) |
| Brand leak | `grep -riE 'lime\|teal\|roost\|progresivn\|sand-brown' lib/ --exclude-dir=node_modules --exclude='*.test.*'` | exactly **2** known hits (`lib/theming/effects/ken-burns.ts`, `lib/transitions/presentations/burn.tsx`) |
| `it.fails` guard | `grep -n 'it\.fails' lib/editor/src/at-cut-transitions.test.tsx` | **zero** — all four historical pins (`checkerboard`, `pixelate`, `scanline-glitch`, `wipe`) were converted to real fixes in Task 2.1. Use the **escaped** dot; the unescaped grep has produced a false positive twice from prose describing the old pins |
| Python — `sync_template` | `./.venv/bin/python -m pytest video_toolkit/tests/test_sync_template.py -q` | **36 passed**. System `python3` has no `pytest` — use `./.venv/bin/python` |

**The pixel harness cannot see the editor-mount-lifecycle defect class, in either direction** —
it renders 300 fully independent stills, so cross-frame mount reuse (the Task R1/R2 territory) is
structurally invisible to it. That class is pinned separately by
`lib/editor/src/video-track-remount.test.tsx`'s DOM-identity assertions. A gate table that implies
the pixel harness covers transitions end-to-end would be wrong; see
`docs/superpowers/transition-pixel-harness.md` for the full mechanism (bimodal cells, the union
re-seeding rule, why `--strict` and not the lenient default is the mode a parity claim must use).

**Gates are, and remain, entirely MANUAL — this was a deliberate choice for Phase 4, not an
oversight.** CI was considered and rejected: the full matrix above is roughly 2.5 minutes serially,
and the gate-economy discipline that made this phase's pace possible (run only what a diff can
move, state a skip's reason, one unconditional full matrix at the end of each task and at the
final review) depends on a human judgement call per diff. A future CI job should run the complete
matrix on merge/release; it should not try to replace the per-task conditional logic, which would
either re-run everything every time or reimplement the same judgement in pipeline config with none
of the context. Do not read the absence of CI here as something to "fix".

**The final whole-branch review verdict: mergeable as a partial Phase 4, no Critical findings.** It
raised eight items (one cross-task Important, three must-fix-before-merge, four minor); all eight
were closed by a single fix wave (`b3d4f31..d060eb1`, 9 commits) and re-verified, with two of the
wave's mutation claims reproduced independently. Zero pixels moved.

The cross-task finding is the one worth remembering, because **no per-task review could have seen
it**: eight tasks each edited the transition path in sequence, and the editor's timeline lane was
still drawing every transition block unconditionally centred while the renderer had learned to
place windows by `alignment`. Two ways to ask "where does this transition sit", and one had become
wrong. It was latent — no editor control writes `alignment` and no baked literal uses it — but it
is exactly the class of drift that per-task scope cannot catch. Closed by extracting
`transitionHandles` / `transitionAlignmentOf` into `lib/reel-config-base/transition-schema.ts` so
renderer and lane read one decider; a repo-wide grep now finds exactly one `frames / 2` split, the
one inside that helper.

**One residual, deliberately left:** the lane has no edge clamp on the **closing** block (a last
item's `transitionOut`). The renderer zeroes `outHalf` at the trailing edge, but the lane draws
that block per `alignment`, so a last-item `alignment: 'start'` would be drawn past the reel's end.
The opening block did get the edge-independent treatment; the closing one did not, and the new test
only exercises a mid-reel cut. Impact today is zero (nothing writes `alignment`) and it is
editor-cosmetic — but it will surface the moment `alignment` gets an editor control, which is
itself pending work.

### The final whole-branch review, and the closing fix wave (2026-07-30)

**Verdict: mergeable with fixes, no Critical.** Run on the most capable model over
`9202e79..a7bcd5a` (123 commits, 1.7 MB — too large to read whole, and it was told to
prioritise rather than try). Every finding was drift between code and a **tracked
description** of it, plus documentation that would have been lost. All code gates were green,
the render path intact, and the architecture the plan promised genuinely in place.

**It found the third cross-task drift** — the class no per-task review can see, and the third
time this programme has been bitten by it (Workstream 1's timeline lane, Workstream 2's
registry JSON, now this):

> **`styleEffects` is a live SEVENTH extension axis that three places called the sixth.**
> Task 3.2 added `BrandTheme.styleEffects`; Task 6.2 then built the conformance example whose
> entire stated purpose is "every extension axis in one theme" — and it contained **zero**
> `styleEffects`, while `docs/creating-brands.md` promised it registered "all six, each
> pinned". Same shape every time: two places hold one fact, and the unwatched one goes stale.
> A brand author following the docs would have found no style-effect precedent, registered on
> `effects` by analogy, and got silently-skipped dead code that no core test notices.

It also **corrected a claim the controller had repeated to every reviewer**: "R1 is
preview-gated behind one predicate, so the render path is unchanged **by construction**" is
false for one third of R1 — `transitionNodeFor`'s memo cache is **universal**, and the code
says so. Its render-path neutrality is an **argument**, not a construction: the cache key is
complete, and the only per-mount state in any presentation is two unseeded SVG `id`s with no
`useEffect` or setter anywhere. That argument holds for **today's presentation set** and
breaks on the first presentation with frame-accumulating `useState`. Recorded here and in
`lib/render/README.md` rather than left in a reviewer's head.

**The closing fix wave** (`a7bcd5a..4e1f13f`, 5 commits) closed all eight must-fix items —
the seventh axis wired into the conformance example **and pinned against the shipped theme**
(mutation-verified red), `creating-templates.md`'s references to the deleted
`RESERVED_EFFECT_TYPES` API, two exhaustive-enumeration miscounts in `phase4-migrations.md`,
stale counts in two "keep in sync" documents, the preview/render divergence, and the
deferred-minor sweep. Its scoped re-review verdicted all eight ADDRESSED with no new breakage.

**One method note worth more than the fix:** the wave's own report claimed the pytest gate
baseline "36 was stale, actual 105". It was not — it ran `video_toolkit/tests/` (the whole
suite, 105) instead of `video_toolkit/tests/test_sync_template.py` (the gate, 36) and
concluded the gate was wrong. **A report's claim is not evidence, and that applies to a fix
wave's report as much as to a task's.** The false number was caught before it reached any
tracked file; every tracked file still correctly says 36. If you see 105 anywhere, it is wrong.

### Final gates, at the true branch HEAD `4e1f13f`

These supersede the Task 6.4 table above, which was measured at `deb9efb` — before the fix
wave added two tests.

| Gate | Value |
|---|---|
| Editor tests | **103 files / 1466** — 1462 passed, **4 skipped** (+2 from the seventh axis's pins) |
| Editor types | **3** errors, **exit 2** — the same three, and their *identity* was checked against the merge base, not just their count |
| Render/transition types | **0**, coverage guard 12 / 16 / 26 / 10 / 1 |
| Pixel harness | **PASS** — 300 accepted (13 on a bimodal second hash, 1 documented one-shot retry), 0 drifted, 0 missing |
| Brand leak | exactly **2**, both comments |
| `it.fails` | **zero** (escaped grep) |
| Python — `sync_template` | **36** — the gate is that **file**, not the suite |

### What landed — Workstream 1, the node contract

A brand can now add a transition kind in **~5 lines** of theme (`transitions: { 'sand-sweep':
{ renderer, params } }`) with **zero core edits**, and that kind is pickable and editable in the
editor.

1. **The transition schema is open** (Task 1.0). `Transition` is now `CoreTransition |
   BrandTransition` — a **plain union**, so `t.kind === 'slide'` no longer narrows and anything
   needing a core member must say `CoreTransition`. `BrandTransitionSchema.kind` carries a
   `.refine(!isCoreTransitionKind)`; without it, a core kind that fails its own member falls
   through the union and parses shape-only. Exhaustiveness survived: deleting an entry from
   `Record<TransitionKind, Renderer>` still gives `TS2741`, reproduced by the reviewer.
   New shared `lib/render/warn-once.ts` (Task 6.3 must reuse it, not duplicate it).
2. **One `ParamField` for both axes, plus `Animatable`** (Task 1.1). The descriptor lives in
   `lib/reel-config-base/param-field.ts`, *beneath* both axes — `lib/theming` imports
   `lib/reel-config-base` and never the reverse. New controls that did not exist before:
   `burn.mask`, `burn.glowColor`, accent params on the effect/bag path, `percent`, `angle`,
   `color`; numeric transition sub-options now carry the schema's own min/max.
3. **`BrandTheme.transitions` + shared resolution** (Task 1.2), and **the editor surface for
   them** (Task 1.2b, added mid-phase). 1.2's review found a live **data-loss** defect:
   `LayeredInspector.tsx` coerced any unrecognised kind to `{kind:'cut'}`, so a brand transition
   authored in `Root.tsx` displayed as "Cut" and was *destroyed* the moment a user touched any
   control in that section. Fixed, plus a picker and controls derived from
   `theme.transitions` via `EditorMeta.transitionProps` — no new threading mechanism was needed,
   the theme already reached the inspector as `EditorMeta`.
4. **Two-input transition rendering** (Task 1.3) — the structural change. First run against
   **untouched** goldens: **293/300 byte-identical** through a full compositing-model rewrite.
   All 7 that moved were `glitch`, and that re-baseline was **proven** legitimate (below).
5. **`alignment`** (`'center' | 'start' | 'end'`, Task 1.4). `center` is byte-identical. Odd
   frame counts split floor/ceil. The schema moved `ZodUnion → ZodIntersection` with all four
   Task 1.0 properties verified to survive. Edge behaviour is **clamp** — a reel edge is not a
   cut, and overrunning would make a *look* setting change *reel length*.
6. **`enabled`, `config`, and one `cut` predicate** (Task 1.5). There were **seven** cut
   special-cases, not the plan's five — two more lived in the editor's transitions lane
   (`lib/editor/src/timeline/layered-adapter.ts:63,69`). All now read `isCut` / `CUT_KIND`.
   `isNodeEnabled` is `!== false`, not `!enabled`, so an absent flag means enabled.
7. **A declarative accent mark** (Task 1.6) replacing the `AccentKey` `WeakSet`, which silently
   lost its mark through `.min()` / `.nullable()` / `.readonly()` / `.catch()` / `.transform()`
   chains — the failure mode being a field with *no editor control at all*. The colour axis was
   replaced too, deliberately: one shared `marker()` served both, so doing accent alone would
   have left the identical defect alive for colour.
8. **The pixel-regression harness** (Task 6.1) — 300 goldens = 20 kinds × 3 modes × 5 progress
   points, kind list derived from `TRANSITION_CATALOG` via `getCompositions()`, not hardcoded.
   This is the new gate in the table above.
9. **An effect-merge baseline** (Task 3.1, test-only) — all 18 cells of 2 crop × 3 ken-burns ×
   3 grade, exact strings, literals dumped from a run. It pins three findings **as-is rather
   than fixing them**, for Workstream 3 to decide: a no-crop + `direction` ken-burns pivots
   `50% 50%` while `objectPosition` is the focal point; a from/to ken-burns discards the crop's
   `objectPosition` entirely; and `transform` + `transformOrigin` spread as a unit, so an origin
   without a transform is silently dropped.

### The findings that must survive

These cost real measurement. A fresh session should not pay for them twice.

**1. Render non-determinism is BIMODAL, not noisy — and its rate is NON-STATIONARY and
PROCESS-DEPENDENT.** ~2070 renders were spent establishing this. Every differing pixel in every
pair sits in the **rightmost 8 columns** of the 540 px frame; 16–28 px of 518,400 differ; alpha
never changes. Each affected cell has exactly **two globally stable attractor hashes**, identical
across runs, orderings and fresh processes. The worst 8×8 cell mean shift ever observed was
**0.0183/255**, which always reports delta 0 — so the flake and the regressions the harness fears
(delta 1–2) are **cleanly separated**. It reproduces in a fresh process with a single render, so
it is renderer non-determinism, **not** a harness state-leak; do not chase browser lifecycle.
"Curved edge" is the wrong predictor — `clock-wipe`'s boundary is a straight radial ray and
`light-leak` has no clip path at all.

> **The consequence for methodology:** raising `--repeat` *within one process* just re-samples
> the same draw. One cell was 6/12 in one pass and 0/24 in the next (p ≈ 6e-8 if stationary).
> **Separate processes are the enumerating axis.** Hence the **union rule**: a re-seed can never
> *drop* a recorded attractor on absence — without it, a re-seed de-listed three genuinely
> bimodal cells. The committed list is **24 cells** (19 → 18 when Phase 4 Task 2.2 re-baselined
> the reel-edge goldens; → 24 when Task 2.3 confirmed six more at 24 samples each —
> `iris__exit__p1` and five `light-leak` edge cells, all of which had been failing `--strict`
> intermittently on this machine while unlisted, and all added by UNION with their existing
> hash, never replacing it), a **lower bound**, and **machine-specific**.
> `--audit-bimodal` will **XPASS spuriously** on `light-leak` for the same reason: treat an XPASS
> as "re-run in a fresh process", **never** as grounds to de-list.

Two agents reached 19 cells by different sampling designs — corroboration, not collision. Zero
three-hash cells were ever seen; a third value still fails under `--strict` (tested
synthetically), and `--update-goldens` cannot silently add a second hash.

**2. roost's frame-45 flake was NOT a bump regression.** Measured n=20 at each pin: frame 45
gives two distinct hashes at **both** the old and the new pin (14/6 and 17/3), and **the two hash
values are byte-identical across pins** — only possible if the source is orthogonal to what
changed. Frame 0 flips too, so it is not frame-specific, and the differing region is a
ken-burns-panned photo, not text (font-race ruled out). **Correlation:**
`projects/roost-reel-01/remotion.config.ts:12` sets
`Config.setChromiumOpenGlRenderer('angle')`; core's example and PP set no OpenGL renderer at all,
and both hold byte-identical. Not proven causal, but it is the one config difference. **Do not
adopt roost's ANGLE setting in the harness.**

**3. The `glitch` re-baseline was proven a pure clock rebase, not accepted on trust.** The
reviewer patched `glitch.tsx` to `useCurrentFrame() + 40` — the exact old→new clock offset — and
**reproduced all four deleted exit golden hashes byte-for-byte**. So the drift is a frame-origin
shift: no restacking, no alpha, no geometry. Boundary-relative is the *right* clock; the same
authored transition now renders identically wherever it sits. `glitch__enter__*` did not move,
because boundary and clip share an origin at a leading edge.

**4. ⚠️ The `presentationFor` trap — the single most important thing for whoever does
Workstream 2.** `presentationFor`'s blast radius is **6 files**, not the 2 originally believed:
five `projects/*/src/WebProgramIntro.tsx` plus `templates/web-program-intro/`. When Task 2.1
makes `checkerboard` / `pixelate` / `scanline-glitch` / `wipe` native two-input, `presentationFor`
returns `null` for them and **all six sites silently degrade to hard cuts with NO type error**.
Related: fixing `scanline-glitch`'s opaque third `AbsoluteFill` will **unmask** the identical
frame-origin shift `glitch` just had — expect its goldens to move for the same clock reason.

**5. The grep bug that produced a false negative.** `grep -vE 'toolkit/'` matched *every* path in
a repo **named** `video-toolkit`, so the exclusion ate all of its own hits. It produced a
confident, false "no brand authors `glitch`" claim in the migration doc. The corrected sweep:
exactly **one** real authored `glitch` cut (`pp-mov-koalice/src/Root.tsx:76-79`, at a genuinely
contiguous boundary — that reel's noise *will* change), one type-union member
(`pp-05-zastupitelsky-klub/src/config/types.ts:15`), and **zero** in roost. Anchor your
exclusions.

**6. The overlapping-boundary defect NEEDS ITS OWN TASK.** Task 1.3 assumed Task 1.4 would own
it; that premise was **wrong**, and the reviewer derived why from the code rather than the prose.
Overlap ⇔ `inFrames + outFrames > normalDuration + inHalf + outHalf`, which reduces to "windows
longer than the clip" for **all three alignments** — *alignment cancels out of the magnitude*.
The only fix is **shortening** a transition, which changes the progress curve: a render-changing
policy call (shrink both? favour the earlier? refuse?) needing its own parity assessment. What
shipped is a dev `warnOnce` diagnostic at `lib/render/video-track.tsx` so it is a message rather
than a mystery. **No reel in either brand repo is affected today** — every video track in all 11
PP projects and in `roost-reel-01` is contiguous with zero gaps, verified.

### Known gaps in what shipped

Say which half is done, not that it is done:

- **`enabled` has editor SURVIVAL but no editor CONTROL.** Authorable in `defaultProps` only, on
  both axes. The contract is delivered; the UI is not. The editor's transitions lane also draws a
  disabled transition identically to an enabled one — the render path is correct, the UI
  treatment needs a design decision.
- **`alignment` likewise: survival, no control.** Task 1.4's fix round made it survive a kind
  switch (it was previously destroyed by `defaultTransition` carrying only `frames` forward — the
  same defect class as 1.2b's), but there is still no row for it beside the length field.
- **`Animatable` ships entirely dead** — ~92 lines and 11 tests, zero references outside its own
  module. Brief-mandated, so not a spec violation; if the ken-burns migration slips past Phase 4
  it stays dead.
- **Task 1.6's trade-off, accepted knowingly:** the accent/colour decision moved from schema
  identity to **field name**, inverting a documented principle in `param-field.ts` ("a field is
  color because its schema says so, never because of its name"). New failure mode: a future core
  kind naming a non-accent field `color` silently gets a palette picker. Guarded by three
  assertions, and scoped to core's **closed** catalog only.
- **Tasks 1.6 and 1.2b had their reviews deferred to a final whole-branch review that never
  ran** — the branch was handed off first. Both were mutation-verified by their implementers, but
  neither has an independent review.

## Workstream 2 outcome — every kind behaves as its name promises

**Tasks 2.1–2.7, all complete and independently reviewed, plus a final whole-workstream review
whose fix wave has landed.** Re-derived from `git log` / `git diff --stat` over
`6dbd60e..898cab7` — the range from Workstream 1's close to Workstream 2's, never carried
forward from a running total: **22 commits, 44 files, +4646 / −1054**. Re-derive rather than
trust this after any further commit; a commit cannot state its own diffstat. (The last three
commits are the 2026-07-29 **user corrections** — see findings 2 and 3 below — plus their own
review's four accuracy fixes.)

**The final review's verdict: mergeable, no Critical, no wrong picture, and — the thing it was
sent to find — the render path carries no cross-task fork.** It reconstructed the golden
sequence at all seven task SHAs (0 cells lost, all 9 bimodal value changes strictly additive,
end state 315 cells / 24 bimodal with zero orphans), reproduced `TS2741` by deleting
`'dissolve'`, confirmed 8 bad-payload core kinds still fail parsing after all three schema
edits, and confirmed `grep 'frames / 2'` still returns exactly **one** hit. It raised two
Important and six promoted minors; a single fix wave (`20bfc36`) closed all six and a scoped
re-review verified each, including by re-introducing the registry staleness and watching the
widened pin go red.

**The cross-task defect it did find was in a JSON file, not in code.** `_internal/toolkit-registry.json`'s
`zoomThrough` entry still advertised `from` — Task 2.4 edited that entry, Task 2.5 changed the
fact, and nothing connected them, so `/toolkit:cut` reading the registry (which `CLAUDE.md`
calls canonical for options) would have authored the exact literal 2.5 exists to retire. It
survived seven per-task reviews because the options pin enumerated **six hardcoded kinds**. The
pin now **derives** its kind set from the registry map itself. That is the Workstream 2 analogue
of Workstream 1's timeline-lane finding: two places holding one fact, and the one nobody was
watching went stale.

### Gates at Workstream 2's close (2026-07-28), each run by the controller, not taken on report

| Gate | Value |
|---|---|
| Editor tests | **91 files / 1264** (1259 passed, **5 skipped**), ~44 s |
| Editor types | **3** errors, **exit 2** — the same three, read separately from the count |
| Render/transition types | **0**, coverage guard at or above every recorded floor |
| Pixel harness | **PASS** — `315 accepted (13 on a bimodal cell's second hash), 0 same-picture-different-bytes, 0 drifted, 0 missing`, ~47 s |
| Brand leak | exactly **2**, both comments (`lib/theming/effects/ken-burns.ts`, `lib/transitions/presentations/burn.tsx`) |
| Python — `sync_template` | **36 passed** |

**Three baselines moved, all deliberately and all declared:**

- **The four `it.fails` known-defect pins are GONE.** `grep -n 'it.fails'
  lib/editor/src/at-cut-transitions.test.tsx` now returns **nothing**, and a new one appearing
  is a new known defect. The **5 skipped** in the run are a different thing
  (`it.skipIf(isNode)`); their params are pinned by the differential param test at
  `at-cut-transitions.test.tsx:357`.
- **The harness is 300 → 315 cells** (21 kinds × 3 modes × 5 progress points; Task 2.3 added
  `fade-to-color`).
- **`bimodalCells` is 19 → 24**, every change addition-only under the union rule. One
  intermediate state looked like a violation and was not: Task 2.2 took it to 15 because six
  `light-leak` edge cells had their goldens **fully replaced**, so they left through the
  `!stillTheSameCell` branch rather than being de-listed on absence — verified per cell by a
  reviewer. It was then re-seeded at `--repeat=12` and confirmed at 24 samples.

### `MinimalReel`'s reference hashes — and the prediction that was wrong

| frame | sha256 |
|---|---|
| 0 | `1c7563d8f71cd8011c57bdca451ec4a4e3a7808608140bc989bf52142303c3d2` |
| 30 | `85a4d6a051394b7034eeec60f2d15a6a8a71fc5140e33f5064bfed2735d50b3c` |
| 45 | `7c1512ed39018f728a93b648d6ebbb18fda8d73eb8f12d8dc2a5bb74d70169ee` |
| 90 | `8909970fb4802bf9f7e24e2a6e4862735bffa7c64f5cd983a7ce4d58aaf9253d` |
| 120 | `a6b7a9175ebe3c0dbf97c002b1f74517bd669062a1926177037be909de624778` |

**Only frame 90 moved, and only in Task 2.1.** The plan and every earlier draft of the
constraints predicted **frame 45**; that was wrong. `MinimalReel`'s `wipe` cut is at 3000 ms,
so its boundary window is frames **80–100** — frame 90 is the only sampled frame inside it and
frame 45 is mid-clip. Tasks 2.2–2.7 each held all five byte-identical.

### The findings that must survive

**1. The `presentationFor` trap was LATENT, not active — and it did NOT widen.**
The blast radius is confirmed at **6 files** in PP (five `projects/*/src/WebProgramIntro.tsx`
plus `templates/web-program-intro/`), roost **0**. But **none of the six authors any transition
at all** (`transitionOut:` = 0 in all six) and there are **zero authored uses** of the four
converted kinds in either repo, so no brand pixel changed. A `warnOnce` warning was added
rather than a compatibility shim — a wrong picture silently is worse than a visible
degradation. Task 2.2's conversions did **not** widen the set. The 2026-07-29 `fade-coal`
correction briefly made it five, because a dip has no one-sided form — but `fade-coal` was
then **removed from core outright** (the user's call: core has no business holding one
brand's colour word, nor picking a "neutral" black on a brand's behalf), so `NODE_KINDS` is
back to **four** (`checkerboard`, `pixelate`, `scanline-glitch`, `wipe`). `fade-to-color`
is a node **only when its `color` resolves** — conditional arity, reviewed and accepted,
and pinned in both directions rather than by membership of that list. PP's one authored
`fade-coal` literal must now be rewritten (`docs/superpowers/phase4-migrations.md` § 2.3-a);
it is in a **layered** reel, which never touches `presentationFor`, so this trap is not
what it hits — a parse error is.

**2. Neither brand registers a single effect or transition — which is the UNAPPLIED-MIGRATION
state, not a fact about the kinds.** *(Conclusion corrected 2026-07-29; the measurement is
unchanged and was re-derived independently by a reviewer under its own anchored greps.)*
`vintage` and `blend` are `defaultProps` entries read by brand **video renderers** today; PP's
only registry keys are `overlays.text` and `video`, roost's likewise. But
`phase3-migrations.md` **§2 requires PP to register `blend` as a brand effect** and **§4 rules
that roost's `vintage` STAYS brand-registered** (params-only). **Phase 3.5 is unapplied — that
is why nothing is registered**, and registering both is the intended end state. This refutes
nothing about the promotion table; the classification's verdicts in
`docs/superpowers/phase4-extension-contract.md` stand on their **merits** (what core's
rendering model can express), and were re-checked one by one against `phase3-migrations.md`
when this was corrected — none of them depended on the wrong inference.

What *does* bear on the plan's framing is authored **demand**: every transition either brand
authors is already core — **10 distinct kinds against a 21-kind catalog, so 11 of core's kinds
are authored by neither.** `vintage(vhs)` has **zero** authored uses; `vintage(film)` has zero
in a real reel (all six are in roost's template demo, none in `roost-reel-01`). And
`sepia(0.22)` needed **no** non-diagonal WB matrix — just a CSS filter core had not added.

**3. A brief's premise is not evidence, and three briefs were wrong on measurement.** Each was
caught only because the task re-derived rather than conformed: the exiting-no-op family is
**eight**, not seven (`checkerboard` joined it in 2.1); the gallery covered **8 by name + 1 by
catalog kind**, not "10 of 20", against a **21**-kind catalog; and Task 2.3's brief specified
`fade-coal`'s colour default as **black** while also requiring existing literals to keep their
pixels exactly — on measurement those conflict, because pre-correction `fade-coal` was literally
`() => fade()` and never dipped, and all 15 `fade-coal__*` goldens were hash-identical to
`fade__*`.

> **The RESOLUTION of that conflict was wrong, and took TWO corrections.** The task first
> shipped "no colour" for parity; the user's goal was the opposite. **`fade-coal` not
> dipping was the defect** — its label promised a dip to black that never happened, which is
> the very thing the plan cites it for. The 2026-07-29 correction made it dip through a
> hardcoded `#000000` and moved 10 of its 15 golden cells.
>
> **That was still wrong, and the user removed the kind.** A `DEPRECATED_FADE_COAL_BLACK =
> '#000000'` constant in `lib/render` is core choosing a colour on a brand's behalf — the
> same class of leak as a brand hex, one step abstracted, and it passes the brand-leak grep
> just as cleanly. `fade-coal` is now **gone from core entirely**: no alias, no shim, no
> constant. Core ships the generic mechanism (`fade-to-color`, colour exposed as a
> parameter); the brand supplies its own colour through its own `accentSlots`. The harness
> went 315 → 300 cells, `TRANSITION_KINDS` 21 → 20, and § 2.3-a of `phase4-migrations.md` is
> re-graded again — from "deliberate look change" to a **required, breaking migration** with
> a two-edit rewrite. The measurement in this finding was right; the conclusion drawn from it
> was wrong twice. **A brief's premise is not evidence — and neither is a task's own
> re-derivation of the goal, nor a correction's.**

**4. The gallery had been demonstrating a component reels never rendered.** Task 2.5 deleted
Remotion's official `wipe` from core; core's native two-input `wipe` is the only one. Because
`TransitionSeries` **structurally cannot drive a two-input node**, the gallery needed a real
new path (`NodeTransitionDemo`, an `AtCutTransition` in its own `Sequence`), not an import
swap. Task 2.6 then drove the whole gallery off `TRANSITION_CATALOG`, taking coverage to 20
demonstrable kinds and deleting `noteFor`.

**5. `CLAUDE.md`'s type-check-coverage row was stale.** It claimed `TransitionGallery.tsx` was
reached only by `examples/layered-minimal`; `npx tsc --noEmit --listFiles` gives 16 of 16
`lib/transitions/` files including the gallery, because Task 2.5's test file began importing
it. Corrected. **Nothing in any gate RENDERS the gallery** — it is type-checked by both `tsc`
gates and by nothing else, and that is stated plainly rather than papered over.

**6. The `it.fails`-guard grep has bitten twice more.** Prose *describing* the old pins matches
an unescaped `grep -n 'it.fails'`. Both false positives were reworded; use the escaped form.

**7. Two near-misses worth remembering as method, not as blame.** Task 2.5's first fix used a
stray cast that took editor `tsc` **3 → 4** (`TS2352`), caught **only** because the error count
is read separately from the exit code. Task 2.7's first draft broke the brand-leak gate
**2 → 3** with a comment saying "roost's VHS look" inside `lib/` — a document that classifies
brand kinds by name belongs in `docs/`, outside the grep's scope.

### Known gaps carried out of Workstream 2

- **`wipe`/`pixelate`/`scanline-glitch` still handle a null edge input their own way** — the
  edge rule is not uniform across the catalog.
- **A trailing-edge transition never renders progress 1** by construction (`outHalf` is zeroed
  for the last item), so a fade-out ends at ~95 %. Pre-existing layout, now merely visible.
- **`TRANSITION_NOTES` is still hand-maintained per kind** — the last such table in the gallery.
- **Core's five generic effects declare no `params`**, so there is no effect-axis equivalent of
  the transition differential pin, and Task 2.7's four new fields have no editor control on the
  effect-registry path. Pre-existing; it applies to all nine existing params too. Workstream 4.
- **`blend` and `ken-burns` have CONDITIONAL promotion verdicts** in
  `docs/superpowers/phase4-extension-contract.md`, each naming the exact contract
  (`EffectRenderProps`) and symbol (`RESERVED_EFFECT_TYPES`) that Workstream 3 must change.
  **Whoever writes the Task 3.2 brief must carry those conditions into it.**

## `fade-coal` left core — and PP is migrated (2026-07-29)

**User directive:** *"Don't wanna anything like this in codebase: `DEPRECATED_FADE_COAL_BLACK =
'#000000'`. This needs to land in brand repos which utilize it."* Core now ships only the generic
`fade-to-color`; the brand names its own colour. **No alias, no deprecation shim** — a baked
`{kind:'fade-coal'}` literal **fails to parse**, loudly and by design. The user also lifted the
core-only constraint for this migration and chose to bump PP rather than leave it written.

**Core** (`b31ac1a` … `61a9326`): the kind is gone from code, schema, catalog, renderer, editor,
gallery, registry and harness; `lib/render/at-cut-transitions.tsx` contains **no hex at all**.
The harness is 300 cells again. `NODE_KINDS` is four. **`color` now accepts an accent-slot key OR
a hex literal** on both `fade-to-color` and `wipe` — a brand hex in a *brand's* config is not a
leak; the rule is that **core** carries none.

**PP** (`~/Workspace/progpce/video-toolkit`, `main` @ **`29251f2`**, committed, **not pushed**,
submodule pinned to a **local-only** core commit): the literal carries the hex directly and the
fake `coal` accent slot is gone. The trailing dip is **visibly present** (monotonic fade to
coal-black across frames 1359–1388) and the colour is **live**, proven by swapping the hex to
`#ff00ff`, re-rendering, and reverting.

### The three findings that cost the most to establish

**1. The first PP migration typechecked, parsed, and did nothing.** The colour was **inert**:
frames pixel-identical to the old pin, deleting the slot changed nothing, forcing `#ff00ff`
changed nothing. My hypothesis — that Task 2.2's edge plate stole `color` at a reel edge — was
**wrong**; a node's own colour already wins there. The real cause was in PP:
`LayeredCampaignReel.tsx:407` calls `buildVideoNodes` **without `palette`**, so
`resolveAccentColor([], 'coal')` → null → documented fallback to plain `fade()`. That explains
all three probes at once, including why magenta changed nothing — an unthreaded palette makes
*every* key fail identically. **`wipe` has the identical latent bug at the same call site**, and
`background` being opt-in is why the failure was *perfectly* invisible. Core's real defect was
that this fallback was the last silent degrade on that path; it now warns, naming both causes.

**2. Accent-only was the wrong contract, and it distorted the brand's own model.** Forcing PP to
declare `coal` — a **background** — as an "accent" to satisfy core's type was the tell. Widening
`color` shrank PP's migration from two edits plus a fake slot to one hex.

**3. The fourth editor data-loss bug, and the test shape that finally catches the class.**
`literalMode` was derived from the **per-keystroke-committed** value, so typing `#` committed
`'#'`, which failed the literal check, which **unmounted the hex input mid-typing** — and
select-all-and-retype over a good `#0a0a0a` left `'#'` with no control to repair it. The shipped
tests missed it because they pass `onChange={() => {}}` and **never re-render**, so the component
never saw its own committed value return. A reviewer caught it with a **stateful parent**.
**That is the test shape to reach for**: the three earlier instances of this class (the inspector
coercing an unrecognised kind to `{kind:'cut'}`, `sepia: 1` stripped by a neutral-drop rule, the
`from` alias displaying as unset) would all have failed it too.

### The pixel harness took three rounds, and the shape repeated each time

Removing a kind was the **first time anything asked the harness to delete goldens**, and
`--allow-shrink` turned out to be barely built. Each round closed the loud failure and left the
quiet one: *missing composition* → *manifest present but payloadless* (`?? []` ran before the
`Array.isArray` guard, so an empty catalog authorised pruning everything) → *the `mode` and
`progress` axes had no shrink guard at all*, so narrowing `PROGRESS` under a **plain
`--update-goldens`** deleted 120 cells, de-listed 10 attractors for surviving kinds, and passed
the follow-up strict run because the axis rewrote itself. All three are closed, each with
reproduced adversarial pins. A cell has exactly three coordinates — kind, mode, progress — and
all three are now guarded, which is the reason to believe the class is closed; the pins are the
evidence, not that sentence. **`PROBE GEOMETRY CHANGED` is still update-path-blind** (it changes
cell *content*, not the cell *set*) and was decided by reasoning, not measurement.

### The follow-ups — all closed (2026-07-29)

**The WPI type regression was WPI's, and the attribution matters.** The +15 errors (3 each in all
five projects, `TS2339`/`TS2345`, `frames` on the `cut` variant) came from **Task 1.0**
(`062b4f2`), not Task 1.5 as first assumed: 1.0 made `Transition = CoreTransition |
BrandTransition` with `BrandTransition.kind: z.string()`, which **killed discrimination**. 1.5's
`cut` collapse never reached WPI. And `cut` **never had `frames`** — `9202e79`'s schema is
`z.object({kind: z.literal('cut')})`, byte-identical to today's, so **core dropped nothing**. WPI
was hand-rolling a `cut` guard against a union that had stopped narrowing. Fixed in PP
(`4492507`) by using core's `getTransitionRecord`, which is the *right* seam rather than a
convenient one: its parameter is deliberately `Transition | Record<string, unknown> | undefined`
("a project's `Root.tsx` is hand-edited, so this gate is the last line") and `Exclude` narrows
structurally, immune to the open `kind`. 3 → 0 in all five projects and the template.
`phase4-migrations.md` § 1.3-b — which graded WPI "no action / cannot be discovered by
compiling" — is corrected in place (`7e7aa9c`).

**PP's unthreaded `palette` was 11 call sites, not one** (`24ea7df`). Every pre-Phase-2.5 project
still carrying its own hand-rolled `LayeredCampaignReel.tsx` called `buildVideoNodes` without it.
**Parity-preserving, and structurally so**: only two accent-typed params exist
(`fade-to-color.color`, `wipe.color`), and the single authored instance uses a hex — so the
bimodal-render question never had to be adjudicated. Liveness was *demonstrated*, not assumed:
a temporary `color: 'lime'` rendered a solid lime dip, then changing the theme's `lime` hex to
magenta with no other edit re-rendered magenta. Probe fully reverted.

**`wipe` no longer no-ops silently** (`c991b28`). It fell back to `#000` with no diagnostic where
`fade-to-color` warns — one step behind for no reason but that nobody wrote it. Both directions
are pinned: an unresolvable key warns once, a valid key/hex/absent colour does not. And
`video-track.tsx`'s comment, which described omitting `palette` as harmless — **the sentence
under which 11 sites dropped it** — now says what actually happens.

Two of the earlier claims here were **wrong on measurement** and are corrected: all five WPI
projects *do* have local `typescript` (nothing was unverified), and the pre-existing `audioMode`
`TS2322` count is **17**, not 18 (1/9/7/0/0, plus 1 in the template — which the tally omitted).

`pp-mov-koalice` still renders differently from its old pin (mean delta ~1.1). **Expected** — the
`glitch` clock rebase from Task 1.3, graded at `phase4-migrations.md` § "One baked cut IS
affected".

### `palette` is now required — and roost is on Phase 4

The user's call, and the ordering was deliberate: **consumers first, contract second.**

**roost is bumped** (`~/Workspace/roost/video-toolkit`, `main` @ **`ffca36d`**, local, **not
pushed**). It started **already broken** — `projects/roost-reel-01` sat at `tsc` **2 / exit 2**
(`TS2604`/`TS2786`), un-migrated **Phase 3.5** residue, while its own template had already moved
to the thin wrapper. Now **0 / exit 0**. **Phase 4 itself added zero new type errors**; both
starting errors were Phase 3.5's. One `buildVideoNodes` call site, now threading `palette` /
`transitions` / `background`. `templates/roost-reels` needed no edit. `vintage` was **not**
promoted — `phase3-migrations.md` § 4 stands.

**`palette` is now a required option** (`62d0541`). Omitting it is a compile error
(`Property 'palette' is missing … but required`), verified by construction; reverting the field to
optional turns the pin red. The runtime fallback **stays defensive on purpose** — a hand-edited
`Root.tsx` is not type-checked at render time, which is the same reason `getTransitionRecord` is
documented as "the last line before the renderer". **All 12 brand call sites pass it**, verified
read-only by a reviewer: 11 in PP, 1 in roost, none in either `templates/`.

**A methodological finding worth more than the change itself.** roost's render comparison recorded
several frames as "byte-identical" from a single sample each. A reviewer re-rendered the report's
own *control* frame three times at a fixed pin and found it **nondeterministic, whole-frame Δ25**.
So **a single-sample byte-identity cell is a lucky draw, not evidence** — bimodality is not
confined to the rightmost-8-columns cases the harness catalogues, and any parity claim resting on
one render per frame is unfounded. roost's parity conclusion survives anyway, on an a-priori
argument that needs no renders at all: it authors neither accent-keyed kind, registers no
transition, and has no reel edge.

A 12×12 artefact in roost's outro **disappeared** across the bump and could not be attributed to
any documented change. It was ruled acceptable to ship: established as real and reproducible on
both sides, deterministic afterwards, an improvement to a pre-existing defect in a path Phase 4
does not touch — and **written down rather than rationalised**. If that region ever yields a hole
instead of a fill, this entry is what distinguishes it from a regression.

### Still open

- **⚠️ Push core before anyone else touches a brand repo.** Both brand pins point at
  `refactor/phase4-node-contract` commits that are reachable from **no remote branch**, so
  `git submodule update` fails for anyone but us until core is pushed. **This got worse, not
  better, during Task R1's follow-up**: with the user's explicit authorisation, roost's submodule
  was bumped again to core `d5582a8` (deliberately the last **fully reviewed** commit — all of
  Workstream 3, Workstream 4, and R1, excluding Task 5.1 whose findings were still open at the
  time) so the user could retest R1 in a real browser (roost `main` @ `f71b85d`). That retest is
  what produced the "works better now, acceptable" verdict above. Both brand repos still pin
  commits reachable from no remote branch; core is still not pushed.
- **`background` is still optional on `buildVideoNodes`**, and omitting it fails the *same silent
  way* — a reel-edge transition resolves to nothing instead of the brand background. The defect
  class is closed on one axis only.
- **`roost-reel-01` is a vendored hand-roll** of what the template gets free from core's
  `LayeredReelComposition`. That is why it silently missed all of Phase 3.5 and sat broken for a
  phase. **Every future contract change re-breaks this one file** until it adopts the wrapper.
- **Three PP projects had stale lockfiles** and needed `npm install` before `tsc` would run —
  their "green" state had **never actually been observed**. Same blind spot that let the pin bump
  ship +15 errors unnoticed. (Churn stashed in PP as `stash@{0}`, not committed.)
- **Task 2.1's `presentationFor` hazard is untouched**, in the same six WPI files. Still latent:
  none of the six authors a `transitionOut` at all.
- `lib/editor/src/fade-to-color-edge.test.tsx:299`'s `@ts-expect-error` pin suppresses **any**
  error on that line, so an unrelated type break in the same literal would keep it green while
  `palette` silently reverted to optional.

### Workstreams 3–6, plus Task R1/R2 — how the rest of Phase 4 landed

**Workstream 3 (3.1–3.4) — effects: one contract, no exceptions.** Style effects
(`lib/theming/effects/style-effect.ts`) give crop/ken-burns/grade ONE shared style object across
both the `Img` and `OffthreadVideo` branches, closing the pinning gap Task 3.1 had flagged by
construction. A media-scope effect axis (React context, `MediaEffectsContext`) lets a brand
registration wrap the actual media element (e.g. PP's `blend`), not just style it. `item.grade` was
re-expressed as a synthetic style effect evaluated first, with two new editor guards. Both Task 3.2
and 3.3 each shipped a capability that was **deletable in one line with the whole suite green** on
first review (`styleEffects={theme.styleEffects}` and the `MediaEffectsContext` provider,
respectively) — the same class Workstream 1/2 kept finding, now confirmed a structural pattern (see
"PIN THE WIRING" below).

**Workstream 4 (4.1–4.4) — closing the write-only props.** `anchoredOverlays` now actually renders
(a real overlay-anchor math module, per-endpoint rounding); the overlay axis (`tokens`,
`overlayConfig`) reached full parity with the video axis; captions got a real mount, routed through
Task 4.1's existing dispatcher, with a units bug (composition-relative vs. segment-relative) fixed
along the way; and **Task 4.4** — added mid-phase, user-mandated, not optional — closed the
editor-surface debt Task 3.2 admitted it owed (`theme.styleEffects` now has its own catalog
source). Every task in this workstream had at least one capability that was silently
undefended end-to-end on first review; every one was fixed and re-pinned by rendering through the
real composition, not a bare unit test.

**Workstream 5 (5.1) — geometry tokens.** Card pattern/stagger tokens and caption word-fade timing
now route through the theme rather than hardcoded literals; one genuinely unpinned capability
(`wordFadeMs` in pop-focus caption mode) was found and fixed in review, alongside a deliberate look
change (`highlight.wordGap` 0.45em → 0.4em) written up in `phase4-migrations.md` — including that
**PP does not consume core's `GenericCaptions` at all**, and carries an identical fork of the same
bug in its own `CaptionStrip.tsx`, which is now a documented migration target.

**Workstream 6 (6.1–6.4) — closing the loop.** 6.1 built the pixel-regression harness (see the gate
table above and `docs/superpowers/transition-pixel-harness.md`); 6.2 built a conformance example
registering all six extension axes in one non-core theme, and its own review found the example was
initially **pinned by nothing** (its test defined a private fixture rather than importing the
shipped one) — fixed, and the fix is itself now the strongest illustration of "pin the wiring, not
just the pure function" this phase produced; 6.3 added eight dev-only warnings for silent
extension-contract gaps (see the invariant below — it cost two fix rounds on the same defect
class); 6.4 is this task.

**Task R1/R2 — the editor-only transition-remount regression, and what comes after it.** A user
reported a colour flash / stagger at cuts in the Player mid-run. R1 diagnosed the cause precisely:
Task 1.3's two-input rewrite renders an item's media at **two different positions** in the React
tree across the frames a boundary owns (once under the item's own `Sequence`, once under the
boundary's rebased copy), and React reconciles by tree position, so the element is destroyed and
recreated twice per boundary — preview-only, because render extracts frames independently of any
DOM. R1 shipped **three fixes, two of them preview-gated behind `isPreviewEnvironment()`** (hide
instead of unmount; premount the rebased copy) **and one — the `transitionNodeFor` memoization
cache, `lib/render/at-cut-transitions.tsx` ~line 449 — that is UNIVERSAL, not preview-gated**: it
runs on every call, preview or render. Calling all three "preview-gated… so the render path is
unchanged by construction" (as an earlier draft of this section did, and as this reviewer told
the final-review pass repeatedly) overstates the guarantee for the cache specifically — it is not
gated out of the render path, it never enters it in a way that could change output. The argument
for why the render path is unaffected anyway is a property of TODAY's presentation set, not a
structural guarantee: the cache is pure memoization of a pure function's result (same inputs →
returned the SAME reference, not merely an equivalent one), and every current presentation's own
per-mount state is limited to two unseeded random SVG element `id`s — no presentation reads
`useEffect` or holds `useState` across frames — so reusing a cached node changes nothing a render
observes. The first presentation that accumulates frame state in `useState` breaks that argument,
not the cache's correctness; see `lib/render/README.md`'s own preview-vs-render section, added at
the same time as this correction, for where a maintainer should actually find this. This left
**all 300 pixel goldens and both brand repos byte-identical by construction**. **The pixel harness cannot see
this defect class at all** — it renders 300 independent stills and never exercises cross-frame
mount reuse; the dedicated gate is `lib/editor/src/video-track-remount.test.tsx`'s DOM-identity
test. **User verdict on R1, 2026-07-30: "Yeah, it works better now, still not ideal, but
acceptable. Schedule follow-up task to make this even better as the final step."** — R1 is
confirmed working in a real browser, not merely by test. R2 shipped one further, real improvement
(preview 4 → 3 media elements at an interior cut) and then investigated whether the remaining
architecture was a hard wall. **It was not, self-inflicted**: `@remotion/transitions`'
`TransitionSeries` nests both presentations around a shared item rather than relocating it, so a
single-mount design is possible without reverting the two-input authoring contract Task 1.3 bought
(arity 2, one progress value, one parameter set — all preserved). That investigation produced
`docs/superpowers/phase5-single-mount-design.md`, now committed as **Phase 4's successor**: an
11-task, staged plan, stoppable at every stage, with a **Stage 0** (checkerboard 66→3 elements,
scanline-glitch 7→3) that needs **no contract change** at all. R2 itself is `DONE_WITH_CONCERNS`,
accepted as an incremental, real win — the architecture is Phase 5's, by design, not a gap left
here. **Measured per-kind media-element counts at an interior cut, worth recording because nobody
would guess them:** `wipe` 2, `fade`/`pixelate`/`fade-to-color` 3, `scanline-glitch` 7,
**`checkerboard` 66**.

### Two laws added to CONSTRAINTS.md mid-session, and why they earned their place

**PIN THE WIRING, NOT JUST THE PURE FUNCTION.** Recurred **four times** across this phase: Task 3.2
(`styleEffects={theme.styleEffects}`), Task 3.3 (`applyMediaEffects(video)` → `video`), Task 4.2
(the overlay `tokens={theme.tokens}` line), and Task 6.2 one level up — its own conformance
example's ten tests pinned a **private copy** of the fixture rather than the shipped one, so
deleting the shipped theme/composition files together left every gate green. The mechanism is
always the same: new tests exercise the pure function in isolation, nothing renders through the
real composition path, so the prop that *carries* the new capability is free to vanish. The
counter-measure that actually works: for every capability a task claims to add, name the file:line
that delivers it (not computes it) and delete *that* line before calling the task done.

**USE `git grep` FROM INSIDE THE REPO.** A text filter manufacturing a false result recurred **six
times** in this programme, two of them inside `phase4-migrations.md` itself, one reappearing one
task after that same doc was corrected for exactly it (`grep -vE 'toolkit/'` against a repo named
`video-toolkit` eats every one of its own hits — anchor to `/toolkit/` or run from inside the repo
so tracking, not a text filter, does the exclusion). The fifth and sixth occurrences both landed in
Task 4.2's own migration doc, the same document that had already been corrected for it once.

### The gate-economy policy, and why it exists

Mid-session (2026-07-29, the user: *"it's still going extremely slowly"*), the full gate matrix was
measured at **~2.5 minutes serially**, and it was being run **three times per task** — implementer,
first reviewer, re-reviewer — on diffs that could not move most of it. The fix, now in
`CONSTRAINTS.md`: (1) **conditional gates** — the pixel harness, example typecheck and pytest run
only if the diff touches a path that can move them, stated with a reason when skipped; (2) **no
duplicate full runs** — the implementer runs the full matrix once before reporting done, reviewers
run only what their findings depend on plus one full editor suite; (3) **parallel, not serial** —
independent gates in one message, several concurrent Bash calls; (4) fix rounds run covering files
only, with one full suite at the round's end. **The exit gate is unchanged**: the final
whole-workstream (and now whole-phase) review runs the complete matrix unconditionally, on every
path, no skips permitted — this is an optimisation of the loop's interior, never its exit, and
nothing ships on a skipped gate.

### Task 6.3's design invariant, which cost two fix rounds

**THE AUDIT AND THE RENDERER MUST TRAVEL TOGETHER.** Task 6.3's dev-warning audits started as
siblings of the thing they audited rather than wrapped around it, so any conditional between the
audit and the real render path (a `Sequence` window excluding the current frame; a wrapper effect
that conditionally drops its children) could make the audit warn falsely or stay silently blind —
and because the shared `warnOnce` helper is permanent per key, one false positive on the first
qualifying frame poisons the warning for the entire session. Round 1 fixed the `Sequence`-window
case (mount the audit *inside* the item's own window); round 2, found by the same reviewer one
layer inward, fixed the wrapper-conditional case (mount the audits *inside* `applyEffects`' own
wrapper, after the real `<Renderer>`, so any conditional above them nulls both the audit and the
render together). Any future warning that observes "did X happen" rather than "is X wired" needs
this same placement, checked explicitly, not assumed.

### The `BrandKind` / `BrandLayerItemSchema` contradiction — doc fixed, schema deliberately not

Task 6.2's conformance example found that `lib/theming/types.ts:192-195` documents brand-layer
kinds as **open**, while `layered-schema.ts:109`'s `BrandLayerItemSchema.kind` is a **closed**
`z.enum(['watermark','disclaimer'])` — a schema-valid literal reel cannot author a novel
brand-layer kind, contradicting the doc. **The doc half is fixed** (it no longer claims something
false). **Widening the enum is deliberately deferred and unowned** — it touches the schema, the
editor, and both brand repos' revalidation surface, and nobody has picked it up. Say so plainly to
the next reader rather than letting the "OPEN" doc line send them into a type error with no
explanation.

### Carried out of Phase 4

**Everything the plan named is done.** What is genuinely carried forward is: the Phase 5
single-mount design (`docs/superpowers/phase5-single-mount-design.md`, already described above),
its own R2-follow-up UX tweaks the user has flagged as coming, and the items below.

**Two brand-repo findings from the pin bump that opened this phase** (both repos read-only for
Phase 4, both bumped to core `9202e79`, both **committed and NOT pushed**):

- **PP** (`~/Workspace/progpce/video-toolkit`, `main` @ **`5a9cc1e`**) — **clean.** 15 installed
  directories, `tsc` unchanged (the 18 pre-existing WPI `TS2322`s), 5/5 reference frames
  byte-identical.
- **roost** (`~/Workspace/roost/video-toolkit`, `main` @ **`c498f8c`**) —
  `projects/roost-reel-01` went `tsc` **0 → 2**: `TS2604` / `TS2786` at
  `src/LayeredRoostReel.tsx:142`. **Cause:** Phase 3 collapsed `resolveVideoRenderer`'s overloads
  to a single signature returning `VideoRenderer | undefined`, and that project is **un-migrated**
  while its own template already moved to the thin wrapper. A Phase 3.5 item, **not a core
  defect**.

**Deferred minors, carried across from the gitignored ledger (`progress.md`) — this is their
only durable record.** The final-review fix wave (see its report,
`.superpowers/sdd/2026-07-26-phase4-node-contract/final-fix-wave-report.md`) swept every
`minor (deferred)` / `minor (in fix round)` / `parked` line in that ledger — about 43 total —
and reconciled them here, grouped by area. Each either survives below, was already fixed and
is dropped with a one-line reason, or was explicitly triaged out of the final wave (recorded
anyway, so it isn't lost a second time).

### Editor param/inspector contract

- ~~`param-field.ts` documented precedence as "options first, else type"~~ — **RESOLVED**,
  already fixed on this branch (commit `dff67b8`, before the final review): the doc now
  correctly states accent wins, options second, matching `LayeredInspector.tsx`. Left here only
  so a reader of the OLD bullet below doesn't reopen it: the code was always right, only the doc
  was wrong, and it no longer is.
- `subOptionForField` emits `min`/`max` but never `step`, so `light-leak.intensity` arrives
  bounded 0..1 with step 1 — the spinner can only produce 0 or 1, and a typed `0.5` is
  `:invalid`. Still open.
- `at-cut-transitions.test.tsx:129` skips string/color sub-options, so nothing pins that an edited
  `glowColor` reaches `burn`'s presentation. `'#ff8800'` would be a fine probe. Still open.
- `Animatable` (Task 1.1) ships entirely dead — zero references outside its own module and test
  (~92 lines + 11 tests). Brief-mandated, so not a spec violation; if the ken-burns migration it
  anticipated slips past Phase 4 it stays dead code.
- `lib/theming/transitions.ts`'s `TransitionRegistration` redundantly re-declares
  `renderer?: TransitionRenderer` that its own `extends` clause already supplies.
- A brand kind's editor label is `humanizeKey(kind)` — `TransitionRegistration` has no `label`
  field, and adding one is a contract widening, deliberately not done. The timeline's transition
  markers do not consult `transitionProps` (cosmetic). `TRANSITION_KINDS` in
  `lib/editor/app/transitions.ts` now has no non-test consumer.
- Two non-null assertions at `layered-adapter.ts:66,74` — `!isCut(x)` implies a truthy kind, but a
  predicate over `unknown` cannot narrow. **Verified sound** — triaged out of the final wave
  explicitly, recorded so it isn't re-litigated.
- `enabled` has no editor control on either axis (Task 1.5) — authorable in `defaultProps` only,
  contract delivered, UI not.
- The editor's transitions lane draws a disabled transition identically to an enabled one (Task
  1.5) — render path is correct; the UI treatment needs a design decision, not a code fix.

### SegmentMedia / crop-style matrix (Task 3.1)

- The `video`/`OffthreadVideo` branch of the crop matrix is pinned on `filter` only — the matrix
  reads `img[0].style`, so the video branch's own transform/objectPosition/transformOrigin are
  unasserted. Nil risk today (one shared style object), but Workstream 3's later style-effect work
  rebuilds exactly that construction.
- The crop+direction pairing test duplicates a matrix cell and stays green under all five
  mutations — it is documentation, not a second guard. Do not count it as coverage.
- No guard that the matrix's `EXPECTED` table has exactly 18 keys — a stale or extra key is
  invisible.
- Only `direction: 'left'` is exercised; `'in'` emits no translate, so a transform-order
  regression on that branch would be invisible. Spec-compliant, but noted.

### Transitions catalog, gallery, and pins

- The differential param test (Task 2.1) asserts `tunable.length > 0` per kind, not the total of
  11 — a `subOptionsFor` shrink from 4 to 3 sub-options for one kind would iterate less and stay
  green. Only shrinkage to exactly 0 is caught.
- `scanline-glitch` mounts 6 clip subtrees per boundary (highest in the catalog) because a
  CSS-only RGB split needs the composited content re-rendered per layer. Recorded as a cost, not
  a defect.
- `TransitionGallery` lost 5 entries when `TransitionSeries` (structurally unable to drive a
  two-input node) was retired from it — nobody has yet decided on replacement coverage for the
  gallery view.
- At-cut-transitions.test.tsx's "exactly four core kinds are native two-input nodes" pin (Task
  2.3) is true only of catalog DEFAULTS — a coloured `fade-to-color` is a fifth node invisible to
  that pin.
- `phase4-migrations.md` § 2.3-a records the parity proof as the lenient `npm run pixel-gate`
  while the harness's own doc requires `--strict` for any parity claim. The conclusion stands
  (0 NEAR at the time), but the copied recipe teaches the weaker gate to the next reader.
- Six task-unrelated bimodal cells rode along in one feature commit (Task 2.3) — legitimate under
  the union rule and declared at the time, but it relaxed byte-exactness inside a change whose
  headline claim was byte-exactness.
- `lib/editor/app/transitions.test.ts:177`'s exact-match `options` pin (Task 2.4) covers only the
  six Task-1.1-era kinds, so `glitch`/`whip-pan`/`zoom-through`'s registry.json options entries
  can silently drift on a future field add.
- `TransitionGallery.tsx`'s three `Sequence` offsets (Task 2.5) are unasserted — they live in the
  returned element tree and need no clock to test, so this is a closable gap, not a jsdom limit.
- `derive-montage.ts:37`'s zoom-through joining `FramesOnlyTransition` is a disclosed type-level
  side effect (Task 2.5), flagged for that file's owner rather than fixed inline.
- `transition-gallery.test.tsx:117`'s `claimed`'s `kind !== undefined` filter (Task 2.6) is
  vestigial — an empty table would make the `it.each` vacuous rather than fail loudly.
- `TransitionGallery.tsx:484`'s `TRANSITION_NOTES` (Task 2.6) still lists every catalog kind by
  hand — the last hand-maintained per-kind table in the file, and now additionally stale: the
  catalog's actual kind count has moved twice since that table was written (see
  `phase4-migrations.md`'s Task 2.2/2.3 sections for the current derivation). Re-derive before
  trusting the table's completeness.
- `phase4-extension-contract.md:274` (Task 2.7) cites `primitives.tsx:147` for the `gradeFilter`
  call; it is at `:149` after the same commit's own comment shifted it. Cosmetic line-number drift.
- `primitives.tsx:100`'s `lineColor` (Task 2.7) takes any string unvalidated while `lineWidthPx`
  one line above got a defensive clamp; a malformed value invalidates the whole gradient, so the
  browser silently drops `backgroundImage` and the scanlines vanish with no error.
- **Dropped, verified already resolved, not carried forward:** Task 2.3's "`fade-to-color` has
  two arities" (adjudicated sound and documented in three committed places — nothing further to
  track); Task 2.5's "`transition-schema.ts:396`'s required→optional was presented as
  unavoidable" (adjudicated correct on its own terms, not the failure mode it was compared
  against); Task 2.6's "`fade-coal`'s deprecation warning fires on `TransitionGallery` import"
  (moot — `fade-coal` was later removed from core's catalog entirely by § 2.3-a, so the kind this
  warning was about no longer exists); Task 2.4's "report diffstat says 10 +++- vs. actual 13
  ++++--" (a self-reported number inside a gitignored, already-superseded report file — no code
  or committed-doc impact); `lib/render/README.md`'s Task-2.3-era "still says four known defects
  / all 20 kinds" (superseded in place — that section now carries its own `⚠ HISTORICAL` callout
  correcting both counts, see the file itself).
- **Task 6.2's five "in fix round" minors** (vacuous `core-card-bg` query, an overclaimed
  mediaStyle test title, an unnecessary `as never` cast, `examples/layered-minimal/README.md`
  contradicting its own negative pin, `GhostEchoEffect` being visually inert) **were all fixed
  within Task 6.2's own fix round** — verified against the current tree: `core-card-bg`/
  `data-card-bg` is GenericCard's real marker and is asserted correctly; the README already
  states every video kind has a core generic (not "only when a brand registers one"); no `as
  never` remains in `conformance-example.test.tsx`; `GhostEchoEffect` re-mounts its `children` for
  a visible ghost, not an empty div. Not carried forward.
- **Task 6.3's two "in fix round" minors** (`collectMediaEffects` computed twice per item per
  frame; warning 8's comment glossing `resolveRegistered`'s unguarded `generics[kind]`) —
  `collectMediaEffects` has exactly one production call site today
  (`lib/render/layered-composition.tsx:251`), consistent with the double-computation having been
  fixed; the comment issue is a wording precision nit with no behavioural effect. Not carried
  forward as open items.

### Style/grade axis (Task 3.4)

See `phase4-migrations.md`'s new Task 3.4 section for the filter-order-flip migration note
itself — carried there, not repeated here.

- `hasGradeEffect` (`LayeredInspector.tsx:817`) ignores `enabled: false`, so an item with
  `item.grade` plus a DISABLED `type: 'grade'` effect greys the Color panel while `item.grade` is
  what actually renders — locking the author out of the live field. Hand-edited configs only (the
  inspector exposes no per-effect enable toggle for this). **Triaged out of the final wave,
  record only** — fix: `.some(e => e.type === 'grade' && isNodeEnabled(e))`.
- `item.grade` is now BRAND-OVERRIDABLE and unpinned in either direction — it resolves via
  `resolveStyleEffectRenderer(registry, 'grade')`, so a brand registering `styleEffects.grade`
  silently takes over rendering of the FIELD, not just an authored effect entry. Plausibly a
  feature; no test asserts it either way, in either direction.
- `grade: {}` permanently blocks "+ Add effect → Grade" in the inspector (truthiness check at
  `LayeredInspector.tsx:896`) — `patchGrade` writes `undefined` when neutral so the editor itself
  never produces this shape, so it is hand-edited-literal only. **Triaged out of the final wave,
  record only** — cosmetic.

### Cross-axis wiring

- The Task 4.1 doc omits that PP's 11 live campaign projects bypass `LayeredReelComposition`
  entirely (they call `buildVideoNodes` directly) — this STRENGTHENS the parity conclusion it was
  attached to, but reads as though those projects were in the analysed render path when they are
  not.
- A cross-layer import, `lib/theming` → `lib/render` (`anchorTiming`, Task 4.1). **No import
  cycle** — `overlay-anchor.ts`'s only import back is an erased `import type` — but `lib/render`
  already has RUNTIME imports into `lib/theming` in six files, so the two directories are now
  mutually dependent at the directory level regardless. The brief prescribed this location;
  `lib/reel-config-base/` would have been the tension-free home for a pure function, but that is
  a Phase 5-scale relocation, not a Phase 4 fix.
- Task 4.2's report and doc claimed PP registers "four `overlayItems` kinds that all use the
  item-level render escape hatch." **Six are registered** (`title`, `chevron`, `stat-callout`,
  `source-tag`, `update-badge`, `party-logos`), and `title` has NO `render` at all (`routing:
  'anchored'`) — wrong on both the count and the "all use render" claim. The task's own
  conclusion is unaffected; only the write-up undercounted.
- `quote-pull`'s renderer resolution stays hardcoded to `'text'` (Task 4.2, `:37`) while its
  config became per-kind (`:47`) — deliberate and correct for the alias case, but a brand
  registering `'quote-pull': { renderer: X, config: Y }` gets `Y` delivered to the TEXT renderer,
  not to `X`. Config and renderer can silently target different code for this one kind.
- The `editorMetaFromTheme` capability (Task 4.4) is unreachable in every host that exists today
  — `git grep editorMetaFromTheme` finds zero non-test callers in core, PP, or roost; PP's own
  `.editor/main.tsx` mounts `EditorHost` with no meta at all. **Not a regression** (the workaround
  it replaced had the identical precondition, so parity is exact), but the doc reads as though
  registering a theme's editor meta suffices on its own, with no host wiring needed.
  **Triaged out of the final wave, record only.**

### Outside this task's file set, recorded so they aren't lost

- The registry's 17 dead `tools/<x>.py` paths in `_internal/toolkit-registry.json` are
  pre-existing and from a different phase entirely — **triaged out of the final wave on
  purpose**. Flagging this explicitly as its own follow-up task: a registry sweep to either
  restore or retire each of the 17 paths.
- Two unpinned edges found by the final review's deletion sweep, both opportunistic rather than
  blocking: `video-track.tsx`'s `{ position: 'absolute', inset: 0 }` preview-hardening style, and
  `key={b.key}` on the boundary `Sequence`. Neither got a dedicated pin in the final wave: cheap
  to add, but not done here — worth a pin next time either file is touched for another reason.
- `ClipSegmentBaseSchema` carries `TransitionSchema.optional()`, and live PP projects pass that
  tree to `<Composition schema={…}>`; **Remotion's zod sidebar has no `z.intersection` support**.
  Likely not a regression (Task 1.0 already moved it off `discriminatedUnion`), but worth **one
  Studio screenshot** during the brand-migration pass.
- `derive-montage.ts:19`'s `'cut' | 'fade'` is the **input config's** vocabulary and was correctly
  left alone (the code branches only on `'fade'`) — recorded so nobody thinks it was missed.
- Task 6.1's own report (`task-6.1-report.md`, gitignored) still claims "no kind name is written
  anywhere in the harness" while `isInstant: kind === 'cut'` is hardcoded. **The code is fine**;
  only the report is stale. Do not carry the false claim forward.
- Two **controller** errors worth not repeating: two implementers were once dispatched
  concurrently against the same tree (harmless here — disjoint files — but against the rule), and
  a live agent was replaced because file mtime suggested it had stalled. **Check agent liveness by
  its own channel, not by file mtime.** Also: a review brief cited
  `lib/theming/effects/grade.ts:43` when the real path is `lib/reel-config-base/grade.ts:43` —
  verify paths before putting them in briefs.

---

## Phase 3 — scope and starting state (historical: what Phase 3 set out to do)

> The four factual corrections this section needed are made **in place** below, not appended —
> the same reason `fix/core-has-remotion` rewrote the false `remotion` premise rather than
> footnoting it. A future reader must not re-inherit a claim this programme has already
> disproved.

**Phase 2.5 is done** — both brand repos are migrated and green. Read its outcome above before
scoping: it changed the numbers below, it fixed a Phase 2 regression that Phase 3 can repeat, and
it left three carried items (an unmerged core branch both brand pins depend on, 3 uninstalled PP
projects, 8 PP editors missing devDependencies).

**The goal of Phase 3 is what makes "a new brand only themes" actually true, including in
the editor.** Phases 1 and 2 moved the *mechanisms* into core. What is still brand-side is
everything a brand must **register**: overlays, effects, segment generators, the brand
layer, captions, media paths. Today several of those have no contract at all, so a brand
extends core by writing a renderer rather than by declaring one — which is exactly the
copy-paste channel the programme exists to close.

### Starting state, measured (2026-07-26, end of Phase 2.5, `chore/phase2.5-followups` @ `b02669c`)

| Gate | Command | Value |
|---|---|---|
| Tests | `cd lib/editor && npx vitest run` | **58 files / 669** — 2 are `it.fails` known-defect pins |
| Editor types | `cd lib/editor && npx tsc --noEmit` | **4** pre-existing |
| Render/transition types | `cd examples/layered-minimal && npm run typecheck` | **0**, coverage guard ok |
| Brand leak | the `grep -riE` under Working conventions | exactly **2** known hits |

Capabilities, each demonstrated by a command (see the convention at the end of this file):
core **can** unit-test a `remotion`-importing module with `vi.mock('remotion')`, **can**
type-check its render surface, and **can render** (`cd examples/layered-minimal && npx
remotion still src/index.ts MinimalReel out/x.png --frame=45`). Do not inherit a "core
cannot X" from anywhere without re-running its command first — that mistake has been made
three times in this programme.

**Two capabilities Phase 2.5 added, both cheap and both worth reusing in Phase 3:**
- **A brand repo is now a usable check surface.** With item C's `paths` fix, `npx tsc --noEmit` in
  a brand project reports **0**, not ~160. Phase 3 changes what brands render, so this is the gate
  that will catch a broken registration.
- **Still-render parity is a working regression test.** `npx remotion still` at fixed frames,
  compared by `shasum`, caught the one rendering regression Phases 1–2 had shipped. Phase 3's
  "prove parity with a still render" requirement now has a proven procedure — including the
  caveat that a single render can flake, so reproduce before believing a mismatch.
  (**"byte-deterministic" was claimed here and is false** — corrected in place; Phase 4 measured
  the flake as bimodal. See the Phase 4 outcome.)

### The seams Phase 3 closes

Each is verified present in core today, not quoted from the plan:

1. **Two live overlay registries.** `BrandTheme.overlays` is
   `Partial<Record<OverlayKind, …>>` with `OverlayKind = 'text'` (`lib/theming/types.ts:29,41`),
   while `CompositionTheme.overlayItems` is open-keyed `Record<string, OverlayItemRegistration>`
   (`:96`). `LayeredReelComposition` bridges them with a `TEXT_KINDS` set and a
   `TrackTextOverlay` adapter (`lib/render/layered-composition.tsx:18,36,79`). Unify into one
   open-keyed registry carrying routing + renderer + `params`, keeping the core text adapter as
   the default renderer so existing brand registrations keep working.
2. **No effect registry.** `resolveEffectRenderer` does not exist; `SegmentMedia` understands
   only `ken-burns` (`lib/theming/segment/SegmentMedia.tsx:21,32`). So a brand's `vintage` and
   `blend` are ad-hoc pipelines, and PP's `video-item-renderers.tsx` (270 LOC) exists purely to
   reverse `effects[]` back into legacy prop bags and hand-apply a `frameOffsetSec` correction.
   **Corrected (Task 11, re-measured in Task 12):** `frameOffsetSec` is *computed* in **4**
   renderers (`templates/campaign-reels/src/config/video-item-renderers.tsx:129,163,203,236`,
   each `handles.inHalf / fps`) but **applied at 8 sites** (`:136,143,155,171,184,195,228,248`).
   An earlier draft of this list said "four call sites", conflating the computations with the
   applications — a migrator who moves 4 of the 8 leaves the reel half-corrected. Add the
   registry plus core generic `grain`, `scanlines`, `vignette`, `grade`, `transform`
   primitives; the brand keeps only its tuning constants.
3. **`card` / `outro` / `multi-clip` have no core generic.** `VideoKind` covers all six, but
   `LayeredReelComposition` does `if (!Renderer) return null`, so a brand must still register
   them. Ship the generic asset-outro (`props: {video, audio}`) and the four multi-clip layouts;
   a brand's procedural outro then registers as an override — precisely what the contract is for.
4. **Brand track is a hook, not a registry.** `renderBrandTrack` means each brand writes its own
   `…BrandTrack` of the same shape and neither uses core's `GenericWatermark`; three
   implementations of corner anchoring exist. Replace with a registry +
   `defaultRenderBrandTrack(items)`, extend `GenericWatermark` with the PNG-as-alpha-mask tint
   technique (generic trick; brand colours stay in the theme) and add a `disclaimer` kind.
   **Attribution, corrected (an earlier draft left it unattributed):** the alpha-mask tint is
   **roost's**, at `templates/roost-reels/src/overlays/Watermark.tsx` — a `WebkitMaskImage` /
   `maskImage` of `url(staticFile(asset))` over a coloured fill. **PP has no such technique at
   all**; PP's watermark is a plain `<Img>` with `opacity`. So this is not a shared trick being
   hoisted — it is one brand's technique being generalized, and PP's adoption of
   `GenericWatermark` is a separate question. (Related measured fact: PP's watermark PNG is
   **256×256, square**, so adopting `GenericWatermark` with `height: 'auto'` is a *pure refactor*
   for PP, not a look change.)
5. **Captions are entirely brand-side.** `brand-lib/overlays/CaptionStrip.tsx` (293 LOC) admits
   in-file that it is hardcoded to one brand. Core exposes `transcript-window.ts` but no caption
   renderer. Bring `GenericCaptions` into core, parameterized by a **new** `CaptionTokens`.
   **Corrected:** an earlier draft said "parameterized by `theme.tokens.caption`, which already
   exists brand-side". **It never existed.** What existed was *three disagreeing sources*:
   (a) `CaptionStrip.tsx`'s own module constants — authoritative, because they are what renders;
   (b) a **dead** `caption` block at `templates/campaign-reels/src/config/theme.ts:36-45`,
   claiming `bottomPct: 0.28`, read by nothing (adopting it would move captions 8 % of frame
   height); and (c) a **dead** `reels.caption` in `brand.json`, whose *vocabulary* is what
   `CaptionTokens` now borrows — note `verticalPosition` is **not** `bottomPct` semantically,
   so confirm before mapping. Core took the module constants, i.e. what actually rendered.
   Deleting (b) and (c) is item 10 of `phase3-migrations.md`.
6. **Media paths are hardcoded in three places.** `resolveAudioSource` exists as a theme hook;
   the video side hardcodes `recordings/`+`broll/` prefixes brand-side while another brand uses
   full `media/…` paths — and core's own editor hardcodes the same convention again in
   `LayeredTimeline.tsx:25-32`. Add `resolveMediaSource(item, role)`, consumed by the renderers
   **and** by the timeline, so the editor stops knowing folder names.
7. **Schema-driven inspector** — render inspector controls from each registration's `params`,
   which is what makes a brand's own registered kind editable without touching core UI.
8. **Resolve the `brand-lib/` tier** so a brand repo has one brand tier, not two, and
   **migrate `web-program-intro`** onto `LayeredReelComposition` — its hand-rolled 170-LOC
   `TransitionSeries` assembly is a pre-layered fossil that already imports core's
   `presentationFor`.

### Already-queued Phase 3 work recorded elsewhere in this file

Read these before scoping — they are decided or half-decided, not open questions:

- ~~`video_toolkit/sync_template.py:136,141` still mirrors only `src`~~ — **✅ closed, and then
  some.** It now carries the full vendored surface, and a Critical data-loss bug found on the way
  is fixed (see "the one thing on this branch that was a live data-loss bug", above).
- The **zod guard**, sequenced: it must land *after* roost migrates, and must warn, not throw.
  ✅ closed in Phase 2.5 (`b02669c`).
- ~~The **`TransitionGallery` fork** decision~~ — **✅ closed** (`9368f38`). Option (b) was taken:
  the `lib/` copy is now canonical (with `checkerboard`, the notes block and the richer layout
  merged in), and `showcase/transitions/src/Root.tsx` imports it. The duplicate is deleted, so
  the type-check gate now covers a file that actually renders.
- ~~The **two `it.fails` defects** and the **at-cut visual confirmation pass**~~ — **✅ closed**
  in Task 10; see the (now-closed) at-cut risk entry below. There are **4** pins now.
- The smaller deferred items under "New in Phase 2, deferred".

### Two things Phase 3 must not repeat

- **Phase 3 changes what brands render.** Phases 1–2 could hold "rendering an existing baked
  literal must not change" almost for free. Registries and generic renderers cannot: folding a
  brand's bespoke renderer into a core generic *will* move pixels unless proven otherwise. Decide
  per item whether parity is required, and where it is, prove it with a **still render** — core
  can do that now. This is the phase where "derivation output is free to change, rendering a baked
  literal is not" needs actual enforcement rather than assertion.
- **Do not design around an unverified limit.** See the working convention at the end of this file.

---

## Carried into later phases

**Phase 3.5 is still pending** — apply the seventeen brand migrations in
`docs/superpowers/phase3-migrations.md`, which is the validation of Phase 3 the way Phase 2.5 was
the validation of Phases 1–2. Phase 3's own outcome is recorded above; the section immediately
above this one is its historical scope. **Phase 4 went ahead of it** (core-only, both brand repos
read-only), so Phase 3.5's list is now joined by `docs/superpowers/phase4-migrations.md` — and by
the one thing the Phase 4 pin bump surfaced, roost's un-migrated `roost-reel-01` going `tsc`
0 → 2. See "Carried out of Phase 4".

**Deliberately NOT done in Phase 2, ✅ DONE in Phase 3 (`3e3b4a6`, `49647bd`, `66fff5f`) — the
description below is the problem as it stood, kept for the record.** `sync_template` now mirrors
the full vendored surface (`.editor/`, `remotion.config.ts`, `vitest.config.ts`, `tsconfig.json`,
`tailwind.config.ts`, `.prettierrc.json`, a merging `package.json`) and no longer overwrites
project-authored work. The historical statement:
`video_toolkit/sync_template.py:136,141` still mirrors only
`templates/<t>/src → projects/<p>/src`, so it does **not** carry `.editor/`. With the
host in core, `.editor/` is 45 (PP) / 41 (roost) lines across three files that rarely change, which
lowers the cost a lot — but the next `.editor/` change still hits **14 directories**
by hand (12 PP, 2 roost).
The same gap covers `remotion.config.ts`, `vitest.config.ts`, `tsconfig.json` and
`package.json`, none of which the mirror carries either. Phase 2.5 showed what that costs:
8 of 11 PP project editors cannot start because the vendored `package.json` never inherited the
template's editor devDependencies (finding 5), and every one of the ~90 files the migration
rewrote was a hand-edit for exactly this reason.

**Phase 0 leftover — ✅ CLOSED in Phase 2.5.** `docs/zod-version.md` settles the question
(exactly `3.22.3`, forced by Remotion 4.0.425). Both brand repos are now pinned there — PP from
`^3.22.0`, roost from `^4.3.6` — and the sequenced core-side guard has landed (`b02669c`,
`lib/project/zod-guard.ts`), wired into both `applyToolkitWebpack` and `createEditorViteConfig`.
It **warns, never throws**, for the reason recorded all along: a hard assertion turns a routine
submodule bump into a hard stop on a repo that still renders fine.

**New in the fix-pass-2 re-review, ✅ RESOLVED in Phase 3 (`9368f38`).** Option (b) below was
taken: the `lib/` copy is canonical — `checkerboard`, `TRANSITION_NOTES` and the richer layout
were merged into it, the `glitch` mis-typing was not reintroduced, and
`showcase/transitions/src/Root.tsx` now imports it. `showcase/transitions/src/TransitionGallery.tsx`
is deleted, so the type-check gate covers a file that actually renders. Two notes from the merge:
the gallery's timings now come from the showcase copy (90-frame scenes, 40–60-frame transitions,
vs the lib copy's 45/20–35), which changes `transitionMap.*.duration` — no in-repo consumer, so
flagged rather than buried. And the move broke **webpack** (`Can't resolve '@remotion/transitions'
in .../lib/transitions`), the **third** toolchain hit by the bare-specifier recurrence; fixed with
the same `resolve.modules` line `layered-minimal` already carries. The original analysis follows,
for the record:
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
- **The `650/650 passed` gate figure hid two deliberately-failing tests.** Vitest's summary
  (and its JSON reporter's `numPassedTests`) counts an `it.fails` pin as a pass, so
  `lib/editor/src/at-cut-transitions.test.tsx`'s two known-defect pins (`checkerboard`
  exiting as a no-op, `pixelate`'s opaque root at a cut) were invisible in the gate table above
  a reader who reads counts, not test titles. The gate-table row and `CLAUDE.md`'s Quality
  Gates table now both say so explicitly. `CLAUDE.md`'s table carried no test counts to begin
  with, so it had no matching omission to fix there; it did need the brand-leak gate's 2-hit
  baseline named (below).
- **Migration D (`docs/superpowers/phase2-migrations.md`) undercounted, and its premise was
  already partly false.** It said roost "carries a second one, in two files"; re-verified
  against the real (read-only) roost working tree, there are **three** copies of
  `roostReelDurationInFrames` — the two D named plus
  `~/Workspace/roost/video-toolkit/projects/roost-promo-01/src/LayeredRoostReel.tsx:15`,
  byte-identical to the template's, no consumer. (`roost-promo-01` was untracked at the time and
  was believed to be work in progress, so it was recorded and not touched; it turned out to be an
  empty scaffold and the user deleted it after Phase 2.5 — see "Carried out of Phase 2.5" above.) Worse: D's premise that the local helper is a live single source of truth was
  **already false** before this correction — `templates/roost-reels/src/Root.tsx:195` and both
  projects' `Root.tsx` (`roost-reel-01:201`, `roost-promo-01:195`) already inline
  `Math.max(60, Math.round(…))` directly in `calculateMetadata` and never call the helper at
  all. D now states this and adds the third file as a delete-only item, so a migrator no longer
  hunts for `Root.tsx` consumers that do not exist.
- **The `lib/editor` type-check gate's coverage was import-driven and unguarded — and this
  branch had created that exact gap.** `lib/editor/tsconfig.json`'s `include` only names
  `src`/`app`/`host`/`../theming`; `lib/render`'s four `.tsx` files (`at-cut-transitions.tsx`,
  `audio-track.tsx`, `layered-composition.tsx`, `video-track.tsx`) and `lib/transitions`
  entered the program **solely** through `at-cut-transitions.test.tsx`'s import chain, and
  `load-fonts.ts` solely through `load-fonts.test.ts` — delete either test and the gate would
  silently check less, with no guard and no exit-code signal, unlike
  `examples/layered-minimal`'s `verify-typecheck-coverage.mjs` for the sibling gate. **Resolved
  by making the coverage declared, not derived:** those four `.tsx` files plus `load-fonts.ts`
  are now listed directly in `lib/editor/tsconfig.json`'s `include`. Re-verified afterward:
  `cd lib/editor && npx tsc --noEmit` still reports exactly **4** errors — declaring them
  surfaced no new ones, because their own imports (`remotion`, `@remotion/transitions`,
  `../theming`) were already mapped/included for the two test files that used to be the only
  path in. `lib/transitions`'s presentation files and the remaining pure `lib/render/*.ts`
  files still arrive only by transitive import from those now-declared files, which is fine —
  nothing test-only left to delete out from under them.

**Deferred, judged genuinely fine to carry:**
- ~~The `AccentKey` marker in `transition-schema.ts` patches zod's `describe()` so clones stay
  marked. Tested and correct for its one use, but `.min()`, `.nullable()`, `.readonly()` and
  `.catch()` chains silently lose the mark — and the failure mode is a field with *no editor
  control at all*, with no warning. Replace with an `_def` mark (every zod-3 clone path spreads
  `_def`) or a declarative `ACCENT_FIELDS` set beside the existing `PROP_LABELS`.~~
  **✅ CLOSED in Phase 4, Task 1.6**, by the declarative route. The predicted failure was
  confirmed by measurement before the fix — `.nullable()` / `.readonly()` / `.catch()` /
  `.transform()` produced `undefined`, i.e. no control at all — and the **colour** axis was
  replaced along with accent, because one shared `marker()` served both. Read the trade-off note
  under "Known gaps in what shipped" in the Phase 4 outcome before extending it.
- Test fixtures still speak PP's `{lime:…}`/`{teal:…}` vocabulary. Mechanical rename — worth
  doing because that very vocabulary is what hid the `ACCENT_RE` leak Phase 1 found in
  production code.
- ~~`LayeredTimeline.tsx:25-32` media-path conventions (`/recordings/`, `/broll/`) → Phase 3's
  `resolveMediaSource`.~~ **✅ closed in Phase 3, Task 6** (`8a34956`) — the timeline consumes
  `resolveMediaSource` and no longer knows folder names.
- From the writer rework: inline arrays reflow on insert; `lcsAnchors` allocates n×m; one
  asymmetric filter typing. All bounded, reels are tens of items.
- ~~`fade-coal` is a brand-derived **kind name**. Renaming touches every baked `Root.tsx`, so
  it is deliberately kept.~~ **✅ CLOSED in Phase 4** — the cost was paid deliberately. Task
  2.3 shipped the generic replacement (`fade-to-color`, colour exposed as a parameter) and a
  follow-up **removed `fade-coal` from core entirely**, alias and all. The one baked literal
  is a required, breaking migration written up in `docs/superpowers/phase4-migrations.md`
  § 2.3-a.

**✅ CLOSED in Phase 3, Task 10 — the at-cut visual pass ran.** All **20** catalog kinds were
rendered at a cut in **both** directions: **310 stills**, all reviewed. Result: 16 kinds correct
at a cut, 3 defective, 1 (`cut`) not a transition. Across the 40 kind×direction cells: 26
correct, 4 defective, 1 ambiguous, 7 no-op-by-design, 2 n/a. The findings — per kind, with the
contact sheets' evidence — are in **`docs/superpowers/at-cut-transition-findings.md`**. The pass
also produced a caveat worth carrying: **7 kinds are complete no-ops in the exiting direction**,
so a last item's `transitionOut` does nothing, contradicting `video-track-layout.ts`'s "the
reel's trailing edge fade" comment.

**There are now 4 `it.fails` known-defect pins, not 2** — `scanline-glitch` and `wipe` joined
`checkerboard` and `pixelate`. Both new ones paint **opaquely at entering progress 0**, so at a
cut they *replace* the outgoing clip instead of dissolving into it, ~10 frames before the
authored cut. Recorded, not fixed, for the same reason as the original two: what a transition
renders is a look decision.

> ⚠️ **`wipe` needs the user's look decision, and it is not an at-cut-specific defect.** Its two
> beats (cover, then uncover) are *designed* sequential but run **simultaneously** in every
> compositing model available here, so it renders as an accent flash. **`MinimalReel` itself uses
> `wipe` at its first cut**, so that flash is what core's own example currently renders.
> `showcase/transitions` would **not** have caught it: the gallery imports Remotion's official
> `wipe`, never the toolkit's presentation.

The original risk statement, kept for the record: 11 transition kinds have
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

**Acceptance criterion for that Phase 3 task** (now possible in core, not blocked on a brand
repo): a reel literal in `examples/layered-minimal` exercising each of the 20 catalog kinds at a
cut, in both directions (`transitionIn` and `transitionOut`), with stills rendered at several
progress points per kind/direction so the composite can be eyeballed against what the kind is
meant to do. 2 of the 20 kinds already have a predicted outcome to check the render against,
rather than a blind look: `checkerboard` (predicted: renders as a hard cut, not a checkerboard
reveal, in the exiting direction) and `pixelate` (predicted: an opaque black frame hiding the
neighbouring clip for the whole shot, not a pixelation blend) — see the two `it.fails` pins
below. The other 18 have no predicted outcome; the still is the first evidence either way.

Both named suspects turned out to be real, and are **recorded, not fixed** (what a transition
renders is a look decision, and neither kind has ever had its at-cut appearance confirmed, so a
"fix" would be a guess). Each is pinned as an `it.fails` in that test file, so it flips to a
normal `it` the day it is addressed and the runner shouts if it starts passing:

- **`checkerboard` has no effect in the EXITING direction.** Its cells are rendered empty on exit
  — the children are drawn once, whole, in the base layer beneath them, and the cell divs carry no
  content and no background — so a `checkerboard` used as a `transitionOut` plays as a hard cut.
  Only the entering direction reveals cell by cell.
- **`pixelate` paints its root `AbsoluteFill` opaque black unconditionally**, including at
  progress 0, so at a cut it hides the neighbouring clip instead of blending with it.
  **The mechanism is CONFIRMED; the *extent* claimed here was REFUTED by Task 10's still
  renders and is corrected in place.** An earlier draft said the black root "hides the neighbour
  for the entire clip". It does not: `AtCutTransition` clamps progress
  (`lib/render/at-cut-transitions.tsx:153,159`), so the blackout is bounded to the **transition
  window**, not the whole shot. Rendered, frame 50 is pure black and the outgoing clip vanishes
  — it reads as one full-black frame at the cut, not a whole-shot occlusion. Still a defect,
  still pinned, but a much smaller one than the text used to say. The `it.fails` pin's comment
  has been corrected in the code too.

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
    **20** test files do this as of the Phase 4 hand-off (count them with
    `grep -rln "vi.mock('remotion'" lib/editor/src`; it was **14** at the end of Phase 3, and
    the list below is that Phase 3 list, not the current one): `at-cut-transitions`, `brand-track`,
    `effect-primitives`, `effects-registry`, `generic-captions`, `generic-card`,
    `generic-multiclip`, `generic-outro`, `generic-watermark`, `load-fonts`,
    `overlay-registry`, `segment-media`, `text-overlay-base`, `video-track-layout`. The
    figure was **5** when `fix/core-has-remotion` first measured it; Phase 3 tripled it,
    which is the point — mocking `remotion` is now the ordinary way to test a JSX module
    here, not a trick. `lib/editor/vitest.config.ts:51` documents the resolution detail
    that makes it work.
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
- **Current gate numbers, measured fresh at the Phase 4 hand-off (2026-07-28).** Any figure
  quoted elsewhere in this file from Phase 1, Phase 2, `fix/core-has-remotion`, Phase 2.5 or
  Phase 3 is historical; these are live:
  | Gate | Command | Now |
  |---|---|---|
  | Editor tests | `cd lib/editor && npx vitest run --no-file-parallelism` | **86 files / 1113 tests**, green, 53 s — **4** of them are `it.fails` known-defect pins (`at-cut-transitions.test.tsx:323,350,404,422` — re-derive with `grep -n 'it.fails'`, these shift whenever the file's comments change, twice in Phase 4 alone), so "all passed" is not full green |
  | Editor types | `cd lib/editor && npx tsc --noEmit` | **3** errors, exit 2 (`LayeredInspector.tsx:791`, `derive-layered.test.ts:277`, `../theming/envelope.test.ts:1`) |
  | Render/transition types | `cd examples/layered-minimal && npm run typecheck` | **0**, coverage guard ok (render 10 / transitions 14 / theming 24 / reel-config-base 10 / transcripts 1) |
  | Pixel harness | `cd examples/layered-minimal && npm run pixel-gate:strict` | **PASS** in ~55 s — 300 stills, 0 drifted / 0 missing, 3 expected semantic xfails. New in Phase 4 |
  | Brand leak | the `grep -riE` above | exactly **2** hits — `lib/theming/effects/ken-burns.ts` and `lib/transitions/presentations/burn.tsx` |
  | Python — `sync_template` | `./.venv/bin/python -m pytest video_toolkit/tests/test_sync_template.py -q` | **36 passed**. The **system `python3` has no `pytest`** — use `./.venv/bin/python` |

  The editor `tsc` baseline was **34** through Phase 2 and briefly **29**; `fix/core-has-remotion`
  took it to **4** in two steps, without touching any of the code the errors were about — a
  `paths` entry mapping the out-of-tree bare specifiers `remotion`, `react` and
  `@remotion/transitions` into `lib/editor/node_modules`, plus `DOM.Iterable` in `lib`, resolved
  29 errors that were pure module-resolution noise rather than real type defects. Phase 3 Task 7
  took it **4 → 3** as a genuine side effect of a typed rewrite, not by chasing the number.
  Treat **3** as the baseline from here on; if you read 4, 29 or 34 in a doc, that doc is stale.
- **For each capability a task CLAIMS to add, name the line that implements it and mutate THAT
  line.** This recurred in **all twelve** Phase 3 tasks, without exception: the mutation testing
  initially exercised what the change *preserved* rather than what it *added*, and a genuinely-new
  capability sat unpinned until review caught it. Preserving old behaviour is the easy half and
  the existing suite already covers it; the new capability is the half nobody wrote a test for.
  Concretely: before writing the mutation, point at the specific line (file:line) that is the
  reason the task exists, break *that*, and require a red test.
  **Phase 4 is where this finally held — and the method that made it hold is worth copying.**
  Tasks 1.1 through 1.6 each pinned what the change *added*, and reviewers reproduced the
  mutations independently. The technique was not "remember to mutate the right line"; it was
  **write the test FIRST and confirm it goes RED against the pre-change tree**. That is what
  distinguishes pinning a new capability from pinning an accident, and it produced hard evidence
  every time: Task 1.6's `.min(1)` test was red on the old implementation with the exact message
  *"expected 'string' to be 'accent'"*, and 8 of its 9 new tests were red pre-change; Task 1.2b's
  new file ran **6 of 9 red** against the unmodified tree before any implementation existed;
  Task 1.2's mutation was *asymmetric* — breaking the brand tier turned 5 new tests red while the
  pre-existing at-cut suite stayed 81/81 green, which is direct proof the new tests pin the new
  thing. Record it as the **method**, not just the rule.
- **Python mutation testing in this repo needs `__pycache__` cleared before every run.** A
  mutation that swaps two statements produces a byte-length-identical file, and CPython's
  `(mtime, size)` `.pyc` invalidation then happily reuses the **mutated** bytecode after the
  source is restored — silently reporting the wrong colour. Cost a real chase in Task 8.
- **`examples/layered-minimal` is also a type-check gate**, over `lib/render` and
  `lib/transitions` (`cd examples/layered-minimal && npm run typecheck`, baseline 0) — the
  surface `lib/editor`'s own `tsc --noEmit` doesn't reach. See
  `docs/superpowers/core-typecheck-gate.md` and the `CLAUDE.md` "Quality Gates" table. No CI
  runs any of these three gates; they are manual and easy to forget — run them before calling
  render/transitions work in `lib/` done.
- **Reading a file is not running it — and a doc checked against real repos can still be wrong.**
  `docs/superpowers/phase2-migrations.md` was written by inspecting both brand repos carefully,
  and applying it still found six miscounts and one outright false negative ("PP needs nothing",
  which cost a rendering regression). Every one of them needed the code to actually run. When a
  future phase queues brand migrations, treat the document as a hypothesis, not an inventory.
- **Moving core code out of the project tree breaks bare-specifier resolution — three toolchains
  so far.**
  Phase 2 moved the editor host into `lib/editor/host/`; the files there import `remotion`,
  `@remotion/player`, `react` by bare specifier, and every resolver that walks up `node_modules`
  from the *importing* file then fails — it climbs to the brand repo root and stops. This bit
  **tsc** (~160 phantom errors per brand directory, fixed with `paths`) and **Vite** (the editor
  silently never mounted, fixed with a `resolveId` hook, `cb51d4d`) independently. Phase 2.5
  predicted it would recur in Phase 3, and it did: moving `TransitionGallery.tsx` into
  `lib/transitions/` broke **webpack** in `showcase/transitions` (`Can't resolve
  '@remotion/transitions'`), confirmed caused by the move via stash/pop rather than pre-existing,
  and fixed with `resolve.modules`. **Three toolchains, three different fixes, same root cause.**
  Assume the fourth exists; check every toolchain that touches the moved file, not just the one
  that complains.
- **A parity claim needs a render, not a test.** "Rendering an existing baked literal is frozen"
  was asserted through Phases 1 and 2 and was **false** — `applyBrandEndpoint`'s dropped default
  changed every PP caption. No test caught it; comparing `remotion still` hashes before and after
  did, in minutes. The procedure: pick ~5 frames spanning a real reel, `npx remotion still` each,
  `shasum -a 256`. **It is NOT byte-deterministic** — an earlier version of this bullet said it
  was, and Phase 4 disproved it over ~2070 renders: the flake is **bimodal** (two stable
  attractor hashes per affected cell, 9–50 % per render) and its rate is **non-stationary and
  process-dependent**, so re-running with a higher repeat count *inside one process* re-samples
  the same draw. Re-render **in a fresh process** and reproduce before calling a mismatch a
  finding. The separation that keeps the technique useful: the flake's worst 8×8 mean shift ever
  measured is 0.0183/255, while a real change lands at 1–3. See the Phase 4 outcome.
  `examples/layered-minimal`'s `pixel-gate` harness encodes all of this, including the union rule
  for re-seeding.
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
  **The same rule applies to claims about your own tests, and Phase 4 supplied the example.**
  Task 1.5's report claimed a mutation proved `videoConfig` routes through a shared helper.
  Review showed the test bundled **four accessors in one `it`**, and one of the other three
  already routed through that helper before the task — so the mutation went red regardless and
  proved nothing about the one that changed. The claim was **retracted**, and the honest
  statement written down instead: that routing is **unpinned and unpinnable** (both forms are the
  same expression; no input distinguishes them). A mutation is evidence only for the assertion it
  uniquely kills — one assertion per `it`, or the red tells you nothing.
