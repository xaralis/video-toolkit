# One transition contract — retire the one-sided `TransitionSeries` path

**Date:** 2026-08-01
**Status:** approved, not implemented
**Repos:** `core` (this one) and the Progresivní Pardubice brand repo (`progpce/video-toolkit`)

## The problem

Phase 5 made every transition a **two-sided plan** applied to each clip's single mount, and
`buildVideoNodes` is the one assembly that renders it. Nineteen of twenty catalog kinds go through
it. But one template — `web-program-intro` — still renders cuts a second way: it chains
`TransitionSeries.Sequence` + `TransitionSeries.Transition` and drives them through
`presentationFor`.

That second path is inherently **one-sided**. `TransitionPresentationComponentProps` carries
`children` (singular) and a `presentationDirection`, and `TransitionSeries` invokes the presentation
once per side into separate sibling subtrees. So a transition that is a *relationship between the
two sides* has nowhere to live:

- `wipe`'s sheet must sit **between** A and B in z-order — there is no node between two sibling
  subtrees.
- `scanline-glitch`'s `post` filters the **composite** of both — nothing in that interface spans
  both.

Phase 5 also narrowed the path further: `presentationFor`'s two-input set went **5 → 7**
(`gradient-wipe` and `rgb-split` joined), so those two now return `null` and silently hard-cut
through `TransitionSeries`.

The fix is not to adapt a two-sided contract down to a one-sided interface. It is to **delete the
one-sided path.**

## The principle

**Every project and template lives on the same contract, and carries only its own special stuff.**

The shared contract is: a timeline of `VideoItem`s with absolute spans, transitions declared on
items (`transitionIn` / `transitionOut`), and rendering delegated to the brand through
`renderItem`. A template's legitimate content is its **segment renderers, its theme, and its config
schema** — never its own way of expressing time or cuts.

`roost-reel-01`'s `LayeredRoostReel.tsx` already demonstrates this shape and is the working
reference for the rewrite.

## Scope

**In:**

1. Rewrite `templates/web-program-intro/src/WebProgramIntro.tsx` onto `buildVideoNodes`.
2. Propagate the rewritten file to the five vendored project copies
   (`projects/pp-program-{bydleni,klima,mobilita,obvody,verejny-prostor}/src/WebProgramIntro.tsx`).
   `/toolkit:sync-template` exists for exactly this and should be tried first; a plain file copy is
   an acceptable fallback, since these projects are frozen and none is expected to carry local edits
   to this file worth preserving. Verify that assumption with a diff against the template before
   overwriting — if a copy *has* diverged, note it and overwrite anyway.
3. Delete `presentationFor` and its two-input warning from `lib/render/at-cut-transitions.tsx`.

**Out of scope — deliberately:**

- **Reimplementing the 13 lifted kinds as native plans.** `wrapRemotionPresentation` stays. It is an
  internal detail of how core builds its own Remotion-derived kinds; no brand sees it, and deleting
  it would mean re-deriving Remotion's own `fade`/`slide`/`flip`/`clock-wipe`/`iris` maths with real
  pixel risk on kinds that currently move zero goldens. It buys nothing this goal needs.
- `rgb-split`'s 6→2 SVG-filter rewrite, and the `>64 distinct records` cache-thrash pin. Both are
  already ledgered follow-ups and neither blocks this.

## The change

### 1. `WebProgramIntro.tsx` → `buildVideoNodes`

Today it builds `TransitionSeries.Sequence` per segment with `TransitionSeries.Transition` between,
and resolves each transition through `presentationFor`.

After: derive a `VideoItem[]` from `reelConfig.segments` with **absolute, sequential, non-overlapping
spans**, and hand it to `buildVideoNodes` with a `renderItem` that dispatches to the template's own
`FootageSegment` / `MultiClipSegment`. Transitions ride on the items as `transitionOut`, exactly as
they do for campaign-reels and roost-reels; core does the rest.

`buildVideoNodes`' signature is unchanged and already general — `renderItem` means the caller owns
rendering, which is precisely the "carry only your special stuff" line.

### 2. Timing changes, and that is accepted

The two models compute time differently:

| | how a transition affects time |
|---|---|
| `TransitionSeries` | neighbours **overlap** by the transition's frames — the reel gets **shorter** |
| layered / `buildVideoNodes` | the window **borrows** `inHalf`/`outHalf` from each side, inside existing spans — total duration **unchanged** |

We adopt the layered semantics directly, with **no compatibility conversion**. Consequence: every
segment's absolute position and each reel's total length change, so the five existing projects'
voiceover will desync and their published renders will differ.

**This is accepted.** Those five projects are frozen and will not be worked on again. Rejecting the
compatibility path is what keeps this small — a fidelity-preserving conversion would be the largest
piece of work in the whole change, in service of output nobody will re-render.

### 3. Delete `presentationFor`

Once step 1 lands, nothing calls it. Remove the function and its two-input warning. Its docblock
records why the warning was kept in Phase 5 (six live PP call sites) — that reason expires with this
change, and the deletion should say so.

`getTransitionRecord` stays; it is the shared gate every path uses.

## Fallback — take it early, not late

If converting `WebProgramIntro.tsx` incrementally fights back — the segment config resists mapping
onto `VideoItem`'s union, or the timing derivation turns fiddly — **stop converting and write a
fresh `WebProgramIntro` on `buildVideoNodes` from scratch**, then swap it in as the final step. The
existing file is not worth preserving; the template's value is its segment renderers and config,
both of which survive either way.

## Anything that resists, gets removed

Any transition in the five dead projects that does not survive the move is **deleted** rather than
made to work. Same for any segment shape that does not map cleanly. Speed beats preservation here,
and these projects are frozen.

## Testing

Proportionate to the change, which is subtractive in core and a rewrite in one brand file:

- **Core:** the existing editor suite must stay green (109 files / 1788 tests at time of writing —
  re-derive). Deleting `presentationFor` should reduce the count; every removed test must be removed
  because it *could no longer fail*, and that must be stated per test.
- **Core gates:** `tsc --noEmit` (exit code read **separately**), example typecheck + coverage floor,
  brand-leak grep 2, `it.fails` 0.
- **Pixel harness:** unaffected — it renders the 20 kinds through `buildVideoNodes`, which this does
  not change. Skip it, and say so.
- **PP:** the repo typechecks, and **one** `web-program-intro` project renders and plays. No golden
  work; this template has never had pixel coverage.

## Success criteria

1. `git grep presentationFor` in core returns no production definition or call.
2. No `TransitionSeries` usage remains in the PP repo's templates or projects.
3. Every template in every brand repo reaches a cut through `buildVideoNodes` and nothing else.
4. All 20 catalog kinds are usable from `web-program-intro`, including `wipe`, `gradient-wipe`,
   `rgb-split` and `scanline-glitch` — the kinds the one-sided path could not express.

## Follow-ons, not blockers

- `rgb-split` 6 → 2 media elements via an `feOffset`/`feColorMatrix`/`feBlend` chain (`glitch` and
  `scanline-glitch` already use this shape).
- A derived pin for the `>64 distinct transition records` cache-thrash remount risk.
- The two brand-facing `wrap` dev warnings that were never built (unstable `wrap`; conditionally
  declared `wrap`).
