# The Editor Explains a Blocked Edit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the editor refuses to move a handle further, the timeline's bottom bar says why —
and that bar becomes the editor's general transient-message surface.

**Architecture:** A pure module names the binding constraint as a CODE (`lib/editor/src/timeline/
block-reason.ts`); the app layer owns the English copy; a small hook holds the message with a latch
and an auto-clear; the timeline's existing one-line shortcut bar renders it in place of the hints.
The host owns the message state so a second publisher (the inspector, and later real errors) uses
the same surface.

**Tech Stack:** TypeScript, React, vitest, `@xzdarcy/react-timeline-editor`.

**Source spec:** `docs/superpowers/specs/2026-08-04-editor-feedback-and-grading-design.md` (Feature 1).

## Global Constraints

- **Editor UI strings are ENGLISH.** (Even though the project's conversations are in Czech.)
- **No brand vocabulary in `lib/`** — the brand-leak grep must keep returning exactly 2 hits.
- **Reason codes live in `lib/editor/src/timeline/`, user-facing copy does NOT.** That module is
  shared with non-UI consumers; a sentence written there is in the wrong layer.
- **`LayeredTimeline` is memoized and re-renders on every playhead frame.** Any callback passed to
  it must be a stable reference (`useCallback` with correct deps) or the memo is defeated and
  playback stutters — this has already cost this repo a performance regression once.
- **The shortcut bar is ONE line.** `ed:flex-none ed:h-5 … ed:whitespace-nowrap ed:overflow-hidden`
  is load-bearing: a second line costs timeline height. A message must not wrap it.
- **Measure, don't assume.** Every behaviour claim gets a test proven RED first. Never pipe a gate
  command through `tee` (it returns tee's exit code); `tsc --noEmit | grep -c` prints 0 when tsc
  crashes — read exit codes separately.
- Commits: no `Co-Authored-By`. If signing fails, immediately re-run with `--no-gpg-sign`.

## What the research already settled (do not re-litigate)

**The handle is stopped by an armed bound, not by a rejected edit.** `LayeredTimeline`'s
`onActionResizeStart` calls `resizeBoundsMs(item, capMsById[id])` and arms `setResizeBound(...)`;
the timeline library enforces it in real time (`LayeredTimeline.tsx:1322-1335`). The commit-time
clamp in `resizeVideoItem` (`layered-adapter.ts:300-360`) is a second, independent guard.

**Therefore we do NOT need to detect an overshoot.** "The dragged edge is sitting AT its bound"
is the same information from the user's point of view, and it is observable without fighting the
library. `onActionResizing({ action, row, start, end, dir })` fires throughout the drag with
seconds; comparing its edge against the armed bound is enough.

> Whether `start`/`end` arrive pre- or post-clamp is NOT documented and MUST be measured in Task 3,
> not assumed. Either answer works — at-bound and past-bound both satisfy the comparison — but the
> tolerance you need differs, so find out and write down what you saw.

**Scope of the first pass:** the constraints that actually stop a drag today (footage head/tail,
minimum clip length, the music bed's source end) plus the transition Length cap, which is the one
case where the fix is not guessable. Ripple/overwrite does NOT block a drag (the neighbour yields),
so it gets no code — inventing codes for paths that never fire would be worse than silence.

## File Structure

| File | Responsibility |
|---|---|
| `lib/editor/src/timeline/block-reason.ts` (new) | `BlockReason` union + `edgeBlockReason` / `musicBlockReason` — pure, no copy. |
| `lib/editor/app/block-reason-copy.ts` (new) | `BLOCK_REASON_COPY` — the English sentence per code, plus severity. |
| `lib/editor/app/useTransientHint.ts` (new) | Latched message state with auto-clear. |
| `lib/editor/app/LayeredTimeline.tsx` (modify, ~1322-1364) | Publishes the reason during a resize; renders the message in the shortcut bar. |
| `lib/editor/host/EditorHost.tsx` (modify) | Owns the hint state; passes `hint` + a STABLE `onHint` down. |
| `lib/editor/app/LayeredInspector.tsx` (modify, ~1706) | The transition Length slider publishes when it sits at its cap. |

---

### Task 1: Name the constraint (pure, no copy)

**Files:**
- Create: `lib/editor/src/timeline/block-reason.ts`
- Test: `lib/editor/src/timeline/block-reason.test.ts` (new)

**Interfaces:**
- Consumes: `VideoItem` (`lib/reel-config-base/layered-schema`), `resizeBoundsMs` and `MIN_CLIP_MS`
  (`./layered-adapter`).
- Produces:
  ```ts
  export type BlockReason =
    | 'footage-head-exhausted'
    | 'footage-tail-exhausted'
    | 'min-clip-length'
    | 'music-source-end'
    | 'timeline-start'
    | 'transition-handle-starved';

  export function edgeBlockReason(args: {
    item: VideoItem;
    decodedMs: number | undefined;
    edge: 'in' | 'out';
    posMs: number;
    tolMs: number;
  }): BlockReason | null;

  export function musicBlockReason(args: {
    edge: 'in' | 'out';
    posMs: number;
    maxMs: number | undefined;
    tolMs: number;
  }): BlockReason | null;
  ```
  Tasks 2-4 consume these.

- [ ] **Step 1: Write the failing test**

Create `lib/editor/src/timeline/block-reason.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { edgeBlockReason, musicBlockReason } from './block-reason';
import { MIN_CLIP_MS } from './layered-adapter';
import type { VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

// A 4s clip starting 1s into a source file. At 1x, the head can give back
// 1000ms and the tail reaches 1000 + decoded.
const clip = (over: Partial<VideoItem> = {}): VideoItem =>
  ({ id: 'v1', kind: 'clip', startMs: 2000, endMs: 6000, source: 'a.mp4',
     sourceInMs: 1000, sourceOutMs: 5000, ...over }) as VideoItem;

const TOL = 34; // one frame at 30fps

describe('edgeBlockReason', () => {
  it('is null in the middle of the range — nothing is blocking', () => {
    expect(edgeBlockReason({ item: clip(), decodedMs: 20000, edge: 'out', posMs: 7000, tolMs: TOL })).toBeNull();
    expect(edgeBlockReason({ item: clip(), decodedMs: 20000, edge: 'in', posMs: 1500, tolMs: TOL })).toBeNull();
  });

  it('names the head when the in-point is back at the start of the source', () => {
    // startMs 2000 − sourceInMs 1000 = 1000ms is as far left as it can go.
    expect(edgeBlockReason({ item: clip(), decodedMs: 20000, edge: 'in', posMs: 1000, tolMs: TOL }))
      .toBe('footage-head-exhausted');
  });

  it('names the tail when the out-point is at the end of the file', () => {
    // decoded 6000 − sourceIn 1000 = 5000ms of tail from startMs 2000 ⇒ 7000.
    expect(edgeBlockReason({ item: clip(), decodedMs: 6000, edge: 'out', posMs: 7000, tolMs: TOL }))
      .toBe('footage-tail-exhausted');
  });

  it('names the minimum length when an edge is squeezed against the other', () => {
    expect(edgeBlockReason({ item: clip(), decodedMs: 20000, edge: 'out', posMs: 2000 + MIN_CLIP_MS, tolMs: TOL }))
      .toBe('min-clip-length');
    expect(edgeBlockReason({ item: clip(), decodedMs: 20000, edge: 'in', posMs: 6000 - MIN_CLIP_MS, tolMs: TOL }))
      .toBe('min-clip-length');
  });

  it('lets the footage cap outrank the minimum length when both bind', () => {
    // A file with less than MIN_CLIP_MS of tail left: resizeVideoItem applies
    // the footage cap LAST and it wins (layered-adapter.ts) — the reason the
    // user is shown must agree with the clamp they actually got.
    const item = clip({ startMs: 0, endMs: 50, sourceInMs: 0, sourceOutMs: 50 });
    expect(edgeBlockReason({ item, decodedMs: 50, edge: 'out', posMs: 50, tolMs: TOL }))
      .toBe('footage-tail-exhausted');
  });

  it('answers within one frame of the bound, not only exactly on it', () => {
    // The library clamps in seconds and hands back floats; an exact compare
    // would report "nothing is blocking" for a handle that visibly stopped.
    expect(edgeBlockReason({ item: clip(), decodedMs: 6000, edge: 'out', posMs: 6980, tolMs: TOL }))
      .toBe('footage-tail-exhausted');
    expect(edgeBlockReason({ item: clip(), decodedMs: 6000, edge: 'out', posMs: 6900, tolMs: TOL }))
      .toBeNull();
  });

  it('says nothing for an undecoded source — there is no known cap to hit', () => {
    expect(edgeBlockReason({ item: clip(), decodedMs: undefined, edge: 'out', posMs: 999999, tolMs: TOL })).toBeNull();
  });

  it('says nothing for kinds that cannot be trimmed', () => {
    const card = { id: 'c', kind: 'card', startMs: 0, endMs: 3000 } as unknown as VideoItem;
    expect(edgeBlockReason({ item: card, decodedMs: 9000, edge: 'out', posMs: 3000, tolMs: TOL })).toBeNull();
  });
});

describe('musicBlockReason', () => {
  it('names the end of the music file', () => {
    expect(musicBlockReason({ edge: 'out', posMs: 30000, maxMs: 30000, tolMs: TOL })).toBe('music-source-end');
  });

  it('names the start of the timeline for the pinned left edge', () => {
    expect(musicBlockReason({ edge: 'in', posMs: 0, maxMs: 30000, tolMs: TOL })).toBe('timeline-start');
  });

  it('is null away from both', () => {
    expect(musicBlockReason({ edge: 'out', posMs: 12000, maxMs: 30000, tolMs: TOL })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it FAILS**

```bash
cd lib/editor && npx vitest run src/timeline/block-reason.test.ts
```

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the module**

`lib/editor/src/timeline/block-reason.ts`:

```ts
import type { VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';
import { MIN_CLIP_MS, resizeBoundsMs } from './layered-adapter';

/** Why the editor would not let an edit go further. A CODE, never a sentence:
 *  this module is shared with non-UI consumers, and the wording belongs to the
 *  app layer (`app/block-reason-copy.ts`). */
export type BlockReason =
  | 'footage-head-exhausted'
  | 'footage-tail-exhausted'
  | 'min-clip-length'
  | 'music-source-end'
  | 'timeline-start'
  | 'transition-handle-starved';

/** The constraint binding a clip/broll edge at `posMs`, or null if it is free.
 *
 *  Answers "is this edge AT its limit", not "did the user try to go past it" —
 *  the handle is hard-stopped by an armed bound before any overshoot reaches
 *  us (see LayeredTimeline's onActionResizeStart), and at-the-limit is the
 *  same fact from the user's side.
 *
 *  `tolMs` exists because the timeline library works in seconds and hands back
 *  floats: an exact compare would report "free" for a handle that visibly
 *  stopped. One frame is the natural value. */
export function edgeBlockReason(args: {
  item: VideoItem;
  decodedMs: number | undefined;
  edge: 'in' | 'out';
  posMs: number;
  tolMs: number;
}): BlockReason | null {
  const { item, decodedMs, edge, posMs, tolMs } = args;
  const bounds = resizeBoundsMs(item, decodedMs);
  if (!bounds) return null; // not a trimmable kind

  if (edge === 'out') {
    // The footage cap outranks the length floor when both bind — matching the
    // commit clamp, which applies the cap LAST and lets it win.
    if (bounds.maxEndMs !== undefined && posMs >= bounds.maxEndMs - tolMs) return 'footage-tail-exhausted';
    if (posMs <= item.startMs + MIN_CLIP_MS + tolMs) return 'min-clip-length';
    return null;
  }

  if (posMs <= bounds.minStartMs + tolMs) return 'footage-head-exhausted';
  if (posMs >= item.endMs - MIN_CLIP_MS - tolMs) return 'min-clip-length';
  return null;
}

/** The music bed: pinned at 0, end-trimmable to the length of its file. */
export function musicBlockReason(args: {
  edge: 'in' | 'out';
  posMs: number;
  maxMs: number | undefined;
  tolMs: number;
}): BlockReason | null {
  const { edge, posMs, maxMs, tolMs } = args;
  if (edge === 'in') return posMs <= tolMs ? 'timeline-start' : null;
  if (maxMs === undefined) return null;
  return posMs >= maxMs - tolMs ? 'music-source-end' : null;
}
```

- [ ] **Step 4: Run the test — expect PASS**

```bash
cd lib/editor && npx vitest run src/timeline/block-reason.test.ts
```

Expected: 11 passed.

- [ ] **Step 5: Prove the tolerance case is not vacuous**

Temporarily change `- tolMs` to `- 0` in the `'out'` footage branch, re-run, and confirm the
"answers within one frame" case goes RED. Restore, re-run green, and record both outputs in your
report. A tolerance nobody can observe failing is not a tested tolerance.

- [ ] **Step 6: Commit**

```bash
git add lib/editor/src/timeline/block-reason.ts lib/editor/src/timeline/block-reason.test.ts
git commit -m "feat(editor): name the constraint that stops a trim"
```

---

### Task 2: The copy, and the bar that shows it

**Files:**
- Create: `lib/editor/app/block-reason-copy.ts`
- Modify: `lib/editor/app/LayeredTimeline.tsx` (~1350-1365, the shortcut bar)
- Test: `lib/editor/app/block-reason-copy.test.ts` (new), `lib/editor/app/LayeredTimeline.test.tsx`

**Interfaces:**
- Consumes: `BlockReason` (Task 1).
- Produces:
  ```ts
  export interface HintMessage { text: string; severity: 'info' | 'warn' | 'error' }
  export const BLOCK_REASON_COPY: Record<BlockReason, HintMessage>;
  export function hintForReason(reason: BlockReason): HintMessage;
  ```
  and a new optional `hint?: HintMessage | null` prop on `LayeredTimeline`. Task 3 wires them.

- [ ] **Step 1: Write the failing tests**

Create `lib/editor/app/block-reason-copy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BLOCK_REASON_COPY, hintForReason } from './block-reason-copy';
import type { BlockReason } from '../src/timeline/block-reason';

// Every code the union declares must have copy. Derived, not a hand-listed
// duplicate: a seventh reason added next month is covered the day it lands,
// and cannot ship mute.
const ALL: BlockReason[] = [
  'footage-head-exhausted',
  'footage-tail-exhausted',
  'min-clip-length',
  'music-source-end',
  'timeline-start',
  'transition-handle-starved',
];

describe('block reason copy', () => {
  it.each(ALL)('has copy for %s', (reason) => {
    const hint = hintForReason(reason);
    expect(hint.text.length).toBeGreaterThan(0);
    expect(['info', 'warn', 'error']).toContain(hint.severity);
  });

  it('covers exactly the declared reasons — no orphan entries', () => {
    expect(Object.keys(BLOCK_REASON_COPY).sort()).toEqual([...ALL].sort());
  });

  it('tells the user what to DO about a starved transition handle', () => {
    // The one case where the fix is not guessable from the constraint: the
    // neighbour has no source left to lend, so the window has to move.
    expect(hintForReason('transition-handle-starved').text.toLowerCase()).toMatch(/shift|move|trim/);
  });

  it('stays one line — no copy long enough to wrap the bar', () => {
    for (const { text } of Object.values(BLOCK_REASON_COPY)) {
      expect(text.length, text).toBeLessThanOrEqual(90);
    }
  });
});
```

Append to `lib/editor/app/LayeredTimeline.test.tsx`, in the existing
`describe('LayeredTimeline shortcut bar', …)` block (reuse that file's `reel` fixture and render
call — read it first):

```tsx
it('shows a hint in place of the shortcuts, and keeps the one-line layout', () => {
  render(
    <LayeredTimeline reel={reel} onChange={() => {}} selectedId={null} onSelect={() => {}}
      playerRef={{ current: null }} fps={30} scaleWidth={80}
      hint={{ text: 'No more footage before this point.', severity: 'warn' }} />,
  );
  const bar = screen.getByTestId('timeline-shortcut-bar');
  expect(within(bar).getByText(/No more footage/)).toBeInTheDocument();
  // The hints are OUT of the way while a message is up — not stacked below it.
  expect(within(bar).queryByText('all shortcuts', { exact: false })).not.toBeInTheDocument();
  for (const cls of ['ed:flex-none', 'ed:h-5', 'ed:whitespace-nowrap', 'ed:overflow-hidden']) {
    expect(bar.className, bar.className).toContain(cls);
  }
});

it('goes back to the shortcuts when the hint clears', () => {
  const { rerender } = render(
    <LayeredTimeline reel={reel} onChange={() => {}} selectedId={null} onSelect={() => {}}
      playerRef={{ current: null }} fps={30} scaleWidth={80}
      hint={{ text: 'No more footage before this point.', severity: 'warn' }} />,
  );
  rerender(
    <LayeredTimeline reel={reel} onChange={() => {}} selectedId={null} onSelect={() => {}}
      playerRef={{ current: null }} fps={30} scaleWidth={80} hint={null} />,
  );
  expect(within(screen.getByTestId('timeline-shortcut-bar')).getByText('all shortcuts', { exact: false }))
    .toBeInTheDocument();
});
```

- [ ] **Step 2: Run both and confirm they FAIL**

```bash
cd lib/editor && npx vitest run app/block-reason-copy.test.ts app/LayeredTimeline.test.tsx
```

Expected: the copy file fails to resolve; the two bar cases fail because `hint` is not a prop yet.

- [ ] **Step 3: Write the copy module**

`lib/editor/app/block-reason-copy.ts`:

```ts
import type { BlockReason } from '../src/timeline/block-reason';

export interface HintMessage {
  text: string;
  severity: 'info' | 'warn' | 'error';
}

/** The English sentence for each constraint. Deliberately in the APP layer:
 *  `src/timeline/block-reason.ts` is shared with non-UI consumers, and a
 *  user-facing sentence there would be in the wrong place.
 *
 *  Each one says what stopped AND, where it is not obvious, what to do about
 *  it. A message the user cannot act on is only marginally better than the
 *  silence this replaces. Kept short: the bar is one line and must not wrap. */
export const BLOCK_REASON_COPY: Record<BlockReason, HintMessage> = {
  'footage-head-exhausted': {
    text: 'Start of the source — there is no earlier footage in this file.',
    severity: 'info',
  },
  'footage-tail-exhausted': {
    text: 'End of the source — there is no more footage in this file.',
    severity: 'info',
  },
  'min-clip-length': {
    text: 'Minimum clip length reached.',
    severity: 'info',
  },
  'music-source-end': {
    text: 'End of the music file.',
    severity: 'info',
  },
  'timeline-start': {
    text: 'The music bed is pinned to the start of the reel.',
    severity: 'info',
  },
  'transition-handle-starved': {
    text: 'Neighbour has no footage left to lend — trim it back or shift the clip’s window.',
    severity: 'warn',
  },
};

export function hintForReason(reason: BlockReason): HintMessage {
  return BLOCK_REASON_COPY[reason];
}
```

- [ ] **Step 4: Render it in the bar**

In `lib/editor/app/LayeredTimeline.tsx`, add to `LayeredTimelineProps`:

```ts
  /** A transient message shown INSTEAD of the shortcut hints (the bar is one
   *  line — see the bar's own comment). Null/absent = show the hints. */
  hint?: HintMessage | null;
```

destructure `hint` alongside the other props, import `type HintMessage` from `./block-reason-copy`,
and replace the bar's children (currently the `SHORTCUTS`/`GESTURES` map plus the `?` entry) with:

```tsx
        {hint ? (
          <span
            data-testid="timeline-hint"
            className={hint.severity === 'error' ? 'ed:text-danger' : hint.severity === 'warn' ? 'ed:text-warn' : 'ed:text-ink-2'}
          >
            {hint.text}
          </span>
        ) : (
          <>
            {[...SHORTCUTS.filter((s) => s.group === 'Timeline'), ...GESTURES].map((s) => (
              <span key={s.keys}>
                <span className="ed:font-mono ed:text-ink-2">{s.keys}</span> — {s.label}
              </span>
            ))}
            <span><span className="ed:font-mono ed:text-ink-2">?</span> — all shortcuts</span>
          </>
        )}
```

Check that `ed:text-danger` and `ed:text-warn` exist in `app/editor.in.css`'s theme block before
using them; if a name differs, use the one that is actually defined and say so in your report.

- [ ] **Step 5: Run the tests — expect PASS**

```bash
cd lib/editor && npx vitest run app/block-reason-copy.test.ts app/LayeredTimeline.test.tsx
```

- [ ] **Step 6: Rebuild the editor CSS (a new class combination may have appeared)**

```bash
cd lib/editor && npm run editor:css && git diff --stat app/editor.css && npx vitest run src/editor-css.test.ts
```

If `editor.css` changed, commit it with this task. The staleness test is byte-exact and will fail
otherwise.

- [ ] **Step 7: Commit**

```bash
git add lib/editor/app/block-reason-copy.ts lib/editor/app/block-reason-copy.test.ts lib/editor/app/LayeredTimeline.tsx lib/editor/app/LayeredTimeline.test.tsx lib/editor/app/editor.css
git commit -m "feat(editor): the timeline bar can carry a transient message"
```

---

### Task 3: Publish it during a drag

**Files:**
- Create: `lib/editor/app/useTransientHint.ts`, `lib/editor/app/useTransientHint.test.ts`
- Modify: `lib/editor/app/LayeredTimeline.tsx` (the resize callbacks, ~1322-1340)
- Modify: `lib/editor/host/EditorHost.tsx` (own the state, pass `hint` + stable `onHint`)
- Test: `lib/editor/app/EditorHost.test.tsx`

**Interfaces:**
- Consumes: `edgeBlockReason` / `musicBlockReason` (Task 1), `hintForReason` (Task 2).
- Produces:
  ```ts
  export function useTransientHint(clearAfterMs?: number): {
    hint: HintMessage | null;
    publish: (hint: HintMessage | null) => void;  // idempotent on identical text
    hold: () => void;    // keep it up (drag continues)
    release: () => void; // start the auto-clear countdown
  };
  ```
  plus a new `onHint?: (hint: HintMessage | null) => void` prop on `LayeredTimeline`.

- [ ] **Step 1: Measure what `onActionResizing` actually reports**

Before writing anything, settle the open question from the research. Add a temporary
`console.log` in `onActionResizing` printing `{ start, end, dir }` alongside the armed bound, run
the editor against a real project (`examples/layered-minimal` is enough), drag a handle hard past
the end of the footage, and record in your report whether the values are clamped to the bound or
run past it. Remove the log afterwards. **Do not skip this** — the tolerance in Task 1 was written
for the clamped case, and if the values run past, the comparison still works but the report should
say so for the next reader.

- [ ] **Step 2: Write the failing hook test**

Create `lib/editor/app/useTransientHint.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTransientHint } from './useTransientHint';

const MSG = { text: 'End of the source.', severity: 'info' as const };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useTransientHint', () => {
  it('holds the message until released, then clears after the delay', () => {
    const { result } = renderHook(() => useTransientHint(1500));
    act(() => result.current.publish(MSG));
    expect(result.current.hint).toEqual(MSG);

    // A drag that keeps pushing must not blink the message off.
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.hint).toEqual(MSG);

    act(() => result.current.release());
    act(() => vi.advanceTimersByTime(1499));
    expect(result.current.hint).toEqual(MSG);
    act(() => vi.advanceTimersByTime(2));
    expect(result.current.hint).toBeNull();
  });

  it('re-publishing the same text does not re-set state', () => {
    const { result } = renderHook(() => useTransientHint(1500));
    act(() => result.current.publish(MSG));
    const first = result.current.hint;
    act(() => result.current.publish({ ...MSG }));
    // Same content ⇒ same object identity, so a memoized consumer does not
    // re-render on every pointer move of a drag held at the bound.
    expect(result.current.hint).toBe(first);
  });

  it('publishing null clears immediately — a freed handle owes no message', () => {
    const { result } = renderHook(() => useTransientHint(1500));
    act(() => result.current.publish(MSG));
    act(() => result.current.publish(null));
    expect(result.current.hint).toBeNull();
  });

  it('a new message replaces the old one and restarts the countdown', () => {
    const { result } = renderHook(() => useTransientHint(1500));
    act(() => result.current.publish(MSG));
    act(() => result.current.release());
    act(() => vi.advanceTimersByTime(1000));
    const NEXT = { text: 'Minimum clip length reached.', severity: 'info' as const };
    act(() => result.current.publish(NEXT));
    act(() => vi.advanceTimersByTime(1400));
    expect(result.current.hint).toEqual(NEXT); // the old countdown did not kill it
  });
});
```

- [ ] **Step 3: Run it and confirm it FAILS**

```bash
cd lib/editor && npx vitest run app/useTransientHint.test.ts
```

- [ ] **Step 4: Write the hook**

`lib/editor/app/useTransientHint.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { HintMessage } from './block-reason-copy';

/** Transient message state for the timeline bar.
 *
 *  Two properties are load-bearing:
 *  - IDENTITY: re-publishing the same text keeps the SAME object, so a drag
 *    held against a bound (which fires on every pointer move) does not
 *    re-render the memoized timeline dozens of times per second.
 *  - LATCH: the message stays up while the gesture continues and only starts
 *    its countdown on `release`, so it cannot blink between move events. */
export function useTransientHint(clearAfterMs = 1500) {
  const [hint, setHint] = useState<HintMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancel, []);

  const publish = useCallback((next: HintMessage | null) => {
    cancel();
    setHint((cur) => {
      if (next === null) return null;
      if (cur && cur.text === next.text && cur.severity === next.severity) return cur; // identity
      return next;
    });
  }, []);

  const hold = useCallback(cancel, []);

  const release = useCallback(() => {
    cancel();
    timer.current = setTimeout(() => setHint(null), clearAfterMs);
  }, [clearAfterMs]);

  return { hint, publish, hold, release };
}
```

- [ ] **Step 5: Run the hook test — expect PASS**

- [ ] **Step 6: Wire the timeline**

In `LayeredTimeline.tsx`: add `onHint?: (hint: HintMessage | null) => void` to the props, and in
the resize handlers publish the reason. `onActionResizeStart` already resolves the item and the
bound; keep a ref to the item + decoded cap for the active resize, then:

```tsx
          onActionResizing={({ action, start, end, dir }) => {
            const { lane, id } = parseActionId(action.id);
            const tolMs = 1000 / fps;
            const posMs = (dir === 'left' ? start : end) * 1000;
            const edge = dir === 'left' ? 'in' : 'out';
            if (lane === 'music') {
              onHint?.(reasonHint(musicBlockReason({ edge, posMs, maxMs: musicMaxMs, tolMs })));
              return;
            }
            const item = reel.tracks.video.find((v) => v.id === id);
            if (!item) return;
            onHint?.(reasonHint(edgeBlockReason({ item, decodedMs: capMsById[id], edge, posMs, tolMs })));
          }}
```

with a tiny local `const reasonHint = (r: BlockReason | null) => (r ? hintForReason(r) : null);`.
`onActionResizeEnd` calls `onHint?.(null)` — no: it must call the host's `release()`, so the
message survives the release for a moment. Pass a second prop `onHintRelease?: () => void` and
call it there, OR (preferred, fewer props) let the host wrap: `onHint` publishes, and the host
starts the countdown itself when it next receives `null`. **Choose one, implement it, and say in
your report which and why.**

- [ ] **Step 7: Own the state in the host**

In `EditorHost.tsx`:

```tsx
  const { hint, publish: publishHint, release: releaseHint } = useTransientHint();
  // STABLE — LayeredTimeline is memoized and re-renders every playhead frame;
  // an inline lambda here would defeat the memo (see EditorHostOptions.meta).
  const handleHint = useCallback(
    (next: HintMessage | null) => (next ? publishHint(next) : releaseHint()),
    [publishHint, releaseHint],
  );
```

and pass `hint={hint} onHint={handleHint}` to `<LayeredTimeline …>`.

- [ ] **Step 8: Write the host-level test**

Append to `lib/editor/app/EditorHost.test.tsx`, inside the mocked-timeline `describe` (it captures
props into `seenTimelineProps`):

```tsx
it('shows the timeline’s hint, and clears it after the gesture ends', async () => {
  vi.useFakeTimers();
  const { EditorHost: Host } = await import('../host/EditorHost');
  render(<Host {...opts} />);
  await waitFor(() => expect(seenTimelineProps.length).toBeGreaterThan(0));

  act(() => seenTimelineProps.at(-1).onHint({ text: 'End of the source.', severity: 'info' }));
  expect(seenTimelineProps.at(-1).hint).toEqual({ text: 'End of the source.', severity: 'info' });

  act(() => seenTimelineProps.at(-1).onHint(null));
  act(() => vi.advanceTimersByTime(2000));
  expect(seenTimelineProps.at(-1).hint).toBeNull();
  vi.useRealTimers();
});

it('passes a STABLE onHint — the memoized timeline must not re-render on it', async () => {
  const { EditorHost: Host } = await import('../host/EditorHost');
  render(<Host {...opts} />);
  await waitFor(() => expect(seenTimelineProps.length).toBeGreaterThan(1));
  const first = seenTimelineProps[0].onHint;
  expect(seenTimelineProps.at(-1).onHint).toBe(first);
});
```

Prove the stability case RED by temporarily passing an inline lambda instead of `handleHint`.

- [ ] **Step 9: Run the suites**

```bash
cd lib/editor && npx vitest run app/useTransientHint.test.ts app/EditorHost.test.tsx app/LayeredTimeline.test.tsx
```

- [ ] **Step 10: Commit**

```bash
git add lib/editor/app/useTransientHint.ts lib/editor/app/useTransientHint.test.ts lib/editor/app/LayeredTimeline.tsx lib/editor/host/EditorHost.tsx lib/editor/app/EditorHost.test.tsx
git commit -m "feat(editor): say why a handle stopped, while it is stopped"
```

---

### Task 4: The transition Length cap — the one the user cannot guess

**Files:**
- Modify: `lib/editor/app/LayeredInspector.tsx` (~1706, the Length slider's `maxFrames`)
- Test: `lib/editor/app/LayeredInspector.test.tsx`

**Interfaces:**
- Consumes: `hintForReason('transition-handle-starved')` (Task 2), the inspector's existing
  `maxTransitionFrames(roomOf(idx), roomOf(idx + 1), …)` bound.
- Produces: nothing new — the inspector gains an `onHint` prop with the same signature the
  timeline uses.

- [ ] **Step 1: Write the failing test**

Append to `lib/editor/app/LayeredInspector.test.tsx` (that file renders `<LayeredInspector …/>`
directly against fixtures — read the transition cases near the top for the shape, and reuse the
fixture whose neighbours have a known decoded duration):

```tsx
it('explains a transition length that cannot grow — the neighbour has nothing to lend', () => {
  const onHint = vi.fn();
  // A reel whose next clip has no spare source: maxTransitionFrames pins the
  // slider, and the fix ("trim it back or shift the window") is not derivable
  // from the control itself.
  render(
    <LayeredInspector reel={starvedReel} selectedId="transition:v1" onChange={() => {}}
      onSeek={() => {}} fps={30} onHint={onHint} />);

  fireEvent.change(screen.getByLabelText(/Length/i), { target: { value: '999' } });

  expect(onHint).toHaveBeenCalledWith(expect.objectContaining({ severity: 'warn' }));
  expect(onHint.mock.calls.at(-1)[0].text.toLowerCase()).toMatch(/lend|trim|shift/);
});
```

Build `starvedReel` from the file's existing transition fixture by giving the neighbouring clip a
`sourceInMs`/`sourceOutMs` that leaves no room; if the fixture makes that awkward, state what you
changed and why in the report rather than weakening the assertion.

- [ ] **Step 2: Run it, confirm FAIL, implement, confirm PASS**

```bash
cd lib/editor && npx vitest run app/LayeredInspector.test.tsx
```

Add `onHint?: (hint: HintMessage | null) => void` to the inspector's props, and where the Length
slider commits a value, publish when the requested value exceeds `maxFrames`. Then pass
`onHint={handleHint}` to `<LayeredInspector …>` in `EditorHost.tsx` — the same stable callback the
timeline gets.

- [ ] **Step 3: Commit**

```bash
git add lib/editor/app/LayeredInspector.tsx lib/editor/app/LayeredInspector.test.tsx lib/editor/host/EditorHost.tsx
git commit -m "feat(editor): explain a transition length the neighbours cannot afford"
```

---

### Task 5: Gates and docs

- [ ] **Step 1: Full editor suite**

```bash
cd lib/editor && npx vitest run --no-file-parallelism > /tmp/hint-gate.log 2>&1; echo "exit=$?"; tail -6 /tmp/hint-gate.log
```

Redirect, never pipe through `tee`.

- [ ] **Step 2: Types, by IDENTITY**

```bash
cd lib/editor && npx tsc --noEmit ; echo "exit=$?"
```

Expected: exit 2, exactly the three known errors (`LayeredInspector.tsx` `hide`,
`derive-layered.test.ts:292` `CutConfig`, `../theming/envelope.test.ts:1` missing vitest types).
A fourth is this branch's.

- [ ] **Step 3: The other cheap gates**

```bash
cd examples/layered-minimal && npm run typecheck
grep -riE 'lime|teal|roost|progresivn|sand-brown' lib/ --exclude-dir=node_modules --exclude='*.test.*'
cd lib/editor && npx vitest run src/editor-css.test.ts
```

Expected: 0 errors; exactly 2 grep hits; CSS test green.

- [ ] **Step 4: Pixel harness — SKIP, with the reason stated**

Nothing here touches a transition kind, presentation or effect axis. Say so explicitly in the
report; do not omit it silently.

- [ ] **Step 5: Re-derive the CLAUDE.md gate row**

From your own measured run, with the arithmetic stated per commit. Never copy a number — that row
has drifted eight times.

- [ ] **Step 6: Point the spec at the implementation**

In `docs/superpowers/specs/2026-08-04-editor-feedback-and-grading-design.md`, mark Feature 1 as
implemented, naming this plan, and note that ripple/overwrite deliberately has no reason code
because it does not block a drag.

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-08-04-editor-feedback-and-grading-design.md
git commit -m "docs: record the blocked-edit hint bar and re-derive the editor gate row"
```
