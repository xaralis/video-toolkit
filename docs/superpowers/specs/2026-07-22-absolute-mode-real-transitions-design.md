# Real Transitions in Absolute Placement — Design

**Date:** 2026-07-22
**Branch:** `feat/reel-editor-skeleton`
**Status:** approved (design direction), pending spec review

## Goal

Make real transitions — `dissolve` / `fade-coal` / `glitch` / `whip-pan` /
`wipe` / `zoom-through` — actually render in the absolute-placement layered
composition, instead of the current degradation where any `transitionOut`
collapses to a plain fade-in on the incoming clip.

## Motivation

The layered composition places video clips as **absolute `<Sequence>`s**
(`from = msToFrames(startMs)`), so a clip can be freely moved with gaps and
overlaps — that was the deliberate choice over `@remotion/transitions`'s
`TransitionSeries`, which only chains clips sequentially. The cost, taken as a
temporary shortcut, was that transitions stopped rendering: a clip whose
previous clip had a `transitionOut` just fades in from the coal background
(`FadeIn`), and the outgoing clip is already unmounted — so `glitch`, `wipe`,
`whip-pan`, and even a true cross-`dissolve` are all lost.

The user's requirement: real transitions must work in absolute mode before we
propagate the layered model further. (Deferred item, memory
`absolute-mode-real-transitions`.)

## Key enabler

`@remotion/transitions` **presentations** — `fade()` and the brand's custom
`glitch()` / `whipPan({direction})` / `wipe({color, direction})` /
`zoomThrough({direction})` — are just components implementing the presentation
interface (`presentationProgress`, `presentationDirection: 'entering' |
'exiting'`, `passedProps`, `children`). `TransitionSeries` is only one *driver*
of them. We can drive the **same presentations manually** inside overlap
windows we control with absolute `<Sequence>`s — keeping absolute placement
while getting the exact same transition visuals the old `TransitionSeries`
composition produced.

## Design: transition = clip overlap + presentation

A transition is modelled as a **real timeline overlap** between two adjacent
video clips, plus an effect. This fits absolute placement (overlaps are already
expressible — clips carry absolute `startMs`/`endMs`) and matches how the old
`TransitionSeries` composition behaved (adjacent segments overlapped by
`frames`, both playing during the transition).

### Rendering (composition)

For each adjacent pair A→B where A has `transitionOut` of `N` frames and B
starts inside A (`B.startMs < A.endMs`), the overlap window is
`[B.startMs, A.endMs]`. During it, **both clips are mounted** (their absolute
Sequences already overlap) and each wraps its content in the presentation for
`A.transitionOut.kind`:

- A, during its **last N frames**, renders through the presentation as
  `exiting` (progress 0→1).
- B, during its **first N frames**, renders through the presentation as
  `entering` (progress 0→1).

Composited (B stacked above A), this is a real cross-dissolve / glitch / wipe /
whip-pan — identical to `TransitionSeries` internals, but from absolute
Sequences. Outside the overlap, each clip renders normally. The current
`FadeIn` degradation is removed.

Kind → presentation mapping (reuse the old composition's `renderTransition`):

| `transitionOut.kind` | presentation                          |
|----------------------|---------------------------------------|
| `dissolve`           | `fade()`                              |
| `fade-coal`          | `fade()` (coal-tinted per brand)      |
| `glitch`             | `glitch()`                            |
| `whip-pan`           | `whipPan({ direction })`              |
| `wipe`               | `wipe({ color, direction })`          |
| `zoom-through`       | `zoomThrough({ direction / from })`   |
| `cut` / none         | no overlap, hard cut                  |

`timing` is `linearTiming({ durationInFrames: N })` — but since we drive
progress ourselves from the overlap window, we compute progress directly
(`(frame − overlapStart) / N`), no `TransitionSeries` timing object needed.

### Timeline model (derivation)

`deriveLayered` currently lays clips **abutting** (`cursorMs += durMs`; no
overlap), yet already subtracts the last content clip's `transitionOut` overlap
when computing the brand `contentEndMs` — an existing inconsistency. This design
makes the overlap **real**:

- After a segment with `transitionOut` of `N` frames, back the cursor up by `N`
  frames so the **next** segment overlaps it: `cursorMs = endMs − overlapMs`.
- The outgoing clip keeps its full `endMs` (it plays through the overlap); the
  incoming clip's `startMs` moves earlier by `overlapMs`.
- `meta.totalDurationMs = cursorMs` now equals Σdurations − Σoverlaps — matching
  the old `TransitionSeries` total (the reel gets shorter by the overlap sum),
  and making the brand `contentEndMs` logic consistent (it can stop subtracting
  a special-case last overlap once overlaps are real, OR keep it — resolved in
  the plan against parity).

### Audio across a transition

Audio items are derived at their clip's span. With clips overlapping by `N`,
adjacent audio items overlap by `N` too — both play briefly during the
transition, which matches the old `TransitionSeries` (it overlapped whole
sequences, audio included). This is the default. The plan verifies against the
pilot render whether the brief overlap needs an audio fade (likely fine for the
short `N` = 8–18 frames; if a doubling blip appears, add a short linear audio
fade over the overlap). `extend-previous` and `inherit-from-clip` audio spans
are recomputed from the (now overlapped) clip spans.

### Music envelope

`computeMusicEnvelope` reads item spans + `musicBoostDb`. With overlapped
spans, the envelope timing shifts accordingly; no logic change, but the derived
`points` move — covered by the envelope's existing tests plus the parity render.

## Editor — derived Transitions lane

Because the clips now really overlap, the overlap needs a clear visual. The
editor gets a dedicated **Transitions lane** (like the music/brand lanes), but
it is a **derived view — no schema change**. A transition block is computed
from two adjacent clips: where clip A (carrying a non-`cut` `transitionOut`)
overlaps the next clip B (`B.startMs < A.endMs`), a block spans
`[B.startMs, A.endMs]`, labelled with the kind + length (e.g. "dissolve · 12f").
Everything it shows already lives in the data: the length IS the overlap
(`A.endMs − B.startMs`), the kind/direction live on `A.transitionOut`.

Interaction (this work):
- **Click a transition block** → select it → the inspector shows the transition:
  **kind** (a select over dissolve/fade-coal/glitch/whip-pan/wipe/zoom-through)
  and **direction** (for whip-pan/wipe). Editing these writes back to
  `A.transitionOut` only — no clip repositioning.
- The lane is drag-locked (like music/brand): the block can't be freely moved.
- **Length shown read-only** (derived from the overlap).

Deferred to a follow-up (all require repositioning clips = ripple-edit, not
opened here):
- Changing a transition's **length** (drag the block's edge, or a length field
  that moves B's start and cascades subsequent clips).
- **Drag two clips to overlap** to create a transition.

## Scope

- **In scope:** (1) transitions render correctly in the layered composition for
  every kind in use, via overlap + presentation; (2) derivation produces real
  overlaps; (3) a derived Transitions lane renders the blocks + click-to-select
  with kind/direction editing in the inspector; (4) parity verified on the pilot.
- **Deferred (follow-up):** transition length editing / drag-edge / drag-to-
  create — anything that repositions clips (ripple-edit).

## Files

- `lib/reel-config-base/derive-layered.ts` (core) — overlap the cursor by
  `transitionOut.frames`; reconcile `totalMs` / brand `contentEndMs`.
- `lib/reel-config-base/music-envelope.ts` (core) — no logic change expected;
  re-verify.
- The pilot composition
  `../video-toolkit/projects/pp-namesti-republiky/src/LayeredCampaignReel.tsx`
  (brand repo) — replace `FadeIn` with the overlap-driven presentation render;
  a small `renderTransitionPresentation(kind, direction, progress, passedProps,
  children)` helper mapping kinds → the brand/`@remotion/transitions`
  presentations.
- Brand transition presentations live in `@brand-lib` + `@remotion/transitions`
  (reused, not rewritten).
- `lib/editor/app/timeline/layered-adapter.ts` (core) — add a derived
  `transitions` lane: compute a transition action per adjacent overlapping pair
  (id encodes the outgoing clip, e.g. `transition:<clipId>`); drag-locked.
- `lib/editor/app/LayeredTimeline.tsx` (core) — render the lane + a per-block
  label ("<kind> · <frames>f"); add `transitions` to `LANES` and `LOCKED_LANES`.
- `lib/editor/app/LayeredInspector.tsx` (core) — a transition route: kind select
  + direction (whip-pan/wipe), writing back to the outgoing clip's
  `transitionOut`; length read-only.

## Parity strategy

- Pilot `pp-namesti-republiky` has one `transitionOut: { kind: 'dissolve',
  frames: 12 }` (seg-002 broll). After the change, render the pilot and confirm:
  - the dissolve reads as a real cross-dissolve between the broll and the
    following clip (both visible, blending), not a fade-from-coal;
  - total duration shrank by the overlap (12 frames) vs the pre-change render;
  - audio stays correct across the transition (no doubling blip);
  - brand watermark/disclaimer still hide at content end.
- A second, richer check: a throwaway derive of a config exercising `glitch` /
  `wipe` / `whip-pan` (or borrow pp-05's `glitch`/`whip-pan` data) to confirm
  each presentation renders. Unit-test the derivation overlap math directly.

## Testing

- `derive-layered.test.ts`: adjacent clips with `transitionOut: { frames: N }`
  overlap by `N` (next `startMs = prev.endMs − round(N/fps*1000)`); `totalMs`
  equals Σdurations − Σoverlaps; a `cut`/no-transition boundary does NOT overlap;
  the outro is never overlapped into.
- `music-envelope` tests stay green (spans shift, logic unchanged).
- Composition: pure `renderTransitionPresentation` mapping is unit-testable
  (kind → presentation); the visual is covered by the parity render.
- `layered-adapter.test.ts`: the derived `transitions` lane yields one action
  per overlapping adjacent pair spanning `[next.startMs, prev.endMs]` with a
  `transition:<clipId>` id; a `cut`/no-overlap boundary yields none; the outro
  boundary yields none.
- Inspector: selecting a transition action routes to the transition editor;
  changing kind writes the outgoing clip's `transitionOut.kind` (no reposition).
- Full core suite + `tsc` green.

## Risks

- **Timeline-timing shift** (total shrinks by Σoverlaps) ripples into audio /
  brand / music derivation — the main risk, gated by the pilot parity render.
- Presentations driven manually must receive the exact props/progress
  `TransitionSeries` gave them; the plan verifies the visual against the old
  composition's look for each kind.
- Multiple consecutive transitions (A→B→C both overlapping) must compose
  correctly (B is simultaneously `entering` from A and `exiting` to C) — the
  overlap windows are disjoint at B's head vs tail, so this composes, but the
  plan adds a test/fixture for a triple-overlap chain.
