# Timeline-ms vs source-ms: one conversion, one invariant

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every timeline edit honour a clip's playback speed, so trim handles stop refusing footage that exists and stop silently resetting a clip's speed to 1×.

**Architecture:** A video item carries two spans — `startMs`/`endMs` (timeline) and `sourceInMs`/`sourceOutMs` (source) — whose ratio *is* the playback speed (`lib/reel-config-base/speed.ts`). The adapter treats both as plain `number` and adds one to the other in five places. That was safe only while the two were always in lockstep. One new module owns the conversion in both directions; every site delegates to it; one invariant (`deriveSpeed` is unchanged by a trim, a split or a slip) is asserted per operation so a sixth site cannot reintroduce the bug quietly.

**Tech Stack:** TypeScript, React 18, vitest + @testing-library/react, Zod 3.22.3 (exact pin). No new dependencies.

## Why this exists (read before task 1)

Measured against the real code on 2026-08-04. A broll slowed to 0.5× — 4 s of source stretched over 8 s of timeline, file holds 10 s:

- `resizeBoundsMs` returns `maxEndMs: 10000`. The true limit is **20000** (10 s of source at 0.5× is 20 s of timeline). The right handle hard-stops half way through footage that exists. *Confirmed by a throwaway probe test against the shipped code.*
- `resizeVideoItem`'s right branch recomputes `endMs = startMs + (sourceOutMs - sourceInMs)` — the length the clip would have **at 1×**. Drag that clip's right edge outward by 1 s and it does not grow: it *shrinks* from 8000 to 5000 ms and its speed snaps to 1.0.
- That is the reported symptom. First grab fights you (bound is wrong); you release, the commit rewrites the spans toward 1×; the second grab computes a different bound from the changed state and behaves. It reads as random. It is convergence.
- `splitItem` cuts at `sourceInMs + leftDur` where `leftDur` is a **timeline** length, so splitting a slowed clip corrupts both halves' speed.
- `handleRoomFrames` (`lib/reel-config-base/handle-room.ts:35-42`) reports `sourceInMs`/`fileMs - sourceOutMs` as **timeline** frames a transition may borrow. Same conflation, in the transition-starvation path.

`setItemSpeed` (`layered-adapter.ts:399-440`) is the one place that already converts correctly (`timelineMs * clamped`, `sourceSpan / clamped`). **Use it as the reference for conversion direction; do not change it.**

## Global Constraints

- Every new formula must reduce to the current one at speed 1. **Existing tests must pass UNMODIFIED.** If a test needs editing to go green, stop — the generalisation is wrong, not the test. The one deliberate behaviour change in this plan is Task 0, which changes which items *count* as 1×; Tasks 1-7 change no output at 1×.
- Audio beds are never time-stretched (settled in the clip-speed work): `resizeAudioItem` (`layered-adapter.ts:455-465`) and the linked-bed split (`:846`) are 1:1 **on purpose**. Do not add speed conversion to any audio path.
- English UI strings. `ed:` prefix at the FRONT of the whole Tailwind class.
- No new npm dependency, for any reason.
- Do not change the meaning of `startMs`/`endMs`/`sourceInMs`/`sourceOutMs`, and do not add a schema field. Speed stays derived.
- Never add a `Co-Authored-By` trailer. If signing fails, immediately retry with `--no-gpg-sign` — signing is never a blocker here.
- Round to whole ms where a value is stored on an item (`Math.round`), so a repeated edit cannot accumulate sub-ms drift into a visible speed change.

## Verification (every task)

- `cd lib/editor && npx vitest run --no-file-parallelism` — unfiltered. Baseline at the start of this plan: **135 files / 2288 tests, 2282 passed / 6 skipped / 0 failed.** Re-derive from your own tree; account for every delta.
- `cd lib/editor && npx tsc --noEmit ; echo "exit=$?"` — the SAME 3 pre-existing errors by IDENTITY (`LayeredInspector.tsx` `hide`, `derive-layered.test.ts`, `../theming/envelope.test.ts` missing vitest types), exit 2, no fourth. Read the exit code separately; `| grep -c` prints 0 when tsc crashes.
- Pixel harness: **skip, with that reason stated** — it renders transitions only and no task here changes a transition's picture.
- No new `ed:` classes are expected. If you add one, run `npm run editor:css` and COMMIT the regenerated file — `src/editor-css.test.ts` byte-compares it.

## Signatures this plan did NOT verify

Written from a read of `layered-adapter.ts` and `speed.ts`, which were read in
full, and from greps elsewhere. These three were **not** opened, so the shapes
sketched for them are a best guess — read the real file first and let it win over
this plan, adjusting the test *calls* but never the assertions' arithmetic:

- `handleRoomFrames`' parameter order and return shape (Task 5).
- `slipVideoItem`'s options object (Tasks 6, 7).
- Whether `layered-adapter.test.ts` already has a single-item reel helper, and
  what it is called (Tasks 3, 4 assume `reelWith`).

If any of them differs enough that a task's approach no longer fits, stop and
report rather than reshaping the fix around a guess.

## File Structure

| File | Responsibility |
|---|---|
| `lib/reel-config-base/speed.ts` | Owns the ratio, and the threshold below which a span difference is not a speed at all (Task 0). |
| `lib/reel-config-base/clip-time.ts` *(new)* | The only place that converts between a clip's timeline ms and its source ms, plus the four derived quantities callers actually want. |
| `lib/reel-config-base/clip-time.test.ts` *(new)* | Unit tests for the above, at 1×, 0.5× and 2×. |
| `lib/editor/src/timeline/layered-adapter.ts` | `resizeBoundsMs`, `resizeVideoItem`, `splitItem`, `slipVideoItem` delegate to `clip-time`. |
| `lib/reel-config-base/handle-room.ts` | `handleRoomFrames` reports room in TIMELINE frames. |
| `lib/editor/src/timeline/speed-invariant.test.ts` *(new)* | The cross-operation invariant: trim, split and slip preserve `deriveSpeed`. |

---

### Task 0: a sub-frame span difference is not a speed

**Files:**
- Modify: `lib/reel-config-base/speed.ts`
- Test: `lib/reel-config-base/speed.test.ts`

**Interfaces:**
- Produces: `SPEED_SNAP_MS` (number) exported from `lib/reel-config-base/speed.ts`; `deriveSpeed` keeps its signature `(item: { startMs; endMs; sourceInMs; sourceOutMs }) => number`.

**This task must come FIRST.** Every later task's arithmetic runs through
`deriveSpeed`, so changing what it returns afterwards would re-open every case
they pin.

**Why (measured on a real project, 2026-08-04).** `pp-u-kamenne-vily` in the
progpce brand repo has 8 video items. **Six of them derive a speed that is not
1**: seg-002 0.99870, seg-003 1.00136, seg-004 0.99779, seg-005 1.00386,
seg-006 0.99831, seg-008 1.00116. Nobody set a speed on any of them. The two
spans differ by 7-13 ms — rounding residue from a cut-tune pass that adjusted
the timeline span and the source span by slightly different amounts.

At 30 fps a frame is 33.3 ms, so 7-13 ms is **under half a frame**: a difference
the output cannot represent. What it *can* do is be treated as intent:

- `hasSpeedChanges` returns `true` for all six, so the editor's Speed section
  opens pre-expanded with a dirty marker, telling the author they set a speed
  they never set. **Verified against the shipped function, not assumed.**
- `SegmentMedia` passes a `playbackRate` of 0.9987 to `OffthreadVideo`.
- Every trim, split and slip on those items runs the conflated arithmetic the
  rest of this plan fixes, shifting `endMs` by those 7-13 ms against a
  neighbour.

Note what this is NOT: the playback error is imperceptible. The divergence
between picture-time and bed-time inside a clip reaches at most the span
difference itself (7-13 ms) and the picture lands exactly on its intended
out-point at the clip's end, so nothing carries into the next clip. 13 ms is
well under the ~45 ms lip-sync threshold. **Do not justify this task, in code
comments or the commit message, as fixing visible drift — it is not. It stops
rounding noise from being read as authorial intent by the editing maths and the
inspector.**

- [ ] **Step 1: Write the failing test**

Append to `lib/reel-config-base/speed.test.ts`:

```ts
import { SPEED_SNAP_MS } from './speed';

describe('a sub-frame span difference reads as exactly 1x', () => {
  // The six real items from pp-u-kamenne-vily, by name — these are the cases
  // this rule exists for.
  const REAL_CASES = [
    ['seg-002', 5200, 10567, 0, 5360],
    ['seg-003', 10567, 15700, 0, 5140],
    ['seg-004', 15700, 18867, 0, 3160],
    ['seg-005', 18867, 22234, 0, 3380],
    ['seg-006', 22234, 28134, 900, 6790],
    ['seg-008', 32134, 38167, 4860, 10900],
  ] as const;

  it.each(REAL_CASES)('%s is 1x, not rounding noise', (_id, startMs, endMs, sourceInMs, sourceOutMs) => {
    expect(deriveSpeed({ startMs, endMs, sourceInMs, sourceOutMs })).toBe(1);
  });

  it.each(REAL_CASES)('%s therefore reports no speed change to the inspector', (_id, startMs, endMs, sourceInMs, sourceOutMs) => {
    expect(hasSpeedChanges({ kind: 'broll', startMs, endMs, sourceInMs, sourceOutMs })).toBe(false);
  });

  it('snaps a difference just inside the threshold', () => {
    const d = SPEED_SNAP_MS - 1;
    expect(deriveSpeed({ startMs: 0, endMs: 5000, sourceInMs: 0, sourceOutMs: 5000 + d })).toBe(1);
  });

  it('does NOT snap a difference just outside it', () => {
    const d = SPEED_SNAP_MS + 1;
    expect(deriveSpeed({ startMs: 0, endMs: 5000, sourceInMs: 0, sourceOutMs: 5000 + d })).not.toBe(1);
  });

  it('leaves a deliberate slow-down completely alone', () => {
    // 0.5x over 8s is a 4000ms difference — three orders of magnitude past the
    // threshold. A snap that ever touched this would be a bug, not a rounding fix.
    expect(deriveSpeed({ startMs: 0, endMs: 8000, sourceInMs: 0, sourceOutMs: 4000 })).toBe(0.5);
  });

  it('leaves a deliberate speed-up alone', () => {
    expect(deriveSpeed({ startMs: 0, endMs: 4000, sourceInMs: 0, sourceOutMs: 8000 })).toBe(2);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd lib/editor && npx vitest run ../reel-config-base/speed.test.ts`
Expected: FAIL — `SPEED_SNAP_MS` is not exported, and once you add it the six
real cases return 0.99870 etc. rather than 1.

- [ ] **Step 3: Implement**

Add to `lib/reel-config-base/speed.ts`:

```ts
/** How far the two spans may disagree and still mean "the same length".
 *
 *  Half a frame at the toolkit's canonical 30 fps (see docs/video-timing.md —
 *  every video here runs at 30fps). A difference smaller than this cannot be
 *  represented in the output at all: it is under one frame, so no frame of the
 *  render is different for it.
 *
 *  It exists because ordinary editing produces such differences constantly.
 *  A real case: six of the eight items in pp-u-kamenne-vily ended a cut-tune
 *  pass with spans 7-13 ms apart, and every one of them therefore derived a
 *  speed of 0.998-1.004. Nobody had set a speed on any of them. Faithfully
 *  reporting that ratio meant the inspector showed a speed change that no
 *  author made, and the editing maths treated the noise as a real ratio.
 *
 *  Deliberately absolute rather than proportional: a proportional tolerance
 *  scales with clip length, so the same 1% would be a third of a frame on a
 *  short clip and ten frames on a 30-second one. What matters is whether the
 *  difference is representable, and that is measured in frames. */
export const SPEED_SNAP_MS = 1000 / 30 / 2;
```

and, in `deriveSpeed`, before clamping:

```ts
export function deriveSpeed(item: { startMs: number; endMs: number; sourceInMs: number; sourceOutMs: number }): number {
  const timelineMs = item.endMs - item.startMs;
  if (timelineMs <= 0) return SPEED_DEFAULTS.speed;
  const sourceMs = item.sourceOutMs - item.sourceInMs;
  // A sub-frame disagreement is the same length, not a speed. See SPEED_SNAP_MS.
  if (Math.abs(sourceMs - timelineMs) < SPEED_SNAP_MS) return SPEED_DEFAULTS.speed;
  return clampSpeed(sourceMs / timelineMs);
}
```

Update `deriveSpeed`'s existing doc comment to say the ratio is snapped to 1
below `SPEED_SNAP_MS`, and why. Do not touch `clampSpeed` or `hasSpeedChanges`
— `hasSpeedChanges` reads `deriveSpeed`, so it inherits this for free, which is
what the second test block above pins.

- [ ] **Step 4: Run it and watch it pass**

Run: `cd lib/editor && npx vitest run ../reel-config-base/speed.test.ts`
Expected: PASS, including the 16 pre-existing cases **unmodified**. If a
pre-existing case goes red, read it before touching it: a fixture built with
spans a few ms apart and asserting a non-1 speed was asserting the bug.

- [ ] **Step 5: Full suite + typecheck**

Both commands from Verification. Watch for movement outside `speed.test.ts` —
`SegmentMedia` stops emitting `playbackRate` for a near-1 item, so
`segment-media-merge-baseline.test.tsx` is the one to watch. It **must pass
unmodified**; its fixtures have spans in lockstep, so their difference is
exactly 0 and the snap changes nothing for them.

- [ ] **Step 6: Commit**

```bash
git add lib/reel-config-base/speed.ts lib/reel-config-base/speed.test.ts
git commit -m "fix(reel-config): a sub-frame span difference is not a playback speed"
```

---

### Task 1: `clip-time.ts` — the one conversion

**Files:**
- Create: `lib/reel-config-base/clip-time.ts`
- Test: `lib/reel-config-base/clip-time.test.ts`

**Interfaces:**
- Consumes: `deriveSpeed` from `./speed`.
- Produces, all exported from `lib/reel-config-base/clip-time.ts`:
  - `type ClipSpans = { startMs: number; endMs: number; sourceInMs: number; sourceOutMs: number }`
  - `sourceToTimelineMs(item: ClipSpans, sourceMs: number): number`
  - `timelineToSourceMs(item: ClipSpans, timelineMs: number): number`
  - `headroomTimelineMs(item: ClipSpans): number`
  - `tailroomTimelineMs(item: ClipSpans, footageMs: number | undefined): number`
  - `sourceAtTimelineMs(item: ClipSpans, atMs: number): number`

- [ ] **Step 1: Write the failing test**

`lib/reel-config-base/clip-time.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  sourceToTimelineMs,
  timelineToSourceMs,
  headroomTimelineMs,
  tailroomTimelineMs,
  sourceAtTimelineMs,
} from './clip-time';

// 4s of source over 8s of timeline = 0.5x. The file holds 10s.
const slow = { startMs: 1000, endMs: 9000, sourceInMs: 2000, sourceOutMs: 6000 };
// 8s of source over 4s of timeline = 2x.
const fast = { startMs: 0, endMs: 4000, sourceInMs: 0, sourceOutMs: 8000 };
// The case every existing caller is written for.
const plain = { startMs: 0, endMs: 5000, sourceInMs: 1000, sourceOutMs: 6000 };

describe('the two directions are inverses', () => {
  it('a slowed clip stretches source into timeline', () => {
    expect(sourceToTimelineMs(slow, 1000)).toBe(2000);
    expect(timelineToSourceMs(slow, 2000)).toBe(1000);
  });

  it('a sped-up clip compresses timeline into source', () => {
    expect(sourceToTimelineMs(fast, 2000)).toBe(1000);
    expect(timelineToSourceMs(fast, 1000)).toBe(2000);
  });

  it('is the identity at 1x — which is why every existing formula still holds', () => {
    expect(sourceToTimelineMs(plain, 1234)).toBe(1234);
    expect(timelineToSourceMs(plain, 1234)).toBe(1234);
  });
});

describe('headroomTimelineMs — how far the LEFT edge may travel left', () => {
  it('is the source head, expressed in timeline ms', () => {
    // 2000ms of source before the in-point, at 0.5x, is 4000ms of timeline.
    expect(headroomTimelineMs(slow)).toBe(4000);
    expect(headroomTimelineMs(plain)).toBe(1000);
  });

  it('is zero at the source start, so the left edge is pinned', () => {
    expect(headroomTimelineMs({ ...slow, sourceInMs: 0 })).toBe(0);
  });
});

describe('tailroomTimelineMs — how far the RIGHT edge may travel right', () => {
  it('is the unused source tail, expressed in timeline ms', () => {
    // File 10000, out-point 6000 => 4000ms of source left; at 0.5x that is 8000.
    expect(tailroomTimelineMs(slow, 10000)).toBe(8000);
  });

  it('is Infinity when the footage length is unknown — an estimate must not clamp', () => {
    // Matches footageCapsById's contract: absent means "do not clamp", never zero.
    expect(tailroomTimelineMs(slow, undefined)).toBe(Infinity);
    expect(tailroomTimelineMs(slow, 0)).toBe(Infinity);
  });

  it('never reports negative room for an out-point authored past the file', () => {
    // Real case in these projects: file 10042ms, authored out 10300ms.
    expect(tailroomTimelineMs({ ...plain, sourceOutMs: 10300 }, 10042)).toBe(0);
  });
});

describe('sourceAtTimelineMs — the split point', () => {
  it('maps an absolute timeline position to the source frame showing there', () => {
    // 4000ms into a 0.5x clip that starts at 1000 => 2000ms of source consumed,
    // landing at sourceInMs 2000 + 2000 = 4000.
    expect(sourceAtTimelineMs(slow, 5000)).toBe(4000);
  });

  it('is the plain sum at 1x', () => {
    expect(sourceAtTimelineMs(plain, 2000)).toBe(3000);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd lib/editor && npx vitest run ../reel-config-base/clip-time.test.ts`
Expected: FAIL — `Failed to resolve import "./clip-time"`.

- [ ] **Step 3: Write the module**

`lib/reel-config-base/clip-time.ts`:

```ts
// The ONE place a clip's two time domains are converted between.
//
// A video item carries a TIMELINE span (`startMs`/`endMs` — where it sits in the
// reel) and a SOURCE span (`sourceInMs`/`sourceOutMs` — what it plays from the
// file). Their ratio is the playback speed; see ./speed.ts. Both are plain
// numbers of milliseconds, which is exactly why they were added to each other in
// five different places: while every trim moved the two in lockstep the ratio
// was always 1 and the conflation was invisible.
//
// It stopped being invisible when speed became reachable. On a broll slowed to
// 0.5x the right trim handle stopped half way through the footage, and the
// commit rewrote `endMs` to the length the clip would have had at 1x — so
// dragging the edge outward made the clip SHORTER and reset its speed. Each
// retry converged it further toward 1x, which is why it read as flakiness.
//
// Callers should reach for the four derived quantities below rather than the two
// raw conversions: "how far may this edge travel" and "what source frame shows
// at this timeline position" are the questions the adapter actually asks, and
// naming them is what leaves no arithmetic to get wrong.
import { deriveSpeed } from './speed';

/** The four fields this module reads. Structural on purpose — every caller has
 *  a full `VideoItem`, but nothing here needs `kind`, `id` or the transitions,
 *  and a narrow parameter keeps the unit tests free of item fixtures. */
export type ClipSpans = {
  startMs: number;
  endMs: number;
  sourceInMs: number;
  sourceOutMs: number;
};

/** Source milliseconds → the timeline milliseconds they occupy. A slowed clip
 *  (speed < 1) stretches: less source fills more timeline. */
export function sourceToTimelineMs(item: ClipSpans, sourceMs: number): number {
  return sourceMs / deriveSpeed(item);
}

/** Timeline milliseconds → the source milliseconds they consume. */
export function timelineToSourceMs(item: ClipSpans, timelineMs: number): number {
  return timelineMs * deriveSpeed(item);
}

/** How far the LEFT edge may travel left before running out of source, in
 *  timeline ms. Never negative. */
export function headroomTimelineMs(item: ClipSpans): number {
  return sourceToTimelineMs(item, Math.max(0, item.sourceInMs));
}

/** How far the RIGHT edge may travel right before running out of source, in
 *  timeline ms.
 *
 *  `Infinity` when the footage length is unknown — the same contract
 *  `footageCapsById` and `slipVideoItem` already keep, and for the same reason:
 *  an unmeasured source must not clamp anything, because the only number
 *  available to guess with is the item's own out-point, which is where the
 *  out-point happens to sit and not how long the file is. An estimate must not
 *  masquerade as a limit.
 *
 *  Clamped at 0 rather than going negative for an out-point authored PAST the
 *  file (a real shape in these projects: file 10.042 s, authored 10.3 s). */
export function tailroomTimelineMs(item: ClipSpans, footageMs: number | undefined): number {
  if (!footageMs || footageMs <= 0) return Infinity;
  return sourceToTimelineMs(item, Math.max(0, footageMs - item.sourceOutMs));
}

/** The source position showing at an ABSOLUTE timeline position — the split
 *  point. `atMs` is in reel coordinates, not relative to the clip. */
export function sourceAtTimelineMs(item: ClipSpans, atMs: number): number {
  return item.sourceInMs + timelineToSourceMs(item, atMs - item.startMs);
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd lib/editor && npx vitest run ../reel-config-base/clip-time.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Full suite + typecheck**

Run both commands from the Verification section. Nothing else imports `clip-time` yet, so the suite must be the baseline **+11 tests / +1 file** exactly.

- [ ] **Step 6: Commit**

```bash
git add lib/reel-config-base/clip-time.ts lib/reel-config-base/clip-time.test.ts
git commit -m "feat(reel-config): one module for the clip timeline-ms/source-ms conversion"
```

---

### Task 2: the live resize clamp stops at real footage

**Files:**
- Modify: `lib/editor/src/timeline/layered-adapter.ts:168-175` (`resizeBoundsMs`)
- Test: `lib/editor/src/timeline/layered-adapter.test.ts`

**Interfaces:**
- Consumes: `headroomTimelineMs`, `tailroomTimelineMs` from Task 1.
- Produces: `resizeBoundsMs` keeps its exact signature — `(item: VideoItem, decodedMs: number | undefined) => { minStartMs: number; maxEndMs?: number } | null`. `maxEndMs` stays `undefined` (not `Infinity`) when unbounded, because `LayeredTimeline.tsx:1329` forwards `undefined` to mean "no clamp".

- [ ] **Step 1: Write the failing test**

Append to `lib/editor/src/timeline/layered-adapter.test.ts`, inside a new `describe`:

```ts
describe('resizeBoundsMs honours playback speed', () => {
  // 4s of source over 8s of timeline = 0.5x; the file holds 10s.
  const slowed = {
    id: 'v1', kind: 'broll', startMs: 0, endMs: 8000, sourceInMs: 0, sourceOutMs: 4000,
  } as unknown as VideoItem;

  it('lets a slowed clip reach ALL of its footage, not half of it', () => {
    // 10s of source at 0.5x is 20s of timeline. Stopping at 10000 refuses
    // footage the file really has — the reported "won't let me drag further".
    expect(resizeBoundsMs(slowed, 10000)).toEqual({ minStartMs: 0, maxEndMs: 20000 });
  });

  it('scales the left bound by speed too', () => {
    const trimmed = { ...slowed, startMs: 4000, endMs: 12000, sourceInMs: 2000 } as VideoItem;
    // 2000ms of source head at 0.5x = 4000ms of timeline: 4000 - 4000 = 0.
    expect(resizeBoundsMs(trimmed, 10000)!.minStartMs).toBe(0);
  });

  it('leaves a 1x clip’s bounds exactly where they were', () => {
    const plain = { ...slowed, endMs: 4000 } as VideoItem; // spans in lockstep
    expect(resizeBoundsMs(plain, 10000)).toEqual({ minStartMs: 0, maxEndMs: 10000 });
  });

  it('still reports no right bound at all when the footage length is unknown', () => {
    expect(resizeBoundsMs(slowed, undefined)!.maxEndMs).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd lib/editor && npx vitest run src/timeline/layered-adapter.test.ts -t 'honours playback speed'`
Expected: FAIL — the first case gets `maxEndMs: 10000`, expected `20000`.

- [ ] **Step 3: Implement**

Replace the body of `resizeBoundsMs` (keep the whole comment block above it, and add the new paragraph shown):

```ts
// BOTH bounds are the FOOTAGE, and only the footage, expressed in TIMELINE ms —
// which is not the same number as the source ms they come from unless the clip
// runs at 1x. See ./../../../reel-config-base/clip-time.ts.
export function resizeBoundsMs(
  item: VideoItem,
  decodedMs: number | undefined,
): { minStartMs: number; maxEndMs?: number } | null {
  if (item.kind !== 'clip' && item.kind !== 'broll') return null;
  const tail = tailroomTimelineMs(item, decodedMs);
  return {
    minStartMs: item.startMs - headroomTimelineMs(item),
    // `undefined`, not Infinity: LayeredTimeline forwards undefined as "no clamp".
    maxEndMs: Number.isFinite(tail) ? Math.round(item.endMs + tail) : undefined,
  };
}
```

Add to the import block at the top of the file:

```ts
import { headroomTimelineMs, tailroomTimelineMs } from '../../../reel-config-base/clip-time';
```

> **Note the change of anchor:** the old right bound was `startMs + (file - sourceIn)`, anchored at the clip's START. The new one is `endMs + tailroom`, anchored at its current END. At 1× with spans in lockstep these are the same number; the end-anchored form is the one that stays correct when the spans differ, because tailroom is defined against `sourceOutMs`. The "1x clip's bounds" case above pins that they agree.

- [ ] **Step 4: Run it and watch it pass**

Run: `cd lib/editor && npx vitest run src/timeline/layered-adapter.test.ts`
Expected: PASS — the new block plus every pre-existing `resizeBoundsMs` case, unmodified.

- [ ] **Step 5: Full suite + typecheck**

Both commands from Verification. Expect baseline +4 tests over Task 1's count.

- [ ] **Step 6: Commit**

```bash
git add lib/editor/src/timeline/layered-adapter.ts lib/editor/src/timeline/layered-adapter.test.ts
git commit -m "fix(editor): the live trim clamp stops at real footage, not the 1x position"
```

---

### Task 3: a trim preserves the clip's speed

**Files:**
- Modify: `lib/editor/src/timeline/layered-adapter.ts:275-289` (`resizeVideoItem`)
- Test: `lib/editor/src/timeline/layered-adapter.test.ts`

**Interfaces:**
- Consumes: `headroomTimelineMs`, `tailroomTimelineMs`, `timelineToSourceMs`, `sourceToTimelineMs` from Task 1; `MIN_CLIP_MS` already in this file.
- Produces: `resizeVideoItem` keeps its private signature `(item: VideoItem, np: { startMs: number; endMs: number }, footageMs?: number) => VideoItem`.

**This is the task that fixes the reported symptom.** The right branch currently rewrites `endMs` to the 1× length, which is what makes a slowed clip shrink when its right edge is dragged outward, and what resets its speed.

- [ ] **Step 1: Write the failing test**

```ts
describe('a trim preserves playback speed', () => {
  const FOOTAGE = 10000;
  // 4s of source over 8s of timeline = 0.5x.
  const slowed = {
    id: 'v1', kind: 'broll', startMs: 0, endMs: 8000, sourceInMs: 0, sourceOutMs: 4000,
  } as unknown as VideoItem;

  const trimRight = (item: VideoItem, endMs: number) =>
    resizeItem(reelWith(item), 'video:v1', { startMs: item.startMs, endMs }, { footageMsById: { v1: FOOTAGE } })
      .tracks.video[0];

  it('grows the clip when the right edge is dragged outward', () => {
    // The bug: this returned endMs 5000 — SHORTER than the 8000 it started at.
    const after = trimRight(slowed, 10000);
    expect(after.endMs).toBe(10000);
  });

  it('consumes source in proportion to speed, not 1:1', () => {
    // +2000ms of timeline at 0.5x costs 1000ms of source.
    const after = trimRight(slowed, 10000);
    expect(after.sourceOutMs).toBe(5000);
  });

  it('leaves the speed exactly where the author set it', () => {
    expect(deriveSpeed(trimRight(slowed, 10000))).toBe(0.5);
  });

  it('stops at the end of the footage, in timeline ms', () => {
    // All 10s of source at 0.5x = 20s of timeline; asking for more gets 20000.
    const after = trimRight(slowed, 30000);
    expect(after.sourceOutMs).toBe(FOOTAGE);
    expect(after.endMs).toBe(20000);
    expect(deriveSpeed(after)).toBe(0.5);
  });

  it('preserves speed on a LEFT trim too', () => {
    const start = { ...slowed, startMs: 8000, endMs: 16000, sourceInMs: 2000, sourceOutMs: 6000 } as VideoItem;
    const after = resizeItem(reelWith(start), 'video:v1', { startMs: 4000, endMs: 16000 }, { footageMsById: { v1: FOOTAGE } })
      .tracks.video[0];
    expect(after.startMs).toBe(4000);
    // 4000ms of timeline at 0.5x costs 2000ms of source: in-point reaches 0.
    expect(after.sourceInMs).toBe(0);
    expect(deriveSpeed(after)).toBe(0.5);
  });
});
```

> `reelWith(item)` is a helper this test file already uses to wrap a single video item in a minimal `LayeredReel`. If it is named differently in the file you find, use the existing one rather than adding a second — and if none exists, add one at the top of your new `describe` and say so in your report.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd lib/editor && npx vitest run src/timeline/layered-adapter.test.ts -t 'preserves playback speed'`
Expected: FAIL — first case gets `endMs: 5000`, expected `10000`.

- [ ] **Step 3: Implement**

Replace the two edge branches of `resizeVideoItem`:

```ts
  // Both branches work in TIMELINE ms and convert once, so the clip's speed
  // (the ratio of its two spans) comes out of a trim exactly as it went in.
  // At 1x every line below reduces to the plain sums this used to do.
  if (dStart !== 0) {
    const applied = Math.min(
      // Can't reveal source that isn't there: the head, in timeline ms.
      Math.max(dStart, -headroomTimelineMs(item)),
      // Keep at least MIN_CLIP_MS of TIMELINE length.
      item.endMs - item.startMs - MIN_CLIP_MS,
    );
    return {
      ...item,
      startMs: Math.round(item.startMs + applied),
      sourceInMs: Math.round(item.sourceInMs + timelineToSourceMs(item, applied)),
    };
  }
  // The right edge, clamped in timeline ms against the footage tail, then
  // converted ONCE into the source out-point it implies.
  const room = tailroomTimelineMs(item, footageMs);
  const appliedEnd = Math.max(
    Math.min(dEnd, room),
    // Never shorter than MIN_CLIP_MS of timeline.
    MIN_CLIP_MS - (item.endMs - item.startMs),
  );
  const endMs = Math.round(item.endMs + appliedEnd);
  return {
    ...item,
    endMs,
    sourceOutMs: Math.round(item.sourceInMs + timelineToSourceMs(item, endMs - item.startMs)),
  };
```

Two things to keep in mind while doing this:

- `timelineToSourceMs(item, …)` reads `item`'s speed, so it must be called on the **pre-edit** item (as written above). Computing it from the half-updated object would feed the new span back into the ratio.
- The old right branch derived `endMs` FROM `sourceOutMs`; the new one derives `sourceOutMs` FROM `endMs`. That inversion is the fix — the edge the user dragged is now the input, and the source window follows it.

- [ ] **Step 4: Run it and watch it pass**

Run: `cd lib/editor && npx vitest run src/timeline/layered-adapter.test.ts`
Expected: PASS — including every pre-existing trim, overwrite and ripple case, unmodified. Overwrite (`layered-adapter.ts:225-245`) calls `resizeVideoItem` for the neighbour it trims back, so those cases exercise this code too; if any of them go red, the generalisation is wrong.

- [ ] **Step 5: Full suite + typecheck**

Both commands from Verification.

- [ ] **Step 6: Commit**

```bash
git add lib/editor/src/timeline/layered-adapter.ts lib/editor/src/timeline/layered-adapter.test.ts
git commit -m "fix(editor): a trim no longer resets a slowed clip to 1x"
```

---

### Task 4: splitting a slowed clip keeps both halves' speed

**Files:**
- Modify: `lib/editor/src/timeline/layered-adapter.ts:834` (the `cut` in `splitItem`)
- Test: `lib/editor/src/timeline/layered-adapter.test.ts`

**Interfaces:** Consumes `sourceAtTimelineMs` from Task 1. `splitItem`'s signature is unchanged.

- [ ] **Step 1: Write the failing test**

```ts
describe('splitItem keeps speed on both halves', () => {
  // 4s of source over 8s of timeline = 0.5x, at 30fps.
  const slowed = {
    id: 'v1', kind: 'broll', startMs: 0, endMs: 8000, sourceInMs: 0, sourceOutMs: 4000,
  } as unknown as VideoItem;

  it('cuts the SOURCE at the frame actually showing at the playhead', () => {
    // Playhead at 4000ms of timeline = half way = 2000ms of source, not 4000.
    const { reel } = splitItem(reelWith(slowed), 'video:v1', 120, 30); // frame 120 @30fps = 4000ms
    const [left, right] = reel.tracks.video;
    expect(left.endMs).toBe(4000);
    expect(left.sourceOutMs).toBe(2000);
    expect(right.sourceInMs).toBe(2000);
  });

  it('leaves both halves at the parent’s speed', () => {
    const { reel } = splitItem(reelWith(slowed), 'video:v1', 120, 30);
    const [left, right] = reel.tracks.video;
    expect(deriveSpeed(left)).toBe(0.5);
    expect(deriveSpeed(right)).toBe(0.5);
  });

  it('is the plain sum at 1x', () => {
    const plain = { ...slowed, endMs: 4000 } as VideoItem; // spans in lockstep
    const { reel } = splitItem(reelWith(plain), 'video:v1', 60, 30); // 2000ms
    expect(reel.tracks.video[0].sourceOutMs).toBe(2000);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd lib/editor && npx vitest run src/timeline/layered-adapter.test.ts -t 'splitItem keeps speed'`
Expected: FAIL — `left.sourceOutMs` is 4000, expected 2000.

- [ ] **Step 3: Implement**

In `splitItem`, replace:

```ts
  const leftDur = atMs - v.startMs;
  const rightId = uniqueId(`${v.id}-b`, reel.tracks.video.map((x) => x.id));
  const cut = v.sourceInMs + leftDur;
```

with:

```ts
  const rightId = uniqueId(`${v.id}-b`, reel.tracks.video.map((x) => x.id));
  // The SOURCE frame showing at the playhead — `atMs - startMs` is a timeline
  // length, and on a clip whose speed isn't 1x that is not the same number of
  // source ms. Splitting on the raw difference gave both halves a speed the
  // author never set.
  const cut = Math.round(sourceAtTimelineMs(v, atMs));
```

`leftDur` was used only for `cut`; confirm with a grep that no later line in `splitItem` still reads it, and delete it if not (the linked-bed branch at `:846` computes its own `atMs - a.startMs`, which is a **bed** and stays 1:1 — do not touch it).

Add `sourceAtTimelineMs` to the `clip-time` import added in Task 2.

- [ ] **Step 4: Run it and watch it pass**

Run: `cd lib/editor && npx vitest run src/timeline/layered-adapter.test.ts`
Expected: PASS, existing split cases unmodified.

- [ ] **Step 5: Full suite + typecheck**, then commit:

```bash
git add lib/editor/src/timeline/layered-adapter.ts lib/editor/src/timeline/layered-adapter.test.ts
git commit -m "fix(editor): split cuts the source frame under the playhead, whatever the speed"
```

---

### Task 5: a transition borrows real timeline frames

**Files:**
- Modify: `lib/reel-config-base/handle-room.ts:30-43`
- Test: `lib/reel-config-base/handle-room.test.ts`

**Interfaces:** Consumes `headroomTimelineMs`, `tailroomTimelineMs` from Task 1. `handleRoomFrames` keeps its signature and its `{ head, tail }` shape, both in TIMELINE frames.

**Read `handle-room.ts` in full before editing.** Its `head`/`tail` are consumed as the number of frames a transition may borrow from a neighbour — a timeline quantity — but are computed from source ms. The `Math.max(0, …)` on the tail and the `Infinity` for unknown footage are both load-bearing; `tailroomTimelineMs` already keeps both, so route through it rather than re-deriving.

- [ ] **Step 1: Write the failing test**

Append to `lib/reel-config-base/handle-room.test.ts`:

```ts
describe('handleRoomFrames reports TIMELINE frames, not source frames', () => {
  // 0.5x: 4s of source over 8s of timeline, 2s of source head, at 30fps.
  const slowed = {
    id: 'v1', kind: 'broll', startMs: 0, endMs: 8000, sourceInMs: 2000, sourceOutMs: 6000,
  } as unknown as VideoItem;

  it('stretches a slowed clip’s head into the frames it can really lend', () => {
    // 2000ms of source head at 0.5x = 4000ms of timeline = 120 frames @30fps.
    expect(handleRoomFrames(slowed, 10000, 30).head).toBe(120);
  });

  it('stretches its tail the same way', () => {
    // File 10000 - out 6000 = 4000ms of source; at 0.5x = 8000ms = 240 frames.
    expect(handleRoomFrames(slowed, 10000, 30).tail).toBe(240);
  });

  it('is unchanged at 1x', () => {
    const plain = { ...slowed, endMs: 4000 } as VideoItem;
    expect(handleRoomFrames(plain, 10000, 30)).toEqual({ head: 60, tail: 120 });
  });

  it('still reports an infinite tail when the file length is unknown', () => {
    expect(handleRoomFrames(slowed, undefined, 30).tail).toBe(Infinity);
  });
});
```

> Check the real `handleRoomFrames` parameter order and name before finalising these calls — the signature in the file wins over the shape sketched here. Adjust the calls, never the assertions' arithmetic.

- [ ] **Step 2: Run it and watch it fail.** Run: `cd lib/editor && npx vitest run ../reel-config-base/handle-room.test.ts`. Expected: FAIL — head 60 (source frames) where 120 is right.

- [ ] **Step 3: Implement** — replace the `head`/`tail` expressions with `toFrames(headroomTimelineMs(item))` and, for the tail, `toFrames(tailroomTimelineMs(item, fileMs))` guarded so an `Infinity` room still yields `Infinity` frames rather than `NaN`. Keep every existing comment; add one line saying these are timeline frames and why that differs from the source ms they derive from.

- [ ] **Step 4: Run it and watch it pass**, then the full suite + typecheck. The starvation diagnostics (`boundaryDiagnostics`) read this, so watch for movement in the diagnostics tests — a 1× reel must produce identical diagnostics.

- [ ] **Step 5: Commit**

```bash
git add lib/reel-config-base/handle-room.ts lib/reel-config-base/handle-room.test.ts
git commit -m "fix(reel-config): handle room is timeline frames, so speed no longer skews it"
```

---

### Task 6: the invariant, stated once, over every operation

**Files:**
- Create: `lib/editor/src/timeline/speed-invariant.test.ts`

**Interfaces:** Consumes `resizeItem`, `splitItem`, `slipVideoItem` from `./layered-adapter` and `deriveSpeed` from `../../../reel-config-base/speed`.

This is the task that makes the fix hold. Tasks 2-5 each fix a site; this one asserts the property those fixes share, as a table over operations, so a sixth site added later fails a test that already exists.

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect } from 'vitest';
import { resizeItem, splitItem, slipVideoItem } from './layered-adapter';
import { deriveSpeed } from '../../../reel-config-base/speed';
import type { LayeredReel, VideoItem } from '../../../reel-config-base/layered-schema';

const FOOTAGE = 20000;
const at = (speed: number): VideoItem =>
  ({
    id: 'v1', kind: 'broll',
    startMs: 4000, endMs: 12000,
    sourceInMs: 2000, sourceOutMs: 2000 + 8000 * speed,
  }) as unknown as VideoItem;

const reelWith = (v: VideoItem): LayeredReel =>
  ({
    version: 'layered-1',
    meta: { topic: 't', totalDurationMs: 30000 },
    tracks: { video: [v], audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [] },
  }) as unknown as LayeredReel;

const opts = { footageMsById: { v1: FOOTAGE } };

// Every operation that edits a clip's edges or its source window, and what it
// does. NONE of them may change the clip's speed: the author set that, and no
// trim, split or slip is a speed edit. `setItemSpeed` is the ONLY operation
// allowed to change it, which is why it is deliberately absent from this table.
const OPERATIONS: Array<{ name: string; apply: (v: VideoItem) => VideoItem[] }> = [
  {
    name: 'trim the right edge outward',
    apply: (v) => resizeItem(reelWith(v), 'video:v1', { startMs: v.startMs, endMs: v.endMs + 3000 }, opts).tracks.video,
  },
  {
    name: 'trim the right edge inward',
    apply: (v) => resizeItem(reelWith(v), 'video:v1', { startMs: v.startMs, endMs: v.endMs - 3000 }, opts).tracks.video,
  },
  {
    name: 'trim the left edge outward',
    apply: (v) => resizeItem(reelWith(v), 'video:v1', { startMs: v.startMs - 1000, endMs: v.endMs }, opts).tracks.video,
  },
  {
    name: 'trim the left edge inward',
    apply: (v) => resizeItem(reelWith(v), 'video:v1', { startMs: v.startMs + 1000, endMs: v.endMs }, opts).tracks.video,
  },
  {
    name: 'trim past the end of the footage',
    apply: (v) => resizeItem(reelWith(v), 'video:v1', { startMs: v.startMs, endMs: v.endMs + 999999 }, opts).tracks.video,
  },
  {
    name: 'split at the midpoint',
    apply: (v) => splitItem(reelWith(v), 'video:v1', Math.round((8000 / 1000) * 30 / 2) + (4000 / 1000) * 30, 30).reel.tracks.video,
  },
  {
    name: 'slip the media forward',
    apply: (v) => slipVideoItem(reelWith(v), 'v1', 500, { footageMsById: { v1: FOOTAGE } }).tracks.video,
  },
  {
    name: 'slip the media backward',
    apply: (v) => slipVideoItem(reelWith(v), 'v1', -500, { footageMsById: { v1: FOOTAGE } }).tracks.video,
  },
];

describe.each([0.5, 1, 2])('at %sx speed', (speed) => {
  it.each(OPERATIONS.map((o) => [o.name, o] as const))('%s preserves the speed', (_name, op) => {
    const before = at(speed);
    for (const after of op.apply(before)) {
      expect(deriveSpeed(after)).toBeCloseTo(speed, 5);
    }
  });
});

describe('the operations actually did something', () => {
  // Guards the table above against passing vacuously: an operation that returned
  // its input unchanged would preserve speed trivially and prove nothing.
  it.each(OPERATIONS.map((o) => [o.name, o] as const))('%s changes the item', (_name, op) => {
    const before = at(0.5);
    const after = op.apply(before);
    const changed = after.some(
      (x) =>
        x.startMs !== before.startMs ||
        x.endMs !== before.endMs ||
        x.sourceInMs !== before.sourceInMs ||
        x.sourceOutMs !== before.sourceOutMs,
    );
    expect(changed).toBe(true);
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd lib/editor && npx vitest run src/timeline/speed-invariant.test.ts`

Expected: PASS at every speed, for every operation, **and** every "actually did something" case green.

**If a slip case fails the speed invariant, stop and report rather than fixing.** A slip shifts both source fields by one delta and leaves the timeline alone, so the span — and therefore the speed — cannot change by construction. A failure there means the delta is being clamped asymmetrically between the two fields, which is a different defect from the one this plan addresses and needs its own diagnosis.

**If an "actually did something" case fails,** that operation's fixture does not exercise it (e.g. the split frame lands outside the clip). Fix the fixture so the operation really runs; do not delete the case.

- [ ] **Step 3: Verify the invariant would have CAUGHT the original bug**

Temporarily revert Task 3's right-edge branch to the shipped formula
(`endMs: item.startMs + (sourceOutMs - item.sourceInMs)`), run this file, and
confirm the 0.5× and 2× "trim the right edge outward" cases go red. Restore the
fix. **Record the observed failure in your report** — a guard nobody has watched
fail is not known to guard anything.

- [ ] **Step 4: Full suite + typecheck**, then commit:

```bash
git add lib/editor/src/timeline/speed-invariant.test.ts
git commit -m "test(editor): trim, split and slip must all preserve a clip's speed"
```

---

### Task 7: the slip gesture tracks the pointer

**Files:**
- Modify: `lib/editor/app/LayeredTimeline.tsx:231-233` (`slipDeltaMs`) and its call site in `beginSlip`/`moveSlip`
- Test: `lib/editor/app/timeline-util.test.ts` or the existing home of `slipDeltaMs`'s tests — find it with `grep -rn slipDeltaMs lib/editor --include='*.test.*'`

`slipDeltaMs(dxPx, scaleWidth)` converts pointer travel to a **source** shift using the timeline's px-per-second. On a clip whose speed isn't 1×, dragging 100 px moves the media by a different amount than the 100 px of timeline under the pointer, so the picture slides at the wrong rate relative to the cursor. Speed is preserved either way (Task 6 proves it), so this is a *feel* defect, not a correctness one — it is last for that reason.

- [ ] **Step 1: Write the failing test**

```ts
describe('slipDeltaMs follows the pointer at any speed', () => {
  it('is unchanged at 1x', () => {
    expect(slipDeltaMs(80, 80, 1)).toBe(-1000);
  });

  it('shifts HALF as much source on a 0.5x clip, so the picture tracks the cursor', () => {
    // 80px at 80px/s is 1s of TIMELINE; at 0.5x that is 500ms of source.
    expect(slipDeltaMs(80, 80, 0.5)).toBe(-500);
  });

  it('shifts twice as much on a 2x clip', () => {
    expect(slipDeltaMs(80, 80, 2)).toBe(-2000);
  });

  it('still normalises -0 to +0', () => {
    expect(slipDeltaMs(0, 80, 0.5)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail** — the third argument does not exist yet.

- [ ] **Step 3: Implement** — add a third parameter `speed: number` (defaulting to `1`, so the existing two-argument tests keep passing unmodified) and multiply the result by it. At the call site in `LayeredTimeline.tsx`, pass `deriveSpeed(item)` for the item being slipped; the slip gesture already looks that item up for `isSlippable`, so reuse that lookup rather than finding it twice.

- [ ] **Step 4: Run it and watch it pass**, then the full suite + typecheck.

- [ ] **Step 5: Commit**

```bash
git add lib/editor/app/LayeredTimeline.tsx lib/editor/app/timeline-util.test.ts
git commit -m "fix(editor): a slip moves the media with the pointer, whatever the clip's speed"
```

---

### Task 8: verify in a real browser, and write down what changed

**Files:**
- Modify: `lib/reel-config-base/speed.ts` (a pointer to `clip-time.ts` in the header comment)
- Modify: `docs/superpowers/plans/2026-08-04-timeline-vs-source-ms.md` (tick the boxes)

jsdom cannot reach the resize gesture — `lib/editor/host/README.md`'s "Verification boundary" says so, and every bound in Tasks 2-3 is delivered through a live interact.js drag. The unit tests prove the maths; only a browser proves the handle.

- [ ] **Step 1: Point the brand repo at your branch**

```bash
cd /Users/xaralis/Workspace/progpce/video-toolkit
git -C toolkit fetch origin && git -C toolkit checkout <your-branch-sha>
```

Do **not** commit that submodule move — it is for testing. Note the pin you started from so you can put it back.

- [ ] **Step 2: Run the editor on a real project**

```bash
cd /Users/xaralis/Workspace/progpce/video-toolkit/projects/pp-program-bydleni && npx vite --config .editor/vite.config.mts --port 3106
```

- [ ] **Step 3: Check each of these by hand, on a broll clip**

1. Set its speed to 50% in the inspector's Speed section.
2. Drag the right handle outward — it must **grow**, smoothly, and must not stop until the footage really runs out. Before this plan it shrank on the first drag.
3. Check the inspector still reads 50% afterwards. Before this plan it read 100%.
4. Drag the left handle outward, then check the speed again.
5. Grab the same handle twice in a row and confirm the second grab behaves like the first — the "retry and it works" asymmetry must be gone.
6. Put the playhead inside the clip and split it (`S`); both halves must still read 50%.
7. Alt+drag to slip; the picture should follow the cursor rather than sliding at half or double rate.

**Discard every change** (the Discard button) — this is somebody's real project.

- [ ] **Step 4: Put the submodule pin back**

```bash
cd /Users/xaralis/Workspace/progpce/video-toolkit
git -C toolkit checkout <the-pin-you-noted>
git status --short   # must show no staged submodule move
```

- [ ] **Step 5: Cross-reference the two modules**

Add to `speed.ts`'s header comment, after the formula: a line saying that
`./clip-time.ts` owns the conversion between the two domains and that any code
adding a timeline ms to a source ms belongs there. One or two sentences.

- [ ] **Step 6: Commit**

```bash
git add lib/reel-config-base/speed.ts docs/superpowers/plans/2026-08-04-timeline-vs-source-ms.md
git commit -m "docs(reel-config): point speed.ts at the clip-time conversion"
```

**Report, for the controller:** which of the seven browser checks passed, verbatim, and anything that still felt wrong. This is the only evidence that the handle itself is fixed.
