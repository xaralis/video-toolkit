# Handle Starvation — Detection and Reporting (Plan A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every transition whose neighbours cannot lend it frames visible — in the editor and in the render log — instead of silently producing a composition with missing frames.

**Architecture:** One pure predicate in `lib/reel-config-base` computes what each side can lend and what state a boundary is in. Two consumers read it: `calculateMetadata` (which measures the sources and warns, in Studio and CLI alike) and the editor (which already decodes durations, and marks the lane plus a new diagnostics badge). Nothing rewrites authored values; nothing throws.

**Tech Stack:** TypeScript, Zod, React, vitest, Remotion 4.0.425, `@remotion/media-utils`.

**Spec:** `docs/superpowers/specs/2026-08-03-transition-handle-starvation-design.md`

**Scope split.** This plan delivers *detection and honest reporting*, plus the cheap half of prevention (an upper bound on the length field). **Plan B**, written separately, adds the fixes: automatic realignment and the three inspector remedies (slip, shorten the clip, disable the transition). Plan A stands alone — after it, no starved boundary is invisible.

## Global Constraints

- **HARD RULE — one layered model.** Everything reads and writes `LayeredReel`. The renderer renders what is authored; it validates but never derives a transition's length.
- **One predicate, two consumers.** `boundaryState` is implemented ONCE and read by both `calculateMetadata` and the editor. Two copies would reproduce the Studio/render divergence Phase 5 removed. This is the plan's single most important constraint.
- **Nothing is rewritten and nothing throws.** A starved boundary is reported, never silently corrected. The render completes.
- **`frames: 0` is impossible** — `TransitionFrames` is `z.number().min(1).max(60)` (`lib/reel-config-base/transition-schema.ts:52`). The "no room at all" state is `impossible`, and the remedy that yields a clean cut is `enabled: false` (Plan B applies it; Plan A only reports).
- **Editor UI strings are English.**
- **Core is brand-neutral:** diagnostics use grey and hatching, never an accent colour.
- **An unknown file duration means UNBOUNDED tail, never starvation** — matches `resizeBoundsMs` (`lib/editor/src/timeline/layered-adapter.ts:159`). A false alarm before decode resolves would train users to ignore the badge.
- Commit messages: imperative mood, no `Co-Authored-By`. If signing fails, re-run with `--no-gpg-sign` — never a blocker.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `lib/reel-config-base/handle-room.ts` | The shared predicate: room per item, max frames per alignment, boundary state | **Create** |
| `lib/reel-config-base/handle-room.test.ts` | Its tests | **Create** |
| `lib/render/layered-composition-props.ts` | Measures sources in `calculateMetadata`, warns per starved boundary | Modify |
| `lib/editor/app/LayeredTimeline.tsx` | Hatches a starved transition block; feeds diagnostics up | Modify |
| `lib/editor/app/Diagnostics.tsx` | The badge + expandable list | **Create** |
| `lib/editor/app/EditorShell.tsx` | Hosts the badge in the header | Modify |
| `lib/editor/app/LayeredInspector.tsx:584` | Upper bound on the length field | Modify |
| `examples/layered-minimal/package.json` | Adds `@remotion/media-utils` | Modify |

`handle-room.ts` is a new file rather than an addition to `transition-schema.ts` (already 700+ lines) because it has one clear responsibility and both the editor and the renderer import it.

---

### Task 1: Prove media measurement works in a CLI render

The whole design rests on `calculateMetadata` being able to measure a source **during `remotion render`**, not only in Studio. `getVideoMetadata` builds on a `<video>` element; `calculateMetadata` is evaluated in headless Chrome during a CLI render, so it should work — but this repo has twice paid for capability claims written down without the command that demonstrates them. Prove it before anything is built on it.

**Files:**
- Modify: `examples/layered-minimal/package.json`
- Create (temporary, deleted in Step 5): `examples/layered-minimal/src/ProbeRoot.tsx`

**Interfaces:**
- Produces: a verified answer recorded in the task report — either "`@remotion/media-utils@4.0.425`'s `getVideoMetadata` resolves in CLI render" or "it does not; `@remotion/media-parser@4.0.425` does". Task 3 imports whichever won.

- [ ] **Step 1: Add the dependency**

```bash
cd examples/layered-minimal && npm install --save-exact @remotion/media-utils@4.0.425
```

Both `@remotion/media-utils@4.0.425` and `@remotion/media-parser@4.0.425` are published (verified with `npm view`). The exact pin matters: this repo is strict about Remotion version locks — see `docs/zod-version.md` for what a silent version mismatch costs here.

- [ ] **Step 2: Write a probe composition**

Create `examples/layered-minimal/src/ProbeRoot.tsx`. It measures a real asset in `calculateMetadata` and encodes the result in the composition's duration, so the render itself proves the measurement:

```tsx
import { Composition, staticFile, AbsoluteFill } from 'remotion';
import { getVideoMetadata } from '@remotion/media-utils';

const Probe: React.FC<{ durationMs: number }> = ({ durationMs }) => (
  <AbsoluteFill style={{ background: '#000', color: '#fff', fontSize: 60 }}>
    {Math.round(durationMs)}
  </AbsoluteFill>
);

export const ProbeRoot: React.FC = () => (
  <Composition
    id="Probe"
    component={Probe}
    fps={30}
    width={640}
    height={360}
    durationInFrames={30}
    defaultProps={{ durationMs: 0 }}
    calculateMetadata={async () => {
      const meta = await getVideoMetadata(staticFile('SOURCE_FILE'));
      // eslint-disable-next-line no-console
      console.log('[probe] measured durationInSeconds =', meta.durationInSeconds);
      return { durationInFrames: 30, props: { durationMs: meta.durationInSeconds * 1000 } };
    }}
  />
);
```

Replace `SOURCE_FILE` with a real video under `examples/layered-minimal/public/`. List that directory first and use an actual filename — if there is no video there, copy one in for the probe and delete it in Step 5.

Register `ProbeRoot` in `examples/layered-minimal/src/index.ts` alongside the existing root.

- [ ] **Step 3: Run the render**

```bash
cd examples/layered-minimal && npx remotion still src/index.ts Probe out/probe.png --frame=0
```

Expected on success: the command exits 0, `[probe] measured durationInSeconds = <a positive number>` appears in the output, and `out/probe.png` shows that number rather than `0`.

**Read the exit code, and do not pipe this through `tee`** — a pipe reports the pipe's status, which has already burned a real session in this repo (see the CLI note in `CLAUDE.md`).

- [ ] **Step 4: If it fails, try the fallback**

Only if Step 3 fails. Install `@remotion/media-parser@4.0.425`, replace the probe's import and call with:

```tsx
import { parseMedia } from '@remotion/media-parser';
const { slowDurationInSeconds } = await parseMedia({
  src: staticFile('SOURCE_FILE'),
  fields: { slowDurationInSeconds: true },
});
```

and re-run Step 3. Record in the report which one worked, with the actual output of the run — not a summary of it.

- [ ] **Step 5: Remove the probe, keep the dependency**

Delete `ProbeRoot.tsx`, its registration in `index.ts`, `out/probe.png`, and any video copied in for the probe. Keep the winning dependency in `package.json`.

- [ ] **Step 6: Commit**

```bash
git add examples/layered-minimal/package.json examples/layered-minimal/package-lock.json
git commit --no-gpg-sign -m "build(example): add the media package that measures sources in calculateMetadata"
```

---

### Task 2: The shared predicate

**Files:**
- Create: `lib/reel-config-base/handle-room.ts`
- Test: `lib/reel-config-base/handle-room.test.ts`

**Interfaces:**
- Consumes: `VideoItem` from `./layered-schema`; `transitionHandles`, `transitionAlignmentOf`, `isCut` from `./transition-schema`; `isNodeEnabled` from `./node-enabled`.
- Produces — Tasks 3, 4 and 6 all import these:
  ```ts
  export interface HandleRoom { head: number; tail: number }
  export function handleRoomFrames(item: VideoItem, fileMs: number | undefined, fps: number): HandleRoom
  export function maxTransitionFrames(room: HandleRoom | undefined, other: HandleRoom | undefined, alignment: TransitionAlignment): number
  export type BoundaryState = 'ok' | 'clamped' | 'impossible'
  export function boundaryState(transition: unknown, left: HandleRoom | undefined, right: HandleRoom | undefined): BoundaryState
  export function starvationMessage(transition: unknown, left: HandleRoom | undefined, right: HandleRoom | undefined): string | null
  ```

**Note on the state set:** the spec's §3 lists four lane states including `realigned`. That is an *outcome of an action* (Plan B's automatic realignment), not a property of the data — after a realignment the boundary is simply `ok`. `BoundaryState` therefore has three members. Update the spec's §3 sentence as part of this task's commit.

- [ ] **Step 1: Write the failing tests**

Create `lib/reel-config-base/handle-room.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { VideoItem } from './layered-schema';
import { handleRoomFrames, maxTransitionFrames, boundaryState, starvationMessage } from './handle-room';

const FPS = 30;
// A clip showing [1000,4000] of a 10s file: 30 frames of head, 180 of tail.
const clip: VideoItem = { id: 'v1', kind: 'clip', startMs: 0, endMs: 3000, source: 'a.mp4', sourceInMs: 1000, sourceOutMs: 4000 };
// Cut from the very start of its file: no head at all.
const atStart: VideoItem = { ...clip, id: 'v2', sourceInMs: 0, sourceOutMs: 3000 };
const photo: VideoItem = { id: 'p1', kind: 'photo', startMs: 0, endMs: 3000, source: 'a.jpg' };

describe('handleRoomFrames', () => {
  it('measures head from sourceInMs and tail from what follows sourceOutMs', () => {
    expect(handleRoomFrames(clip, 10000, FPS)).toEqual({ head: 30, tail: 180 });
  });

  it('reports no head for a clip cut from the start of its file', () => {
    expect(handleRoomFrames(atStart, 10000, FPS)).toEqual({ head: 0, tail: 210 });
  });

  // A false alarm before decode resolves would train users to ignore the badge.
  it('leaves the tail unbounded when the file duration is unknown', () => {
    expect(handleRoomFrames(clip, undefined, FPS).tail).toBe(Infinity);
  });

  it('treats a photo as unconstrained — it has no source window to lend from', () => {
    expect(handleRoomFrames(photo, undefined, FPS)).toEqual({ head: Infinity, tail: Infinity });
  });
});

describe('maxTransitionFrames', () => {
  const left = { head: 999, tail: 10 };
  const right = { head: 4, tail: 999 };

  it('center is twice the scarcer side, since each lends half', () => {
    expect(maxTransitionFrames(left, right, 'center')).toBe(8);
  });

  it('start takes everything from the left clip, so the right lends nothing', () => {
    expect(maxTransitionFrames(left, right, 'start')).toBe(10);
  });

  it('end takes everything from the right clip', () => {
    expect(maxTransitionFrames(left, right, 'end')).toBe(4);
  });

  it('an absent neighbour (reel edge) does not constrain', () => {
    expect(maxTransitionFrames(left, undefined, 'center')).toBe(20);
  });
});

describe('boundaryState', () => {
  const roomy = { head: 999, tail: 999 };
  const t = (frames: number, alignment = 'center') => ({ kind: 'gradient-wipe', frames, alignment });

  it('is ok when both sides can lend what the transition asks for', () => {
    expect(boundaryState(t(20), roomy, roomy)).toBe('ok');
  });

  it('is ok for a cut regardless of room', () => {
    expect(boundaryState({ kind: 'cut' }, { head: 0, tail: 0 }, { head: 0, tail: 0 })).toBe('ok');
  });

  // A disabled transition lends nothing — transition-record.ts:62-67 makes the
  // boundary behave exactly as a hard cut, so it cannot starve.
  it('is ok for a disabled transition even with no room at all', () => {
    expect(boundaryState({ ...t(20), enabled: false }, { head: 0, tail: 0 }, { head: 0, tail: 0 })).toBe('ok');
  });

  it('is clamped when a shorter transition would fit', () => {
    expect(boundaryState(t(20), roomy, { head: 4, tail: 999 })).toBe('clamped');
  });

  it('is impossible when no alignment and no length can work', () => {
    expect(boundaryState(t(20), { head: 999, tail: 0 }, { head: 0, tail: 999 })).toBe('impossible');
  });

  it('does not report starvation while a duration is still unknown', () => {
    expect(boundaryState(t(20), undefined, undefined)).toBe('ok');
  });
});

describe('starvationMessage', () => {
  it('names the starved side and both numbers, not just "insufficient media"', () => {
    expect(starvationMessage({ kind: 'gradient-wipe', frames: 20, alignment: 'center' }, { head: 999, tail: 999 }, { head: 4, tail: 999 }))
      .toBe('Needs 10 frames before the cut, this clip has 4');
  });

  it('is null for a healthy boundary', () => {
    expect(starvationMessage({ kind: 'gradient-wipe', frames: 20, alignment: 'center' }, { head: 999, tail: 999 }, { head: 999, tail: 999 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd lib/editor && npx vitest run ../reel-config-base/handle-room.test.ts
```

Expected: FAIL — the module does not exist.

(`lib/editor`'s vitest is what runs `lib/reel-config-base` tests in this repo — see the Quality Gates table in `CLAUDE.md`.)

- [ ] **Step 3: Implement the predicate**

Create `lib/reel-config-base/handle-room.ts`:

```ts
import type { VideoItem } from './layered-schema';
import { isCut, transitionAlignmentOf, transitionHandles, TRANSITION_ALIGNMENTS } from './transition-schema';
import type { TransitionAlignment } from './transition-schema';
import { isNodeEnabled } from './node-enabled';

/** Frames of source material a video item can lend on each side of itself:
 *  `head` is what exists BEFORE its in-point, `tail` what exists AFTER its
 *  out-point. A transition at a boundary is paid for out of these. */
export interface HandleRoom {
  head: number;
  tail: number;
}

const UNBOUNDED: HandleRoom = { head: Infinity, tail: Infinity };

/** What `item` can lend, given its file's measured length.
 *
 *  An UNKNOWN `fileMs` leaves the tail unbounded rather than zero — the same
 *  rule `resizeBoundsMs` uses. Reporting starvation from a not-yet-decoded
 *  source would fire on every reel the moment it opened, and a warning that
 *  cries wolf is worse than none. */
export function handleRoomFrames(item: VideoItem, fileMs: number | undefined, fps: number): HandleRoom {
  // Only clip/broll carry a source window. photo/card/outro/multi-clip hold
  // their span outright, so there is nothing to run out of.
  if (item.kind !== 'clip' && item.kind !== 'broll') return UNBOUNDED;
  const toFrames = (ms: number) => Math.floor((ms / 1000) * fps);
  return {
    head: toFrames(item.sourceInMs),
    tail: fileMs && fileMs > 0 ? toFrames(fileMs - item.sourceOutMs) : Infinity,
  };
}

/** The longest transition this boundary can carry at `alignment`.
 *
 *  `center` splits the length across both sides, so it is bounded by TWICE the
 *  scarcer side; `start` spends it all from the left item's tail and `end` all
 *  from the right item's head. An absent neighbour is the reel edge, which
 *  lends freely — the layout already suppresses handles there. */
export function maxTransitionFrames(
  left: HandleRoom | undefined,
  right: HandleRoom | undefined,
  alignment: TransitionAlignment,
): number {
  const tail = left ? left.tail : Infinity;
  const head = right ? right.head : Infinity;
  if (alignment === 'start') return tail;
  if (alignment === 'end') return head;
  return Math.min(tail, head) * 2;
}

export type BoundaryState = 'ok' | 'clamped' | 'impossible';

/** Whether this boundary can be rendered as authored.
 *
 *  `clamped` means a shorter length (or a different alignment) would fit;
 *  `impossible` means no alignment at any length ≥ 1 works, because
 *  `TransitionFrames` forbids zero. The remedy for `impossible` is to disable
 *  the transition — which lends no handles at all and leaves the clips where
 *  they are (see transition-record.ts) — but that is the user's call, applied
 *  in the editor, never here. */
export function boundaryState(
  transition: unknown,
  left: HandleRoom | undefined,
  right: HandleRoom | undefined,
): BoundaryState {
  // The three "there is nothing here" cases plus a disabled node all borrow
  // nothing, so they can never starve.
  if (isCut(transition) || !isNodeEnabled(transition)) return 'ok';
  const frames = (transition as { frames?: unknown }).frames;
  if (typeof frames !== 'number') return 'ok';
  const alignment = transitionAlignmentOf(transition);
  if (frames <= maxTransitionFrames(left, right, alignment)) return 'ok';
  const best = Math.max(...TRANSITION_ALIGNMENTS.map((a) => maxTransitionFrames(left, right, a)));
  return best >= 1 ? 'clamped' : 'impossible';
}

/** A diagnosis, not a label: which side is short and by how much. "Insufficient
 *  media" tells a user something is wrong but not which clip to touch. Returns
 *  null when the boundary is fine. */
export function starvationMessage(
  transition: unknown,
  left: HandleRoom | undefined,
  right: HandleRoom | undefined,
): string | null {
  if (boundaryState(transition, left, right) === 'ok') return null;
  const { before, after } = transitionHandles(
    (transition as { frames: number }).frames,
    transitionAlignmentOf(transition),
  );
  const headShort = right && before > right.head;
  if (headShort) return `Needs ${before} frames before the cut, this clip has ${right!.head}`;
  return `Needs ${after} frames after the cut, this clip has ${left ? left.tail : 0}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd lib/editor && npx vitest run ../reel-config-base/handle-room.test.ts
```

Expected: PASS, 17 tests (4 + 4 + 7 + 2 across the four describes).

- [ ] **Step 5: Correct the spec's state list**

In `docs/superpowers/specs/2026-08-03-transition-handle-starvation-design.md`, §3's first paragraph says a block carries "one of four states: ok, realigned, clamped, impossible". Replace `four` with `three` and drop `realigned`, adding the reason: realignment is Plan B's action, and a realigned boundary is simply `ok`.

- [ ] **Step 6: Typecheck and commit**

```bash
cd lib/editor && npx tsc --noEmit ; echo "exit=$?"
```

Expected: the same 3 pre-existing errors by IDENTITY (`LayeredInspector.tsx` around line 1118, `derive-layered.test.ts:277`, `../theming/envelope.test.ts:1`), `exit=2`. Read the exit code separately — a piped `grep -c` prints `0` when tsc crashes.

```bash
git add lib/reel-config-base/handle-room.ts lib/reel-config-base/handle-room.test.ts docs/superpowers/specs/2026-08-03-transition-handle-starvation-design.md
git commit --no-gpg-sign -m "feat(reel-config): handle room and boundary state, the one predicate both sides read"
```

---

### Task 3: Pin the guarantee the `impossible` remedy rests on

`boundaryState` returns `ok` for a disabled transition because a disabled node lends no handle frames. `lib/render/transition-record.ts:62-67` says so in prose, and Plan B's remedy for `impossible` depends on it. Prose is not a pin.

**Files:**
- Test: `lib/editor/src/video-track-layout.test.ts` (exists — append)

**Interfaces:**
- Consumes: `computeVideoLayout` from `lib/render/video-track-layout`, already imported by that test file.

- [ ] **Step 1: Write the failing test**

Read the existing file first and follow its fixture style. Append:

```ts
// The `impossible` remedy (disable the transition) is only a remedy because a
// disabled node lends NOTHING — transition-record.ts:62-67 states it, and
// boundaryState returns 'ok' for a disabled node on the strength of it. If a
// disabled transition ever started borrowing again, the editor would call a
// starved boundary healthy.
it('a disabled transition lends no handle frames to either neighbour', () => {
  const enabled = computeVideoLayout(/* two clips, gradient-wipe frames 20 between them */);
  const disabled = computeVideoLayout(/* the same, with enabled: false on that transition */);
  expect(enabled[1].inHalf).toBeGreaterThan(0);
  expect(disabled[1].inHalf).toBe(0);
  expect(disabled[0].outHalf).toBe(0);
});
```

Build both fixtures from the file's existing helpers — do not invent a new fixture shape. If the file has no helper, construct the two-item reel inline in the same style as its neighbouring tests.

- [ ] **Step 2: Run it**

```bash
cd lib/editor && npx vitest run src/video-track-layout.test.ts
```

If it FAILS, the guarantee does not hold and `boundaryState`'s disabled branch is wrong — report BLOCKED rather than adjusting the test to pass. If it PASSES immediately, that is the expected outcome: this test pins existing behaviour so it cannot regress silently. Say which happened in the report.

- [ ] **Step 3: Commit**

```bash
git add lib/editor/src/video-track-layout.test.ts
git commit --no-gpg-sign -m "test(layout): pin that a disabled transition lends no handles"
```

---

### Task 4: The render-side check

**Files:**
- Modify: `lib/render/layered-composition-props.ts`
- Test: `lib/editor/src/layered-composition-props.test.ts` (exists — append)

**Interfaces:**
- Consumes: `handleRoomFrames`, `boundaryState`, `starvationMessage` from Task 2; the media package Task 1 proved.
- Produces: `checkBoundaries(reel, durationsMs, fps): string[]` — exported from `layered-composition-props.ts`, returning one message per starved boundary. Task 5 does NOT reuse it (the editor composes its own diagnostics with target ids), but both call the same `boundaryState`.

- [ ] **Step 1: Write the failing test**

```ts
import { checkBoundaries } from './layered-composition-props';

it('reports one message per starved boundary, naming the shortfall', () => {
  const reel = /* two clips butted at 3000ms, the second with sourceInMs 0,
                  gradient-wipe frames 20 as the first item's transitionOut */;
  const msgs = checkBoundaries(reel, { 'a.mp4': 10000, 'b.mp4': 10000 }, 30);
  expect(msgs).toHaveLength(1);
  expect(msgs[0]).toContain('Needs 10 frames before the cut, this clip has 0');
});

it('is silent when every boundary has room', () => {
  const reel = /* the same reel, second clip with sourceInMs 2000 */;
  expect(checkBoundaries(reel, { 'a.mp4': 10000, 'b.mp4': 10000 }, 30)).toEqual([]);
});

it('is silent when a duration is missing, rather than guessing', () => {
  const reel = /* the starved reel above */;
  expect(checkBoundaries(reel, {}, 30)).toEqual([]);
});
```

Build the reels in the style the existing tests in that file use.

- [ ] **Step 2: Run to verify it fails**

```bash
cd lib/editor && npx vitest run src/layered-composition-props.test.ts
```

Expected: FAIL — `checkBoundaries` is not exported.

- [ ] **Step 3: Implement**

Add to `lib/render/layered-composition-props.ts`:

```ts
import { handleRoomFrames, boundaryState, starvationMessage } from '@video-toolkit/lib/reel-config-base/handle-room';

/** Every starved boundary in `reel`, one human-readable message each.
 *
 *  Validation only — this NEVER changes the reel. The editor decides a
 *  transition's length and writes it into the model; if the renderer also
 *  decided, Studio and the final render could disagree, which is the exact
 *  class of defect Phase 5 removed. A missing duration yields silence, not a
 *  guess: see `handleRoomFrames`. */
export function checkBoundaries(
  reel: LayeredReel,
  durationsMs: Record<string, number>,
  fps: number,
): string[] {
  const items = reel.tracks.video;
  const roomOf = (i: number) => {
    const it = items[i];
    if (!it) return undefined;
    const src = (it as { source?: string }).source;
    return handleRoomFrames(it, src ? durationsMs[src] : undefined, fps);
  };
  const out: string[] = [];
  for (let i = 0; i < items.length - 1; i++) {
    const t = items[i].transitionOut;
    if (boundaryState(t, roomOf(i), roomOf(i + 1)) === 'ok') continue;
    const msg = starvationMessage(t, roomOf(i), roomOf(i + 1));
    if (msg) out.push(`${items[i].id} → ${items[i + 1].id}: ${msg}`);
  }
  return out;
}
```

Then make `calculateMetadata` async, measure each distinct source once, and warn. In the same file, inside the existing `calculateMetadata` at `:63`:

```ts
    calculateMetadata: async ({ props }) => {
      const sources = [...new Set(props.reel.tracks.video
        .map((v) => (v as { source?: string }).source)
        .filter((s): s is string => !!s))];
      const durationsMs: Record<string, number> = {};
      await Promise.all(sources.map(async (s) => {
        try {
          const meta = await getVideoMetadata(staticFile(s));
          durationsMs[s] = meta.durationInSeconds * 1000;
        } catch {
          // A source we cannot measure is left ABSENT, which handleRoomFrames
          // reads as "unbounded" — silence, not a false alarm.
        }
      }));
      for (const msg of checkBoundaries(props.reel, durationsMs, fps)) {
        // eslint-disable-next-line no-console
        console.warn('[transition] handle starvation —', msg);
      }
      return { durationInFrames: /* the existing expression, unchanged */ };
    },
```

Keep the existing duration expression exactly as it is — this task adds measurement and warnings, and changes nothing about the composition's length.

- [ ] **Step 4: Run the tests**

```bash
cd lib/editor && npx vitest run src/layered-composition-props.test.ts
```

Expected: PASS.

- [ ] **Step 5: Prove it end to end in a real render**

```bash
cd examples/layered-minimal && npx remotion still src/index.ts MinimalReel out/frame.png --frame=45
```

Expected: exits 0. If that example's reel has a starved boundary the warning appears; if it does not, no warning appears and the render is unchanged. Report which, with the actual output. **Do not pipe through `tee`.**

- [ ] **Step 6: Commit**

```bash
git add lib/render/layered-composition-props.ts lib/editor/src/layered-composition-props.test.ts
git commit --no-gpg-sign -m "feat(render): measure sources and warn on every starved boundary"
```

---

### Task 5: Mark the starved boundary in the timeline

**Files:**
- Modify: `lib/editor/app/LayeredTimeline.tsx`
- Test: `lib/editor/app/LayeredTimeline.test.tsx`

**Interfaces:**
- Consumes: `handleRoomFrames`, `boundaryState`, `starvationMessage` (Task 2); the component's existing `sourceDurations` (`:309`) and `videoUrl`.
- Produces: `boundaryDiagnostics(reel, durationsMs, fps): Diagnostic[]` exported from `LayeredTimeline.tsx`, where
  ```ts
  export interface Diagnostic { severity: 'error' | 'warning'; message: string; targetId?: string }
  ```
  `targetId` is the transitions-lane action id (`transition:<itemId>`), so clicking selects that block. Task 6 renders this list.

- [ ] **Step 1: Write the failing test**

The mark itself cannot be tested through the DOM — jsdom mounts no xzdarcy action block (`LayeredTimeline.test.tsx:36-39`). Pin the pure producer instead, exactly as the slip work did:

```ts
import { boundaryDiagnostics } from './LayeredTimeline';

describe('boundaryDiagnostics', () => {
  it('produces one entry per starved boundary, targeting its transition block', () => {
    const reel = /* two clips, the second with sourceInMs 0, gradient-wipe frames 20 */;
    const d = boundaryDiagnostics(reel, { 'b.mp4': 10000, 'a.mp4': 10000 }, 30);
    expect(d).toHaveLength(1);
    expect(d[0].targetId).toBe('transition:v1');
    expect(d[0].severity).toBe('error');
    expect(d[0].message).toContain('Needs 10 frames before the cut');
  });

  it('is empty when every boundary has room', () => {
    const reel = /* the same with sourceInMs 2000 */;
    expect(boundaryDiagnostics(reel, { 'a.mp4': 10000, 'b.mp4': 10000 }, 30)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd lib/editor && npx vitest run app/LayeredTimeline.test.tsx -t boundaryDiagnostics
```

Expected: FAIL — not exported.

- [ ] **Step 3: Implement the producer**

Add near the other module-level helpers in `LayeredTimeline.tsx`:

```tsx
export interface Diagnostic {
  severity: 'error' | 'warning';
  message: string;
  /** Action id of the thing to select when the user clicks this entry. */
  targetId?: string;
}

/** Starved boundaries, as diagnostics the editor can list and navigate to.
 *  Reads the SAME predicate the renderer's check reads (`boundaryState`), so
 *  the editor and the render can never disagree about a boundary. */
export function boundaryDiagnostics(reel: LayeredReel, durationsMs: Record<string, number>, fps: number): Diagnostic[] {
  const items = reel.tracks.video;
  const roomOf = (i: number) => {
    const it = items[i];
    if (!it) return undefined;
    const url = videoUrl(it);
    return handleRoomFrames(it, url ? durationsMs[url] : undefined, fps);
  };
  const out: Diagnostic[] = [];
  for (let i = 0; i < items.length - 1; i++) {
    const t = items[i].transitionOut;
    const state = boundaryState(t, roomOf(i), roomOf(i + 1));
    if (state === 'ok') continue;
    const msg = starvationMessage(t, roomOf(i), roomOf(i + 1));
    if (msg) out.push({ severity: 'error', message: msg, targetId: `transition:${items[i].id}` });
  }
  return out;
}
```

- [ ] **Step 4: Hatch the block and surface the list**

Inside the component, derive the states once:

```tsx
  const diagnostics = useMemo(
    () => boundaryDiagnostics(reel, sourceDurations, fps),
    [reel, sourceDurations, fps],
  );
  const starvedTargets = useMemo(() => new Set(diagnostics.map((d) => d.targetId)), [diagnostics]);
```

Add an optional prop beside the others so the shell can receive them, and call it whenever they change:

```tsx
  /** Reported upward so the shell can badge them. Pass a STABLE callback. */
  onDiagnostics?: (d: Diagnostic[]) => void;
```

```tsx
  useEffect(() => { onDiagnostics?.(diagnostics); }, [diagnostics, onDiagnostics]);
```

In the transitions-lane render branch (`:595`), mark the block when its id is starved — reusing the existing hatch vocabulary rather than inventing one:

```tsx
                  className={starvedTargets.has(action.id) ? 'vt-grip-muted' : undefined}
                  title={starvedTargets.has(action.id)
                    ? diagnostics.find((d) => d.targetId === action.id)!.message
                    : action.id}
```

`.vt-grip-muted` (`:154`) is the 45° hatch already meaning "nothing more to take this way" — the same fact, and the same hatch Premiere uses for insufficient media. Colours stay neutral; no accent.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd lib/editor && npx vitest run app/LayeredTimeline.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/editor/app/LayeredTimeline.tsx lib/editor/app/LayeredTimeline.test.tsx
git commit --no-gpg-sign -m "feat(editor): hatch a starved boundary and report it as a diagnostic"
```

---

### Task 6: The diagnostics badge

**Files:**
- Create: `lib/editor/app/Diagnostics.tsx`
- Create: `lib/editor/app/Diagnostics.test.tsx`
- Modify: `lib/editor/app/EditorShell.tsx`

**Interfaces:**
- Consumes: `Diagnostic` and the `onDiagnostics` prop from Task 5.
- Produces: `<DiagnosticsBadge items={...} onSelect={...} />`.

- [ ] **Step 1: Write the failing test**

This one IS testable in jsdom — it is ordinary DOM, not an xzdarcy block:

```tsx
import { render, fireEvent } from '@testing-library/react';
import { DiagnosticsBadge } from './Diagnostics';

const items = [
  { severity: 'error' as const, message: 'Needs 10 frames before the cut, this clip has 0', targetId: 'transition:v1' },
];

describe('DiagnosticsBadge', () => {
  it('renders nothing at all when there is nothing to report', () => {
    const { container } = render(<DiagnosticsBadge items={[]} onSelect={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('counts the issues and hides the list until it is opened', () => {
    const { getByRole, queryByText } = render(<DiagnosticsBadge items={items} onSelect={() => {}} />);
    expect(getByRole('button').textContent).toBe('1 issue');
    expect(queryByText(items[0].message)).toBeNull();
  });

  it('pluralises', () => {
    const two = [items[0], { ...items[0], targetId: 'transition:v2' }];
    const { getByRole } = render(<DiagnosticsBadge items={two} onSelect={() => {}} />);
    expect(getByRole('button').textContent).toBe('2 issues');
  });

  it('selects the offending boundary when an entry is clicked', () => {
    const onSelect = vi.fn();
    const { getByRole, getByText } = render(<DiagnosticsBadge items={items} onSelect={onSelect} />);
    fireEvent.click(getByRole('button'));
    fireEvent.click(getByText(items[0].message));
    expect(onSelect).toHaveBeenCalledWith('transition:v1');
  });
});
```

Import `vi` from `vitest` alongside `describe`/`it`/`expect`.

- [ ] **Step 2: Run to verify it fails**

```bash
cd lib/editor && npx vitest run app/Diagnostics.test.tsx
```

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Implement**

Create `lib/editor/app/Diagnostics.tsx`:

```tsx
import { useState } from 'react';
import type { Diagnostic } from './LayeredTimeline';

/** A count in the header that expands into the list. Deliberately NOT a
 *  permanently open panel: on a healthy project it is empty, and it should not
 *  cost timeline height for nothing. Clicking an entry selects the offending
 *  boundary — on a reel with thirty cuts a hatched block outside the viewport
 *  is invisible, so this list is the index into them.
 *
 *  Neutral greys only: core is brand-neutral, and signalling through an accent
 *  colour would pull brand vocabulary into lib/. */
export function DiagnosticsBadge({ items, onSelect }: { items: Diagnostic[]; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div style={{ position: 'relative', fontSize: 11 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ background: '#3a2f2f', color: '#e8d5d5', border: '1px solid #5a4444', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', font: 'inherit' }}
      >
        {items.length} {items.length === 1 ? 'issue' : 'issues'}
      </button>
      {open && (
        <ul style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 20, listStyle: 'none', padding: 4, minWidth: 280, background: '#232428', border: '1px solid #3a3c42', borderRadius: 4 }}>
          {items.map((d, i) => (
            <li key={i}>
              <button
                onClick={() => d.targetId && onSelect(d.targetId)}
                style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#d8d8da', padding: '4px 6px', cursor: d.targetId ? 'pointer' : 'default', font: 'inherit' }}
              >
                {d.message}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire it into the shell**

In `EditorShell.tsx`, hold the list and render the badge in the header beside the project name, passing the shell's existing selection setter as `onSelect`:

```tsx
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
```

Pass `onDiagnostics={setDiagnostics}` to `<LayeredTimeline>` and place `<DiagnosticsBadge items={diagnostics} onSelect={setSelectedId} />` in the header row. Use the shell's actual selection state setter — read the file and match its existing names rather than assuming `setSelectedId`.

- [ ] **Step 5: Run the full editor suite and typecheck**

```bash
cd lib/editor && npx vitest run --no-file-parallelism
cd lib/editor && npx tsc --noEmit ; echo "exit=$?"
```

Green; the same 3 pre-existing type errors by identity, `exit=2`. **Re-derive the test counts from this run** — the last measured baseline was 113 files / 1854 tests, and this plan adds roughly 27. Report what the run prints, never a carried-forward number.

- [ ] **Step 6: Verify by hand**

Open a project with a starved boundary (a broll cut from the head of its file, with a transition into it). Confirm: the badge appears with the right count; opening it lists the message; clicking selects the transition block; the block is hatched; a healthy project shows no badge at all.

- [ ] **Step 7: Commit**

```bash
git add lib/editor/app/Diagnostics.tsx lib/editor/app/Diagnostics.test.tsx lib/editor/app/EditorShell.tsx
git commit --no-gpg-sign -m "feat(editor): a diagnostics badge that navigates to the boundary it names"
```

---

### Task 7: Bound the length field

**Files:**
- Modify: `lib/editor/app/LayeredInspector.tsx:582-584`

**Interfaces:**
- Consumes: `maxTransitionFrames` and `handleRoomFrames` (Task 2).

- [ ] **Step 1: Bound the commit**

The field currently reads:

```tsx
          value={t.frames}
          onCommit={(n) => onChange({ ...t, frames: Math.max(1, Math.round(n)) })}
```

Clamp the upper end too, from the room the boundary actually has, and show the ceiling in the label so the stop is explained rather than mysterious. Read the surrounding component first to learn how it reaches the two neighbouring items and the decoded durations — if neither is available there, thread them in from the shell the same way the existing props are threaded, and say so in your report.

```tsx
          lbl={`Length (frames, max ${max})`}
          value={t.frames}
          onCommit={(n) => onChange({ ...t, frames: Math.min(max, Math.max(1, Math.round(n))) })}
```

where `max = Math.max(1, maxTransitionFrames(leftRoom, rightRoom, transitionAlignmentOf(t)))`.

**This bounds NEW input only. It must not rewrite a stored value** — a boundary starved retroactively keeps its authored length and is reported by Tasks 5 and 6. Do not add an effect that clamps on mount.

- [ ] **Step 2: Run the full suite and typecheck**

```bash
cd lib/editor && npx vitest run --no-file-parallelism
cd lib/editor && npx tsc --noEmit ; echo "exit=$?"
```

Green; 3 pre-existing errors by identity, `exit=2`.

- [ ] **Step 3: Commit**

```bash
git add lib/editor/app/LayeredInspector.tsx
git commit --no-gpg-sign -m "feat(editor): the length field stops at the frames the boundary can lend"
```

---

## Final gates

```bash
cd lib/editor && npx vitest run --no-file-parallelism
cd lib/editor && npx tsc --noEmit ; echo "exit=$?"
cd examples/layered-minimal && npm run typecheck
cd examples/layered-minimal && npm run pixel-gate:strict
grep -riE 'lime|teal|roost|progresivn|sand-brown' lib/ --exclude-dir=node_modules --exclude='*.test.*'
grep -n 'it\.fails' lib/editor/src/at-cut-transitions.test.tsx
```

| Gate | Expected |
|---|---|
| Editor tests | Green. **Re-derive the counts** — baseline 113 files / 1854 tests, this plan adds ~27. |
| Editor types | The same 3 pre-existing errors, by identity, `exit=2`. Read the exit code separately. |
| Render/transitions types | 0 errors. The coverage guard is a floor; a new `lib/reel-config-base` file raises that tree's count from 10 — report the new number. |
| **Pixel harness** | **PASS, and zero cells moved.** This plan touches the render path (`layered-composition-props.ts`), so the harness runs. A warning changes no pixels, so movement is a finding, not noise. |
| Brand-leak grep | Exactly 2 hits, both comments. The new diagnostics UI must not add a third. |
| `it.fails` guard | 0. |

**Python `sync_template`** is untouched by this work and is not run.
