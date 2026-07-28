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

## 🟡 Phase 4 outcome — Workstreams 1 and 2 are complete; three workstreams are untouched

**Branch:** `refactor/phase4-node-contract`, merge base `9202e79`. **Not merged.**

**Status, plainly: this is a deliberate hand-off at a clean seam, not an abandoned branch.**
Workstream 1 — the node contract itself — is **complete and reviewed**, and **Workstream 2 —
every kind behaves as its name promises — is complete and reviewed on top of it** (see
"Workstream 2 outcome" below, which carries its own gate numbers and findings; the numbers in
*this* section are Workstream 1's and are superseded where the two disagree). Everything below
the line "Carried out of Phase 4" is *not started*, not *in flight*.

**Tasks landed:** 1.0, 1.1, 1.2, **1.2b** (added mid-phase, not in the plan, user-approved),
1.3, 1.4, 1.5, 1.6, **2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7**, 3.1, 6.1.
**Tasks not started:** 3.2–3.4, 4.1–4.3, all of Workstream 5, and 6.2–6.4.

Re-derived from `git log` / `git diff --stat` against the merge base, never carried forward from
a running total: **44 commits**, **55 files, +7926 / −553**. Excluding the 676-line plan document
(`docs/superpowers/plans/2026-07-26-phase4-node-contract.md`, committed at `9dfd51d` on the
branch): 54 files, **+7250 / −553**.

> **As in Phase 3, the range cannot include the commit that carries this text** — a commit
> cannot state its own diffstat. Re-derive rather than trust the figures above after any
> further commit:
> ```bash
> git log --oneline $(git merge-base main HEAD)..HEAD | wc -l
> git diff --stat $(git merge-base main HEAD)..HEAD | tail -1
> ```

### Gates, measured fresh at the hand-off (2026-07-28)

Every figure recorded for Phase 3 is now stale; these replace them. Exit codes were captured
**separately** from error counts, because `grep -c 'error TS'` reports 0 when tsc *crashes*.

| Gate | Command | Value |
|---|---|---|
| Editor tests | `cd lib/editor && npx vitest run --no-file-parallelism` | **86 files / 1113 tests** green, 53 s — **4** are `it.fails` known-defect pins, so "all passed" is *not* full green |
| Editor types | `cd lib/editor && npx tsc --noEmit` | **3** errors, **exit 2** (tsc ran; it did not crash) |
| Render/transition types | `cd examples/layered-minimal && npm run typecheck` | **0**, coverage guard ok (render 10 / transitions 14 / theming 24 / reel-config-base 10 / transcripts 1 — each at or above its recorded floor) |
| **Pixel harness (NEW in Phase 4)** | `cd examples/layered-minimal && npm run pixel-gate:strict` | **PASS**, 300 stills in **52 s** (~55 s wall). `300 accepted (8 on a bimodal cell's second recorded hash), 0 same-picture-different-bytes, 0 drifted, 0 missing`, plus **3 expected semantic xfails** (`scanline-glitch`, `wipe`, `pixelate` — all `cut@p0-shows-outgoing`) |
| Brand leak | the `grep -riE` under Working conventions | exactly **2** known hits |
| Python — `sync_template` | `./.venv/bin/python -m pytest video_toolkit/tests/test_sync_template.py -q` | **36 passed**, 0.42 s. **Use the venv** — the system `python3` has no `pytest` |

The editor `tsc` baseline is still **3**, but two of the three moved line: they are now
`app/LayeredInspector.tsx:791` (`hide`), `src/derive-layered.test.ts:277`, and
`../theming/envelope.test.ts:1` (`Cannot find module 'vitest'`). The four `it.fails` pins are at
`lib/editor/src/at-cut-transitions.test.tsx:323,350,404,422` — **re-derive with
`grep -n 'it.fails' lib/editor/src/at-cut-transitions.test.tsx`**, never hardcode; they shifted
twice within Phase 4 alone.

> `CLAUDE.md`'s Quality Gates table was updated by the final fix wave (2026-07-28): it now carries
> **87 files / 1126 tests** — the numbers above plus that wave's own 13 new tests — the pixel
> harness as a fourth gate, the tsc exit code, and an instruction to re-derive the `it.fails` count
> rather than trust a written one.

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
`6dbd60e..20bfc36` — the range from Workstream 1's close to Workstream 2's, never carried
forward from a running total: **18 commits, 44 files, +4389 / −1046**. Re-derive rather than
trust this after any further commit; a commit cannot state its own diffstat.

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
| Editor tests | **91 files / 1263** (1259 passed, **4 skipped**), ~44 s |
| Editor types | **3** errors, **exit 2** — the same three, read separately from the count |
| Render/transition types | **0**, coverage guard at or above every recorded floor |
| Pixel harness | **PASS** — `315 accepted (13 on a bimodal cell's second hash), 0 same-picture-different-bytes, 0 drifted, 0 missing`, ~47 s |
| Brand leak | exactly **2**, both comments (`lib/theming/effects/ken-burns.ts`, `lib/transitions/presentations/burn.tsx`) |
| Python — `sync_template` | **36 passed** |

**Three baselines moved, all deliberately and all declared:**

- **The four `it.fails` known-defect pins are GONE.** `grep -n 'it.fails'
  lib/editor/src/at-cut-transitions.test.tsx` now returns **nothing**, and a new one appearing
  is a new known defect. The **4 skipped** in the run are a different thing
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

**1. The `presentationFor` trap was LATENT, not active — and it never widened.** The blast
radius is confirmed at **6 files** in PP (five `projects/*/src/WebProgramIntro.tsx` plus
`templates/web-program-intro/`), roost **0**. But **none of the six authors any transition at
all** (`transitionOut:` = 0 in all six) and there are **zero authored uses** of the four
converted kinds in either repo, so no brand pixel changed. A `warnOnce` warning was added
rather than a compatibility shim — a wrong picture silently is worse than a visible
degradation. Task 2.2's conversions did **not** widen the set.

**2. Neither brand registers a single effect or transition.** This refutes the plan's
promotion table at its root and was re-derived independently by a reviewer under its own
anchored greps. `vintage` and `blend` are `defaultProps` entries read by brand **video
renderers**, not registry entries; PP's only registry keys are `overlays.text` and `video`,
roost's likewise. Every transition either brand authors is already core — **10 distinct kinds
against a 21-kind catalog, so 11 of core's kinds are authored by neither.** `vintage(vhs)` has
**zero** authored uses; `vintage(film)` has zero in a real reel (all six are in roost's
template demo, none in `roost-reel-01`). And `sepia(0.22)` needed **no** non-diagonal WB
matrix — just a CSS filter core had not added.

**3. A brief's premise is not evidence, and three briefs were wrong on measurement.** Each was
caught only because the task re-derived rather than conformed: the exiting-no-op family is
**eight**, not seven (`checkerboard` joined it in 2.1); the gallery covered **8 by name + 1 by
catalog kind**, not "10 of 20", against a **21**-kind catalog; and Task 2.3's brief specified
`fade-coal`'s colour default as **black** while also requiring existing literals to keep their
pixels exactly — on measurement those conflict, because today's `fade-coal` is literally
`() => fade()` and never dips. All 15 `fade-coal__*` goldens are hash-identical to `fade__*`.
The default shipped as **no colour**; the goal governed over the mechanism. The black variant
is one line away and correctly graded a deliberate look change.

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

### Carried out of Phase 4

**Not started — read the plan, `docs/superpowers/plans/2026-07-26-phase4-node-contract.md`:**

- **Workstream 3** (3.2–3.4) — effects: one contract, no exceptions. **3.1 is done** and is the
  merge baseline 3.2 must not break; carry its four deferred minors into the 3.2 brief, notably
  that the video/`OffthreadVideo` branch is pinned on `filter` **only** (the matrix reads
  `img[0].style`), and Workstream 3 rebuilds exactly that construction.
- **Workstream 4** (4.1–4.3) — close the write-only props.
- **Workstream 5** — tokens cover proportion, not just paint.
- **6.2–6.4** — conformance example, theme validation + dev warnings, gate documentation.
  **6.3 has two concrete inputs already:** it must reuse `lib/render/warn-once.ts` rather than
  duplicate it, and it needs an **eighth** warning — a config-only registration for a
  **brand-only** kind renders nothing, silently: it declares the kind (so `brandKinds` silences
  the typo warning) but has no renderer and no core generic beneath, so the boundary is a hard
  cut. "Declared" ≠ "handled". The fix is 2 lines at `lib/render/video-track.tsx:44`.
- **The overlapping-boundary fix** — its own task, as argued above.

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

**Deferred minors, carried across from the gitignored ledger — this is their only durable
record:**

- `param-field.ts:68-72` documents precedence as "options first, else type", but the code checks
  **accent first** (`LayeredInspector.tsx:241`) and options second (`:259`). A field declared
  `{type:'accent', options:[…]}` silently ignores its options. No such field exists today, but
  this file is what brands read.
- `subOptionForField` emits `min`/`max` but never `step`, so `light-leak.intensity` arrives
  bounded 0..1 with step 1 — the spinner can only produce 0 or 1, and a typed `0.5` is
  `:invalid`.
- `at-cut-transitions.test.tsx:129` skips string/color sub-options, so nothing pins that an edited
  `glowColor` reaches `burn`'s presentation. `'#ff8800'` would be a fine probe.
- `lib/theming/transitions.ts`'s `TransitionRegistration` redundantly re-declares
  `renderer?: TransitionRenderer` that its own `extends` clause already supplies.
- A brand kind's editor label is `humanizeKey(kind)` — `TransitionRegistration` has no `label`
  field, and adding one is a contract widening, deliberately not done. The timeline's transition
  markers do not consult `transitionProps` (cosmetic). `TRANSITION_KINDS` in
  `lib/editor/app/transitions.ts` now has no non-test consumer.
- Two non-null assertions at `layered-adapter.ts:66,74` — `!isCut(x)` implies a truthy kind, but a
  predicate over `unknown` cannot narrow. Verified sound.
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
- `fade-coal` is a brand-derived **kind name**. Renaming touches every baked `Root.tsx`, so it
  is deliberately kept — see the NAME NOTE on its catalog entry.

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
