# Real Transitions in Absolute Placement — Design (model B: at-the-cut, handles)

**Date:** 2026-07-22
**Branch:** `feat/reel-editor-skeleton`
**Status:** approved (model B, xzdarcy verified), pending spec review

## Goal

Make real transitions — `dissolve` / `fade-coal` / `glitch` / `whip-pan` /
`wipe` / `zoom-through` — render in the absolute-placement layered composition,
the way professional editors (Premiere / Final Cut / DaVinci) do it: a
transition sits **at the cut** and borrows **handle frames** from both clips,
so clips don't move and the sequence length doesn't change. This replaces the
current degradation where any `transitionOut` collapses to a fade-in on the
incoming clip.

## Why model B (at-the-cut, handles) over model A (overlap-consume)

The user's directive: do it like other editors. Pro NLEs use the **handle**
model — the transition is an object at the cut, the clips stay butted, and the
effect reveals source material beyond the trim (handles) on both sides. The
sequence length is unchanged. (CapCut-style "overlap and shorten" — model A —
was the alternative; rejected as non-pro and because it would ripple the whole
timeline.)

Model B's payoffs:
- **No derivation / timing change.** Clips stay butted; `meta.totalDurationMs`,
  audio items, brand span, and the music envelope are all untouched — the main
  risk of model A disappears.
- **Length editing is free** (no ripple): changing a transition's length only
  changes `transitionOut.frames` (the render window + the block width); no clip
  moves. Bounded by available handle frames.
- **Cleaner timeline** and **xzdarcy-friendly**: clips stay non-overlapping on
  the video lane (overlapping actions on one row is the one thing xzdarcy
  doesn't do well); the transition is a normal single action on its own lane.

Cost: the composition must render **handle frames** (source beyond the trim) in
the transition window. When a clip lacks handles (trimmed to the very start/end
of its source), degrade gracefully (freeze the boundary frame, or shrink the
window) — same as Premiere's "insufficient media" warning.

## Key enabler

`@remotion/transitions` **presentations** — `fade()` and the brand's custom
`glitch()` / `whipPan({direction})` / `wipe({color, direction})` /
`zoomThrough({direction})` — implement a simple interface
(`presentationProgress`, `presentationDirection: 'entering' | 'exiting'`,
`passedProps`, `presentationDurationInFrames`, `children`). `TransitionSeries`
is only one driver; we drive the **same presentations manually** over a window
centered on the cut, from absolute `<Sequence>`s — same visuals, absolute
placement preserved.

## Design

### Data — no change

A transition stays a property of the outgoing clip: `transitionOut = { kind,
frames, direction?, color? }` (already in the schema, permissive). Clips remain
butted (`B.startMs === A.endMs`). No overlap is stored; no new schema; the
derivation is unchanged. Alignment is **center-at-cut** (Premiere default);
start/end-at-cut alignment is deferred.

### Rendering (composition) — the bulk of the work

For a transition at cut `T` (where clip A ends and clip B starts, butted),
`frames = N`, centered: the transition window in frames is
`[Tf − floor(N/2), Tf + ceil(N/2)]` where `Tf = msToFrames(T)`.

- **Outgoing A:** its render `<Sequence>` is extended `ceil(N/2)` frames past
  its end; the extra frames show A's source **past `trimOut`** (handles). Over
  the window, A's body is wrapped in the transition's presentation as
  `exiting` (progress 0→1 across the window).
- **Incoming B:** its render `<Sequence>` starts `floor(N/2)` frames earlier;
  the extra frames show B's source **before `trimIn`** (handles). Over the
  window, B's body is wrapped in the presentation as `entering`.
- The two render-time extensions overlap over the window (data positions
  unchanged) → the presentations composite into a real cross-dissolve / glitch
  / wipe / whip-pan, identical to `TransitionSeries`.

Progress is computed from `useCurrentFrame()` relative to the window
(`clamp((frame − windowStart) / N, 0, 1)`), so no `TransitionSeries` timing
object is needed.

**Handle clamping:** the usable half-window on each side is
`min(N/2, availableHandleFrames)`. A's handle = `sourceDurationFrames −
trimOutFrames`; B's handle = `trimInFrames`. If a side has fewer handle frames
than `N/2`, clamp that side (and, to keep the effect symmetric, optionally the
other) and — when zero — freeze the boundary frame. The pilot's clips are
trimmed from longer sources, so handles exist; clamping is the safety net.

Kind → presentation (reuse the old `renderTransition`):

| `transitionOut.kind` | presentation                        |
|----------------------|-------------------------------------|
| `dissolve`           | `fade()`                            |
| `fade-coal`          | `fade()`                            |
| `glitch`             | `glitch()`                          |
| `whip-pan`           | `whipPan({ direction })`            |
| `wipe`               | `wipe({ color, direction })`        |
| `zoom-through`       | `zoomThrough({ direction })`        |
| `cut` / none         | no transition (hard cut)            |

The current `FadeIn` degradation is removed.

### Editor — derived Transitions lane (xzdarcy verified)

A dedicated **Transitions lane** (own row, thinner `rowHeight`), **derived — no
schema change**. Verified against `@xzdarcy/react-timeline-editor`: actions
carry free `start`/`end`; `getActionRender` custom-renders the marker;
`onClickAction` selects; `flexible: false` + `movable: false` (and
`onActionMoving → false`) lock it; `minStart`/`maxEnd` are available to bound a
future length-drag to the handle window. Crucially, clips stay non-overlapping
on the video lane (xzdarcy's happy path).

Per adjacent pair A→B where A has a non-`cut` `transitionOut`, the adapter emits
one action on the `transitions` lane centered on the cut:
`{ id: 'transition:'+A.id, start: cut − round((N/2)/fps*1000), end: cut + round((N/2)/fps*1000), effectId: kind }`
where `cut = A.endMs = B.startMs`. `getActionRender` shows a marker + label
("<kind> · <frames>f").

Interaction (this work):
- **Click** the block → select → inspector shows the transition: **kind**
  (select), **direction** (whip-pan/wipe), and **length** (frames — editable
  number; writes `transitionOut.frames`, no reposition, clamped to handles).
- Lane is drag-locked (drag-to-resize the block on the timeline = later polish;
  the inspector number field covers length now).

Deferred: alignment selector (start/end-at-cut), drag-the-block-edge,
drag-two-clips-to-create.

## Files

- `lib/reel-config-base/derive-layered.ts` — **no change** (transitions are
  render + editor concerns; clips stay butted).
- `lib/editor/src/timeline/layered-adapter.ts` (core) — derived `transitions`
  lane: one centered-at-cut action per A→B pair with a non-`cut` `transitionOut`.
- `lib/editor/app/LayeredTimeline.tsx` (core) — render the lane (thin row),
  `getActionRender` marker + "<kind> · <frames>f" label, lock it.
- `lib/editor/app/LayeredInspector.tsx` (core) — transition route: kind +
  direction + editable length (writes the outgoing clip's `transitionOut`).
- Pilot `../video-toolkit/projects/pp-namesti-republiky/src/LayeredCampaignReel.tsx`
  (brand repo) — the handle-based at-cut render + `presentationFor(kind)`;
  remove `FadeIn`. Brand presentations reused from `@brand-lib` +
  `@remotion/transitions`. **No `Root.tsx` data change needed** (clips already
  butted; the one `dissolve:12` renders against the outro at the cut).

## Parity strategy

- Pilot has one `transitionOut: { kind: 'dissolve', frames: 12 }` on the clip
  before the outro. After the change, render and confirm:
  - a real cross-dissolve at the cut into the outro (both visible, blending
    using handle frames), not a fade-from-coal;
  - **total duration UNCHANGED** (`46301`ms — model B doesn't shorten);
  - audio across the cut intact; brand hides at content end as before.
- Second check: a throwaway derive exercising `glitch` / `wipe` / `whip-pan`
  (borrow pp-05 data) to confirm each presentation renders.

## Testing

- `layered-adapter.test.ts`: the derived `transitions` lane yields one
  centered-at-cut action per A→B pair whose A has a non-`cut` `transitionOut`
  (`start = cut − round((N/2)/fps*1000)`, `end = cut + …`, id `transition:A`); a
  `cut`/absent `transitionOut` yields none; the last item (outro) yields none
  after it, but a `dissolve` INTO the outro yields one (pilot's case).
- Composition: pure `presentationFor(kind)` mapping is unit-testable; a pure
  `transitionWindow(clip, next, fps)` helper (window frames + clamped handles)
  is unit-testable; the visual is covered by the parity render.
- Inspector: selecting a transition routes to the transition editor; changing
  kind/frames writes the outgoing clip's `transitionOut` (no reposition).
- `derive-layered` tests: unchanged and green (no derivation change).
- Full core suite + `tsc` green.

## Risks

- **Handle availability** — the real new risk. A clip trimmed to its source
  boundary has no handles; the render must clamp/freeze rather than show black.
  Mitigated by the `transitionWindow` clamp + the pilot parity render.
- Manually-driven presentations must receive the props/progress
  `TransitionSeries` gives them (`presentationDurationInFrames`, direction,
  progress) — verified against each kind in the parity check.
- Consecutive transitions (A→B→C) — B is `entering` on its head and `exiting`
  on its tail; the two windows are disjoint, so they compose; a triple-chain
  fixture guards it.

## Deferred (follow-up)

- Alignment (start/end-at-cut); drag-the-block-edge to set length;
  drag-two-clips-to-create-a-transition.
