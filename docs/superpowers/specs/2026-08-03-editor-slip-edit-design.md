# Slip edit in the reel editor timeline

**Date:** 2026-08-03
**Status:** design approved, not implemented
**Surface:** `lib/editor` (timeline adapter + gesture). No change to `lib/render`,
`lib/transitions`, `lib/theming`, or the schema.

## The problem

There is no way to move the media *inside* a clip while holding its position and
duration on the timeline. Every existing operation couples the two.

`resizeVideoItem` (`lib/editor/src/timeline/layered-adapter.ts:186-199`) enforces
one invariant — **`span == sourceOutMs − sourceInMs`** — and enforces it in both
directions:

- **Head trim** (`:194`) moves `startMs` and `sourceInMs` by the same amount, so
  trimming the head always drags the clip along the timeline.
- **Tail trim** (`:199`) derives `endMs` from the source window, so the clip's
  length is a consequence of the window rather than an independent quantity.
- **Move** (`:191`) leaves the source fields alone entirely.

Between them these cover *{shift window + shift timeline}* and *{shift timeline}*.
The missing one is *{shift window, hold position and length}* — slip.

The schema already permits it: `startMs`/`endMs` and `sourceInMs`/`sourceOutMs` are
independent fields on `clip` and `broll`
(`lib/reel-config-base/layered-schema.ts:95-96`). The render already honours it —
`SegmentMedia.tsx:264-275` passes `startFrom`/`endAt` into `OffthreadVideo`. Only the
editor's edit algebra cannot reach the state.

**Slip does not break the invariant.** Shifting both source fields by the same delta
preserves `span == window`. This is therefore a *fourth operation in the existing
algebra*, not a loosening of the model — which is what keeps it small.

## 1. The operation

A new pure function beside `resizeVideoItem` in `layered-adapter.ts`:

```ts
slipVideoItem(reel: LayeredReel, id: string, deltaMs: number): LayeredReel
```

**Semantics.** `sourceInMs += d`, `sourceOutMs += d`; `startMs` and `endMs` unchanged.

**Kinds.** `clip` and `broll` only. `photo`, `card` and `outro` have no source
window; `multi-clip` carries a window per sub-source
(`layered-schema.ts:97`) and would need its own decision about which one the gesture
slips. Out of scope — an addition later, not a rewrite.

**Bounds.** The delta is clamped to `[-sourceInMs, footageMs − sourceOutMs]`: nothing
before the file's start can be revealed on the left, nothing past its end on the
right. **When the decoded duration is unknown the right bound does not apply** —
matching `resizeBoundsMs` (`:159`), where `footageEndMs` stays `undefined` and
`maxEndMs` with it. One rule shared by both operations rather than two that can drift.

**Linked audio.** Every audio item whose `followsVideoId` matches the clip receives
the same delta on `sourceInMs`, and on `sourceOutMs` when present (it is optional —
`layered-schema.ts:110`). An unlinked bed is untouched.

**One clamp, over the intersection of the clip's headroom and every linked bed's,
applied to all of them.** (Evaluated on each call — "one" means a single shared
bound, not a value frozen at gesture start.) A bed has its own file and therefore its
own reserve. Clamping each party separately — clip 2 s of headroom, bed 0.5 s — would shift picture and sound by
different amounts and silently break the sync the link exists to guarantee. The
gesture instead stops at whichever party runs out of material first.

## 2. The gesture

**Capture.** `onPointerDownCapture` on the action body in the video lane
(`LayeredTimeline.tsx:582-650`). With Alt held on a `clip`/`broll`: `stopPropagation`,
`preventDefault`, `setPointerCapture` — xzdarcy never starts its own move, and the
drag survives the pointer leaving the block. Without Alt nothing changes.

**Delta.** `deltaMs = (dxPx / scaleWidth) * 1000`. `scaleWidth` is px per second, the
same conversion the snap threshold uses at `:663`, so slip follows the timeline zoom
for free.

**Direction.** Dragging right reveals **earlier** footage — `sourceInMs` decreases.
The mental model is grabbing the film inside the window and pulling it right, so what
preceded it slides into view. Premiere and Resolve both work this way. Recorded
explicitly because the inverted sign is the natural implementation mistake.

**Playhead.** On gesture start: if the playhead already sits inside the dragged clip,
**leave it** — the user picked that reference frame and moving it would remove the
very thing they are slipping against. Otherwise seek to the clip's start. The Player
then shows a live source frame throughout.

**Cursor.** `ew-resize` while Alt is held over a slippable clip, `grabbing` during the
drag.

**Status-line hint.** The cursor only rewards someone who already pressed Alt, so the
gesture also gets an entry in the legend at the foot of the timeline
(`LayeredTimeline.tsx:723-737`), in the established shape — highlighted key, em dash,
description — and using the same modifier notation as the existing `⌘/Ctrl + scroll`
row:

```
⌥/Alt + drag a clip — slip the shot inside its window
```

English, per the editor's UI-language rule.

**It goes second, right after Ripple, and the position is a decision.** The legend is
`whiteSpace: nowrap` with `overflow: hidden` (`:720-721`), so a fifth entry clips from
the right on a narrow window. Placing slip beside Ripple groups the two clip-drag
semantics and guarantees it survives; what gets clipped first is then
`⌫ delete · ⌘Z undo`, shortcuts a user already knows from everywhere else.

**Live clamping.** The delta is clamped on every `pointermove` (the intersection from
§1), so the media stops at the edge of its material instead of overshooting and
springing back — the behaviour resize already has via `minStart`/`maxEnd`
(`:679-694`).

**Deliberately not in v1:** beat snapping during slip (snapping a *source window* to a
musical grid is a different operation from snapping a cut) and Escape-to-cancel. Both
are additive later.

## 3. Feedback

**The waveform needs no code change.** `Waveform.tsx:31` slices peaks at
`startIdx = sourceInMs/1000 * PEAKS_PER_SEC`, and the block's width is constant during
a slip, so `count` (`:32`) holds. Once the reel updates, the waveform redraws a
different excerpt in a stationary frame — exactly the intended picture.

The anchoring machinery from `92607bd` ("waveform holds in place during a trim")
neither applies nor interferes: it is keyed to `pxPerSec` and a *changing block
width*, which slip does not produce. `Waveform.tsx` is not touched.

**Player.** The reel updates during the drag, so the Player re-renders. Together with
the playhead rule this gives live picture even on a clip with no audio.

**Edge grips — existing signal, new meaning.** `capsFor` (`:116-134`) already computes
the two conditions slip runs into (`sourceInMs <= 0` on the left, exhausted material
on the right) and renders them. Today they read "no more to trim"; during a slip they
read "nothing left to shift this way" with no change at all. Headroom is visible
before the user hits it.

**No numeric readout in v1.** The playhead supplies the picture, which is what slip is
judged by. A badge can be added independently if precision turns out to be missing.

**History.** `useHistory` coalesces edits within 450 ms into one undo step and names
handle-dragging as the motivating case (`useHistory.ts:5-8`), so committing live
during the drag yields a single undo entry. Known shared limitation: a pause longer
than 450 ms mid-gesture splits it in two, exactly as it does for today's trims. Not
worth dedicated machinery.

## 4. Testing

Test-first. The weight sits in the pure function, mirroring how `resizeVideoItem` is
covered today.

| Case | Why this one |
|---|---|
| Shifts `sourceIn`/`sourceOut` by the delta, leaves `startMs`/`endMs` | the definition |
| `span == sourceOut − sourceIn` still holds | the adapter invariant §1 rests on |
| Clamps left at `-sourceInMs` | nothing exists before the file's start |
| Clamps right when the length is known; **unbounded when it is not** | keeps the rule identical to `resizeBoundsMs` |
| A linked bed receives the same delta | the link decision |
| **A bed with less headroom limits the clip's delta** | the only rule holding sync |
| An unlinked bed is untouched | the converse |
| `photo`/`card`/`outro`/`multi-clip` are a no-op | the kind scope |

The sixth row carries the most risk and gets its own `it`, not a rider on the link
test: a sync break raises no exception and reddens no other test — it surfaces weeks
later in a render.

**The gesture cannot be tested through the rendered block, and an earlier draft of
this spec was wrong to promise it.** `LayeredTimeline.test.tsx:36-39` records why:
xzdarcy virtualises its rows, so with jsdom's zero measured height **no action block
ever mounts**. Verified rather than taken on trust — nothing in the editor's tests
touches `vt-grip`, `blockColor` on real DOM, or `getActionRender`. A `pointerdown` on
the clip body is unreachable there.

Coverage follows the pattern that file already uses — assert the pure helpers:

- `slipDeltaMs(dxPx, scaleWidth)` carries the px→ms conversion **and the sign**, which
  §2 names as the natural implementation mistake. Tested directly: a positive `dx`
  must produce a negative delta.
- `slipVideoItem` carries every decision worth defending (the table above).

**What stays unpinned, stated plainly:** the wiring itself — pointer capture, the
`stopPropagation` that keeps xzdarcy out, the cursor, the playhead seek. These are
verified by hand in the editor, not by a test. Do not claim otherwise in a report.

## Gates

Per the CLAUDE.md table, with a deliberate selection:

```bash
cd lib/editor && npx vitest run --no-file-parallelism
cd lib/editor && npx tsc --noEmit ; echo "exit=$?"
cd examples/layered-minimal && npm run typecheck
grep -riE 'lime|teal|roost|progresivn|sand-brown' lib/ --exclude-dir=node_modules --exclude='*.test.*'
grep -n 'it\.fails' lib/editor/src/at-cut-transitions.test.tsx
```

Editor-test baseline is 112 files / 1818 tests; the new count is **re-derived after
the change, never carried forward**. `tsc` holds at its 3 pre-existing errors, checked
by identity and by reading the exit code separately. Typecheck of
`examples/layered-minimal` stays at 0. Brand-leak grep stays at 2 hits; `it.fails`
stays at 0.

**The pixel harness is deliberately skipped.** Slip touches no transition kind and no
axis of the matrix, so 300 stills would spend 45 s measuring something that cannot have
moved. Recorded as a stated skip, which is what the gate economy expects — not an
omission.

**Python `sync_template`** is untouched by editor work and is not run.
