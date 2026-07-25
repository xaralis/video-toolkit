# Unified Transition System (at-the-cut, handles, full Remotion catalog) — Design

**Date:** 2026-07-22
**Branch:** `feat/reel-editor-skeleton`
**Status:** approved (model B + fully unified + full catalog), pending spec review

## Goal

A single, unified transition system for the layered reel:

1. **Renders for real** in absolute placement — pro-editor "at-the-cut" model
   (clips stay butted; the transition sits at the cut and borrows **handle
   frames**; sequence length unchanged).
2. **Uniform across every boundary** — clip↔clip, clip↔card, clip↔outro, and
   the **edge fades** (opening from coal, closing to coal) — all the same
   mechanism, all shown the same way on the timeline. Not just clip↔clip.
3. **Supports the full transition catalog** — every `@remotion/transitions`
   presentation shipped in 4.0.425 plus the toolkit's own custom presentations.

Replaces the current degradation where a `transitionOut` collapses to a fade-in.

## The catalog (core-owned)

Both the metadata (`lib/editor/app/transitions.ts` — kinds, labels,
sub-options) and the custom presentations (`lib/transitions/` — `glitch`,
`whipPan`, `zoomThrough`, `customWipe`) live in **core**, so transitions are a
core-owned vocabulary a brand composition renders.

| kind | presentation source | sub-options |
|------|---------------------|-------------|
| `cut` | none (hard cut) | — |
| `fade` / `dissolve` | `@remotion/transitions/fade` | — |
| `fade-coal` | `fade()` tinted coal | — |
| `slide` | `@remotion/transitions/slide` | direction (4-way) |
| `wipe` | `@remotion/transitions/wipe` | direction (4-way) |
| `flip` | `@remotion/transitions/flip` | direction (4-way) |
| `clock-wipe` | `@remotion/transitions/clock-wipe` | — |
| `iris` | `@remotion/transitions/iris` | — |
| `glitch` | `lib/transitions` (custom) | — |
| `whip-pan` | `lib/transitions` (custom) | direction (4-way) |
| `zoom-through` | `lib/transitions` (custom) | from (in/out) |
| `gradient-wipe` | `lib/transitions` (custom) | direction + softness |

`TRANSITION_KINDS` / `subOptionsFor` / `defaultTransition` in `transitions.ts`
are extended to this full set. The composition has one `presentationFor(kind)`
mapping covering all of them (importing the Remotion presentations +
`lib/transitions` customs). New kinds need a catalog entry + a `presentationFor`
case; nothing else.

## Data model (small permissive additions)

A transition lives at a **boundary** and is stored on the item before it:

- **`transitionOut`** on the item BEFORE a boundary (already on the schema,
  permissive). Now valid on ANY item including the **last** one — a
  `transitionOut` on the last item is the **closing** transition (renders
  against the coal background; e.g. the outro's fade-out becomes
  `transitionOut: { kind: 'fade-coal', frames }` instead of hardcoded
  composition logic).
- **`transitionIn`** on the FIRST item — the **opening** transition (coal →
  clip 1). New optional permissive field on `VideoItemSchema` (mirrors
  `transitionOut`). Only meaningful on the first item; mid-reel incoming
  boundaries are already covered by the previous item's `transitionOut`.

So every boundary in the reel — `[coal → item0]`, `[item i → item i+1]`,
`[last → coal]` — can carry a transition, and each is a `{ kind, frames,
direction?, from?, color?, softness? }` record. No new track; the derivation is
unchanged (transitions are carried through, not repositioned).

## Rendering — unified at-the-cut, any neighbour

For a transition at boundary time `T`, `frames = N`, centered on the cut, the
window is `[Tf − floor(N/2), Tf + ceil(N/2)]` (`Tf = msToFrames(T)`). During the
window BOTH sides render and the kind's presentation blends them
(`presentationDirection` `exiting` for the leaving side, `entering` for the
arriving side, `presentationProgress` from `useCurrentFrame()`):

- **Video-clip side** → shows **handle frames** (source beyond the trim):
  exiting extends `trimOut` by `ceil(N/2)/fps`; entering pulls `trimIn` back by
  `floor(N/2)/fps` (clamped ≥ source start). If a clip lacks handles, clamp /
  freeze the boundary frame (Premiere's "insufficient media").
- **Card / outro side** → no source handles; it simply renders its content
  shifted into the window (cards are positional — always available).
- **Coal / nothing side** (edge fades, single-sided) → the coal background shows
  through; the clip fades from/to coal via the presentation. This is what makes
  `transitionIn` on the first item and `transitionOut` on the last item work
  with the SAME mechanism.

The mechanism is identical regardless of neighbour type — that is the
"unified" requirement. `FadeIn` and the hardcoded opening/outro fades are
removed and replaced by this path.

## Editor — unified Transitions lane (xzdarcy verified)

A dedicated **Transitions lane** (own row, thinner), **derived — the only
schema change is the `transitionIn` field**. Verified against
`@xzdarcy/react-timeline-editor`: free `start`/`end`, `getActionRender` custom
marker, `onClickAction` selection, `flexible/movable:false` lock,
`minStart/maxEnd` for a future length-drag. Clips stay non-overlapping on the
video lane (xzdarcy's happy path).

The adapter emits one centered-at-cut block per boundary transition — for each
item's `transitionOut` (block centered on that item's `endMs`) AND the first
item's `transitionIn` (block centered on `0`). All uniform: same marker, label
`"<kind> · <frames>f"`.

Interaction (this work): click a block → inspector shows kind (full-catalog
select), sub-options (`subOptionsFor(kind)` — direction / from / color /
softness), and length (frames, editable — writes `frames`, no reposition).
Lane drag-locked. Deferred: drag-block-edge, drag-to-create, alignment
(start/end-at-cut; center-at-cut is the default).

## Files

- `lib/editor/app/transitions.ts` (core) — extend `TRANSITION_KINDS` +
  `subOptionsFor` + `defaultTransition` to the full catalog (add `fade`,
  `slide`, `flip`, `clock-wipe`, `iris`).
- `lib/reel-config-base/layered-schema.ts` (core) — add optional
  `transitionIn` (permissive record) to `VideoContainerBase`.
- `lib/editor/src/timeline/layered-adapter.ts` (core) — emit unified transition
  actions from every `transitionOut` (incl. last item) + the first item's
  `transitionIn`.
- `lib/editor/app/LayeredTimeline.tsx` (core) — render the lane uniformly.
- `lib/editor/app/LayeredInspector.tsx` (core) — full-catalog transition editor
  (kind + `subOptionsFor` sub-options + length); reconcile with the existing
  video-lane "Transition out" section (share one editor body).
- Pilot `../video-toolkit/projects/pp-namesti-republiky/src/LayeredCampaignReel.tsx`
  — `presentationFor(kind)` over the full catalog; unified at-cut render across
  clip/card/outro/coal + edge fades; remove `FadeIn` + hardcoded opening/outro
  fades; add the pilot's opening (`transitionIn`) / closing data if desired for
  the parity check.
- Custom presentations reused from `lib/transitions`; Remotion ones from
  `@remotion/transitions/*`.

## Testing

- `transitions.test.ts`: `TRANSITION_KINDS` includes the full catalog; every
  kind has a `defaultTransition`; `subOptionsFor` returns the right controls
  (direction for slide/wipe/flip/whip-pan, from for zoom-through, softness for
  gradient-wipe, none for fade/clock-wipe/iris/cut).
- `layered-schema.test.ts`: a `VideoItem` parses with `transitionIn`; the field
  is optional.
- `layered-adapter.test.ts`: a transition action per `transitionOut` (incl. the
  last item → to coal) and per first-item `transitionIn`; centered at the
  boundary in seconds; a `cut`/absent transition yields none.
- Composition: pure `presentationFor(kind)` covers the full catalog (unit); the
  visual is the parity render.
- Inspector: selecting a transition routes to the full-catalog editor; edits
  write `transitionOut`/`transitionIn` (no reposition).
- Full core suite + `tsc` green.

## Parity strategy

- Pilot's `dissolve: 12` (into the outro) renders as a real dissolve into the
  outro card (both visible), total UNCHANGED (`46301`ms).
- Add a pilot opening `transitionIn` (fade from coal) + confirm it renders as a
  fade-in — proving the edge-fade / single-sided path.
- Throwaway derive exercising `slide` / `wipe` / `flip` / `clock-wipe` / `iris`
  / `glitch` / `whip-pan` to confirm each presentation renders.

## Risks

- **Scope** — this is a full transition system, not one effect. Mitigated by
  building the catalog (core, well-tested) before the render.
- **Handle availability** — clamp/freeze when a clip lacks handles.
- **Card/outro/coal sides** rendering into the window without doubling the main
  render — the composition must gate the main body vs the transition window
  cleanly (the parity render + a triple-boundary fixture guard it).
- Manually-driven presentations must get the exact props (`presentationProgress`,
  `presentationDirection`, `presentationDurationInFrames`) each kind expects —
  verified per kind in the parity check.

## Deferred (follow-up)

- Alignment (start/end-at-cut); drag-the-block-edge; drag-two-clips-to-create.
