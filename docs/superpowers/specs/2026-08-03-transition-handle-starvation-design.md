# Transition handle starvation

**Date:** 2026-08-03
**Status:** design approved, not implemented
**Surface:** `lib/reel-config-base` (the shared predicate), `lib/editor` (prevention,
marking, diagnostics), `lib/render` (the pre-render check). No schema change.

## The problem

A transition borrows frames from its neighbours. When a neighbour has none to lend,
the render does not fail — it produces wrong pictures, silently.

`lib/render/video-track-layout.ts:87-91` computes, for every boundary:

```ts
const seqFrom     = itemStartF - inHalf;
const seqDuration = normalDuration + inHalf + outHalf;
```

and `lib/theming/segment/SegmentMedia.tsx:265` turns the borrow into a source offset:

```ts
startFrom = Math.max(0, sourceInF - inHalf)
```

**That `Math.max` is the defect.** When an item sits at its source start
(`sourceInMs = 0`, the common case for a broll cut straight from the head of a file),
there is nothing before the in-point to reveal, so the clamp quietly returns 0 — while
the Sequence still runs `seqDuration` frames, `inHalf` longer than the source can fill
from that offset. The deficit surfaces at the **end** of the clip, not where it was
caused: the last frames vanish. A user reading the timeline sees no reason for it.

**It is not specific to any transition kind.** The handle math never sees the kind —
every non-cut transition with `frames > 0` between two real items borrows the same way.
`gradient-wipe` was simply the first one encountered.

**There are two directions, and both must be handled.**

| Direction | Condition | Detectable from config alone? |
|---|---|---|
| In-handle | `sourceInMs < inHalfMs` | Yes — pure arithmetic |
| Out-handle | `sourceOutMs + outHalfMs > fileMs` | No — needs the file's duration |

An earlier draft of this design proposed covering only the first and saying so. That was
rejected, correctly: a half-covered invariant reads as a guarantee and is worse than
none. See §4 for how the second direction is covered without caching durations.

## 1. The constraint model

One pure function computes what a boundary's neighbours can actually lend:

```ts
handleRoomFrames(item: VideoItem, fileMs: number | undefined, fps: number):
  { head: number; tail: number }
```

- `head` = `sourceInMs` in frames — what exists before the in-point.
- `tail` = `fileMs − sourceOutMs` in frames — what exists after the out-point.
- `photo` and `card` have no source window and lend nothing; they are unconstrained.
- **An unknown `fileMs` leaves `tail` unbounded**, matching `resizeBoundsMs`
  (`lib/editor/src/timeline/layered-adapter.ts:159`). One rule, not two that can drift.

A boundary between A and B needs `A.tail ≥ after` and `B.head ≥ before`, where
`before`/`after` come from the existing `transitionHandles(frames, alignment)`
(`lib/reel-config-base/transition-schema.ts:119-126`). The maximum feasible transition
length therefore depends on alignment:

| Alignment | Max frames |
|---|---|
| `center` | `min(A.tail, B.head) × 2` |
| `start` | `A.tail` (B lends nothing) |
| `end` | `B.head` (A lends nothing) |

**Where this is computed is the architectural decision.** The renderer must not derive
it and then act on it: that would create a second place where a transition's length is
decided, and Studio could disagree with the final render — the class of defect Phase 5
existed to remove. The editor decides and **writes the resolved `frames` and `alignment`
into the model**; the renderer renders what is authored, and only *validates* (§4).

## 2. What the editor does by itself

Modelled on NLE convention, which does not move clip content to make a transition fit —
it treats available handles as a hard bound on the transition and marks what it cannot
satisfy.

**Layer 1 — prevention at authoring time.** The inspector's `frames` field takes its
upper bound from `handleRoomFrames` for the current alignment, computed live. Same shape
as the existing resize clamp via `minStart`/`maxEnd`: the control stops at the boundary
instead of letting the user overshoot and silently snapping back.

**Layer 2 — automatic realignment, only when it costs nothing.** If a transition lands
at a clip edge where `center` will not fit, the editor switches `alignment` to the side
that has material — **but only when this preserves `frames` exactly**. This is the only
automatic change permitted: neither clip's content moves and the transition keeps its
authored length; only its position relative to the cut changes. Premiere behaves the
same way when a transition is dropped at a clip's start.

**Layer 3 — everything else is marked, never silently changed.** Shortening the
transition and slipping the clip both alter what the user authored, so the editor
proposes them and the user decides.

**Layer 3 exists because boundaries break retroactively.** A healthy boundary becomes
starved when its *neighbour* moves — a trim, a slip, a reorder — at which moment the
user is not touching the transition at all, so Layer 1 cannot help. Hand-edited
`Root.tsx` files and configs from earlier `/toolkit:cut` runs never passed through
Layer 1 either.

**Layer 1 bounds new input; it never rewrites a stored value.** These are different
operations and conflating them would make the design contradict itself. When the user
types or drags a length, the control stops at the feasible maximum — nothing is stored
that cannot be honoured. When a boundary is starved *retroactively*, its authored
`frames` **stays exactly as authored** and the boundary is marked instead.

The consequence, stated rather than hidden: **until the user applies a remedy, that
boundary still renders wrong.** The editor does not quietly shorten the transition to
rescue it, because shortening is not free and §2's whole premise is that non-free
choices are the user's. What changes versus today is that the damage is now visible in
three places — the hatched block, the diagnostics badge, the render warning — instead of
being discovered in the finished MP4.

### When no material exists at all

The kind is always selectable. What must never happen is *authoring* a borrow of frames
that do not exist, so the control's maximum — per Layer 1, a bound on new input — is
**zero** when both sides are exhausted. The user can pick the kind and gets a transition
of length zero: marked, and behaving as a hard cut.

That is a large improvement on today, where the same case renders and produces a
composition missing the end of a clip. After this change the worst outcome is **an
honest hard cut plus a visible mark**, and the editor and the render agree, because
`frames: 0` means "cut" in both.

Zero is the end of the *free* options, not of all of them. The editor offers three
remedies with their costs stated:

| Remedy | What it costs |
|---|---|
| Slip the window | a different shot in the frame — only if the file has material elsewhere |
| Shorten the clip to make room | visible duration of the shot |
| Shorten or drop the transition | the transition itself |

The middle one is what Final Cut does when it offers to trim clips to create a
transition. It is often the only one available: when the file is not longer than
`span + before + after`, **no slip can help** — the material does not exist. "Cannot be
done gracefully" means "cannot be done for free", and choosing what to give up is an
editorial decision, not a technical one. The editor must not make it.

## 3. How the editor shows it

**In the transitions lane.** The lane already exists and is display-only
(`lib/editor/app/LayeredTimeline.tsx:595`, `LOCKED_LANES`). A transition block carries
one of four states: ok, realigned, clamped, impossible.

**The visual vocabulary already exists.** `.vt-grip-muted`
(`lib/editor/app/LayeredTimeline.tsx:154`) is a 45° `repeating-linear-gradient` and
today means "nothing more to take this way" — semantically the same fact. A hatched
transition block therefore reads consistently with the grips the user already knows, and
it is also the diagonal hatch Premiere uses for insufficient media. An impossible
boundary (`frames: 0`) collapses to a thin mark at the cut, since a zero-length
transition occupies nothing.

Colours stay **neutral** — grey and hatching, no accent. Core is brand-neutral and
signalling errors through an accent colour would pull brand vocabulary into `lib/`.

**Tooltips carry the diagnosis, not just the fact:** not "insufficient media" but which
side is starved and by how much — *"Needs 15 frames before the cut, this clip has 4."*
Without that the user knows something is wrong but not which clip to touch.

**Remedies live in the inspector.** With the boundary selected, `frames` shows its
maximum and the three remedies appear as actions with their cost quantified (*"Slip the
clip by 11 frames"*, *"Shorten this clip by 11 frames"*). A remedy that cannot work in
the current case is **disabled with its reason, not hidden** — a vanished option is
harder to diagnose than a disabled one.

### Diagnostics are their own surface

The editor has nowhere to show a message today. It gets one:

```ts
type Diagnostic = {
  severity: 'error' | 'warning';
  message: string;    // "Needs 15 frames before the cut, this clip has 4"
  targetId?: string;  // action id — clicking selects that boundary
};
```

A **badge in the header** beside the project name (`2 issues`) expands into the list. Not
a permanently open panel: on a healthy project it is empty, and it should not cost
timeline height for nothing. The badge disappears when there is nothing to report.

Clicking an entry **selects the boundary and scrolls it into view**. This is what
separates usable diagnostics from a longer log: on a reel with thirty cuts a mark
outside the viewport is invisible, and the list is the index into them. The hatching and
the list are two readings of one state, not alternatives.

The type is deliberately generic, but **no check registry is built**. One producer today
— the boundary check. A second (a missing source, a `sourceOutMs` past the file) writes
into the same list without new infrastructure.

## 4. Covering both directions

The out-handle direction needs the file's duration, which the renderer does not have.
Two ways to give it one were rejected:

- **Caching the duration in the schema** adds a drift surface. This repo's own stance,
  encoded in `capMsById`: ffprobe is the truth and a config's `sourceOutMs` may be drift.
  Measuring beats remembering.
- **A separate lint step** would cover both directions but only when someone runs it,
  and would not run in Studio.

**The check goes in `calculateMetadata`.** Every composition already routes through it
(`lib/render/layered-composition-props.ts:63`), it is shared core rather than per-brand
since Phase 2, it may be async, and it runs in Studio and in `remotion render` by the
same path — so preview and final output cannot reach different conclusions. It measures
each distinct source once and validates every boundary in both directions. No schema
change, no second decision point: validation only.

**One predicate, two consumers.** The state is computed by a single pure function —

```ts
boundaryState(a, b, transition, roomA, roomB):
  'ok' | 'realigned' | 'clamped' | 'impossible'
```

— read by `calculateMetadata` and by the editor from the durations it has already
decoded (`useSourceDurations`). It takes the room as parameters and does not care who
measured it. **This is the one thing that must not be implemented twice**: two copies
would reproduce exactly the Studio/render divergence Phase 5 removed.

**Behaviour on a finding: warn in both environments; the render completes.** Nothing
throws. The editor additionally surfaces it through the badge and the lane marking, so
the console stops being the only line of defence. The honest cost: a warning in a render
log is easy to miss — which is what happens today — and only the editor's badge makes it
unmissable.

### Unverified — prove it with a command, do not assume

`@remotion/media-utils` is **not currently a dependency**, and it must be confirmed that
measurement works in the CLI render and not only in a browser: `getVideoMetadata` builds
on a `<video>` element, while `@remotion/media-parser` also runs in Node. Which one fits
Remotion 4.0.425 in both contexts is to be established by running it, and the async cost
measured, not estimated. This repo has twice paid for capability claims written down
without the command that demonstrates them.

**Async `calculateMetadata` is not free:** the composition opens only after measurement.
On a reel with twenty sources that is a perceptible delay in Studio. Caching by URL
mitigates it; it does not make it zero.

## 5. Testing

The weight sits in the pure functions — and, as with slip, the visual layer cannot be
tested through the DOM: jsdom mounts no xzdarcy action block
(`lib/editor/app/LayeredTimeline.test.tsx:36-39`). The mark is therefore pinned through
`boundaryState`, not through rendered output.

| Case | Why |
|---|---|
| Both sides have room → `ok` | the baseline |
| Starved head | the reported defect |
| Starved tail | the direction the first draft would have missed |
| Both sides starved → `impossible` | the zero-room case §2 rests on |
| Unknown file duration → must NOT report starvation | prevents a false alarm before decode resolves |
| `photo` / `card` neighbours → always ok | they lend nothing |
| `center` allows twice `start`/`end` | the alignment table in §1 |
| Realignment preserves `frames` or is not applied | Layer 2's whole condition |

**Verify, do not assume, that `frames: 0` is a hard cut end to end** — schema,
`resolveTransition`, render. This is the single assumption the whole construction rests
on that has not been confirmed against code. If some layer reads zero as "default
length", it fails in the quietest possible place.

## Gates

The usual editor set (`vitest`, `tsc --noEmit` compared by identity with the exit code
read separately, `examples/layered-minimal` typecheck, brand-leak grep, `it.fails`
guard), plus one this feature earns: **the pixel harness runs**, because the work touches
`SegmentMedia.tsx`. No cell should move — a warning changes no pixels — which is exactly
why it is cheap insurance, and any movement is a finding rather than noise.
