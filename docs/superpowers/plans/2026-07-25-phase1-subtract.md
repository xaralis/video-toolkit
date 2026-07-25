# Phase 1 — Subtract: drift removal in core

**Date:** 2026-07-25
**Branch:** `refactor/phase1-subtract`
**Baseline:** `0c45236`, 47 test files / 475 tests green
**Source plan:** `~/.claude/plans/vyvijime-tu-framework-kter-luminous-salamander.md`

## Goal

Remove the surfaces that let core drift, without changing a single rendered frame.
Core today carries two theming systems, a dead segment-era editor, four parallel
definitions of a transition, six unreachable transition presentations, and brand
constants belonging to Progresivní Pardubice and roost. None of it is load-bearing, and
all of it is a place where the next change can diverge.

Net effect: **~3650 LOC removed**, one source of truth for transitions, and a core that
no longer knows either brand's name.

## Global Constraints

These bind every task. Copy them into every reviewer dispatch.

1. **No rendered output may change.** This phase is pure subtraction and re-plumbing.
   Any change to a rendered frame is a defect, not an improvement.
2. **The test suite must stay green.** Baseline is 47 files / 475 tests. A task may
   remove tests belonging to deleted code; it may not leave a failing or skipped test.
3. **Never delete a file without proving it has no live importer** — check core `lib/`
   *and* both brand repos (`/Users/xaralis/Workspace/progpce/video-toolkit`,
   `/Users/xaralis/Workspace/roost/video-toolkit`), which consume core through the
   `@video-toolkit/lib` alias. A grep limited to core is not proof.
4. **Core must contain no brand-specific value.** No `lime`, `teal`, `coal`,
   `sand-brown`, `Roost`, `Progresivní Pardubice`, or brand asset name may remain in
   `lib/`. Brand-shaped values arrive through the theme or the reel data.
5. **Core has no `remotion` installed.** Anything importing Remotion cannot be unit
   tested here; keep the established pure/JSX split (see `lib/render/README.md`) so the
   math stays testable.
6. **Commit per task**, message in the repo's existing style. No `Co-Authored-By`.

## Known-safe facts (verified, do not re-derive)

- `lib/editor/app/{Timeline,Inspector,TransitionPicker}.tsx` and `trim.ts` have **no live
  importers**. `TransitionPicker` is imported only by `Inspector`; both go together.
- `lib/editor/app/timeline-util.ts` **must survive** — both brand editor hosts import
  `formatTimecode` from it. Only `frameFromClientX` and `rulerTicks` are Timeline-only.
- No brand imports `lib/components` **except** `TextOverlay.tsx` (`TextOverlayBase`), used
  by `roost-reels/src/overlays/TextOverlay.tsx`. Apparent `Label`/`Envelope` hits in the
  brand repos are name collisions (a code comment, and `useOverlayEnvelope` from the new
  `lib/theming`).
- Five components depend on the legacy theme: `AnimatedBackground`, `Label`,
  `LogoWatermark`, `NarratorPiP`, `SplitScreen`. All are hello-world-only.
- `LottieAnimation` is a live feature (`/toolkit:add-lottie-graphic`) — keep.
- `FilmGrain` and `Vignette` are wanted as core generic effects in Phase 3 — keep.

---

## Task 1 — Delete the segment-era editor cluster

Delete `Timeline.tsx`, `Inspector.tsx`, `TransitionPicker.tsx`, `trim.ts`, their
`.test.tsx`/`.test.ts` files, and their `.module.css` files — 11 files, ~3045 LOC.

Then prune `timeline-util.ts`: keep `formatTimecode` (both brand hosts import it), remove
`frameFromClientX` and `rulerTicks`, which existed only for the deleted `Timeline`, and
remove their cases from `timeline-util.test.ts`.

**Verify:** `npx vitest run` in `lib/editor` green; no dangling import anywhere in core or
either brand repo.

## Task 2 — Fix the two live correctness bugs

Independent of the rest; do it early so later tasks build on correct behaviour.

**2a — Montage transitions are silently dropped.** `lib/reel-config-base/derive-montage.ts:67`
emits `transitionIn` on every segment, but `computeVideoLayout`
(`lib/render/video-track-layout.ts:48-50`) honours `transitionIn` only on item 0 and reads
the *predecessor's* `transitionOut` for every other item — which montage never sets. Every
montage boundary loses its fade. Fix the derivation to emit `transitionOut` on the
preceding item (matching the ownership rule the layout enforces), and add a regression test
asserting a mid-montage boundary yields a non-`undefined` `outRecord`.

**2b — Editing destroys authored source.** `lib/editor/src/default-props-writer.ts`
`diffOps` recurses only into arrays of *unchanged length*, so any add/delete/split/duplicate
whole-array-replaces and destroys authored comments and `as const`. Make the diff handle
length changes without reserializing untouched elements. Correct the stale doc comment that
still claims the editor cannot add or remove array elements. Add a regression test that
round-trips a `Root.tsx` containing a comment and an `as const` through an item insert and a
delete, asserting both survive.

## Task 3 — One source of truth for transitions

Today a transition is defined four times: `TransitionSchema` (Zod),
`lib/editor/app/transitions.ts` `TRANSITION_KINDS` (which deliberately does not import the
schema), the `presentationFor` switch, and `transition-record.ts`.

Derive `TRANSITION_KINDS` from `TransitionSchema` so the catalog cannot drift, and type
`transitionIn`/`transitionOut` in `layered-schema.ts` with the schema instead of
`z.record(z.string(), z.unknown())`. This mirrors the move `placement.ts` already made for
`PLACEMENTS`.

Resolve the dead duplicates while here: `lib/transitions/presentations/clock-wipe.tsx` and
the custom `wipe` are exported and registry-documented but unused — `presentationFor` uses
the `@remotion/transitions` versions. Pick one implementation per kind and delete the other.

**Note:** tightening `transitionIn`/`transitionOut` may surface existing data that does not
validate. There are **17 vendored projects** across the two brand repos
(`progpce/video-toolkit/projects/`, `roost/video-toolkit/projects/`) carrying `LayeredReel`
literals. Before committing, parse every one of them against the tightened schema and report
any that fail. Report such cases rather than loosening the schema to accommodate them — a
literal that does not validate is either a real defect or a migration this phase must name.

## Task 4 — Wire the six orphan transitions in

`rgbSplit`, `zoomBlur`, `lightLeak`, `pixelate`, `checkerboard` and `scanlineGlitch` are
exported from `lib/transitions/` and documented in `_internal/toolkit-registry.json`, but
have zero references from `TransitionSchema`, `TRANSITION_KINDS` or `presentationFor` — they
are unreachable from the editor and from any config.

Add each to `TransitionSchema` (with whatever params its presentation takes) and to
`presentationFor`. With Task 3 done, the editor catalog follows automatically.

Depends on Task 3.

## Task 5 — Evict brand constants from core (schema and derivation)

- `lib/reel-config-base/transition-schema.ts:46` — `wipe.color: z.enum(['lime','teal','coal'])`
  is PP's palette in a core schema. Replace with an accent-slot key resolved against the
  brand palette at render time (see `lib/theming/palette.ts` `resolveAccentColor`).
- `lib/reel-config-base/derive-montage.ts:171` — `topic: 'Roost reel'` hardcoded; take it
  from the input instead.
- `derive-montage.ts` mirrors roost's `TeaserOverlay` timing constants
  (`LINE_STAGGER_SEC`, `TEASER_HOLD_SEC`, `TEASER_FADE_SEC`) — core duplicating a brand
  component's internals. Make them parameters with neutral defaults.

## Task 6 — Evict brand constants from core (editor UI)

- `LayeredInspector.tsx:261-262` — `OUTRO_STYLES = ['organic','fade','bloom','static','heartbeat']`
  and `OUTRO_VARIANTS = ['sand-brown','white-black']` are roost's. `EFFECT_DEFAULTS`
  (line 253) offers only `vintage` and `ken-burns`.
- `AccentEditor.tsx:24` — `DEFAULT_COLORS = [lime, teal]` plus `.lime`/`.teal` classes in the
  module CSS.
- `LayeredTimeline.tsx` — `EFFECT_COLOR` hardcodes template overlay kinds
  (`overlay-stat-callout`, `overlay-chevron`, `overlay-quote-pull // legacy`, …).

All of these must arrive as theme- or props-supplied metadata with neutral core defaults, so
a third brand gets a correct inspector without editing core. Keep the change additive at the
call sites: the brand hosts pass what they already know.

**Note:** the media-path conventions in `LayeredTimeline.tsx:25-32` (`/recordings/`,
`/broll/`) are the same class of leak but belong to Phase 3's `resolveMediaSource`. Leave
them; do not half-solve them here.

## Task 7 — Collapse duplicate type declarations

- Three accent modules: `lib/transcripts/accent-parser.ts`, `lib/editor/app/accent.ts`,
  `lib/editor/app/accent-runs.ts`, with two independent `AccentColor = string`. Collapse to
  one.
- `Crop` declared three times: `lib/reel-config-base/crop.ts`,
  `lib/reel-config-base/base-types.ts`, and `CropSchema` in `segment-base-schemas.ts`.
  Collapse to the Zod schema plus one inferred type.

## Task 8 — Replace hello-world and retire the legacy theming system

Largest task; do it last so the earlier deletions have settled.

Write a new **minimal layered example** under `examples/` built on `CompositionTheme` +
`LayeredReelComposition` — a fresh example, not a port, so it does not inherit the old
architecture's shape. It should demonstrate the current contract end to end: a brand theme,
a small `LayeredReel` literal, and a composition that renders.

Then delete `examples/hello-world`, `lib/theme/`, `lib/brand.ts`, `lib/generate-brand-ts.ts`,
and the five components that depend on them (`AnimatedBackground`, `Label`, `LogoWatermark`,
`NarratorPiP`, `SplitScreen`), updating `lib/components/index.ts`.

**Keep, at their current paths:** `TextOverlay.tsx`, `LottieAnimation`, `FilmGrain`,
`Vignette`.

`TextOverlay.tsx` belongs beside `GenericTextOverlay` in `lib/theming`, but **do not move it
in this phase**: roost imports it as `@video-toolkit/lib/components/TextOverlay`, so moving
it forces a brand-repo commit (which requires 1Password SSH signing) plus a submodule pin
bump. Phase 1 is core-only. The move is queued for Phase 3, when the brand repos are being
touched anyway.

Finally rewrite `docs/creating-templates.md` against the new example — it currently teaches
the superseded `Root.tsx` + Theme + `TransitionSeries` shape — and update
`_internal/toolkit-registry.json` for every component and transition whose status changed in
this phase.

---

## Verification

- `npx vitest run` in `lib/editor` after every task; green is the gate.
- After Tasks 3–5, a render parity check in **both** brand repos: `remotion still` at
  matching frames (a clip, a broll, a photo, and a frame mid-transition) before and after.
  Any pixel difference is a regression.
- After Task 8, the new example must actually render.
- Final: `grep -riE 'lime|teal|coal|roost|progresivn|sand-brown' lib/` returns nothing.
