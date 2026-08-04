# Brand Lane Is Derived — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the brand lane's span a real derivation of the content end — recomputed on
every reel change — and remove the editor controls that pretended it was authored data.

**Architecture:** One pure function (`contentEndMs`) owns "where the content ends", shared by
`deriveLayered` (cut time) and by a new `withDerivedBrandSpan` normaliser (edit time). The
editor host applies that normaliser at its single reel-state choke point, so no adapter
operation has to know about brand items. `withTotalDuration` loses its brand re-pin heuristic —
with a real derivation in place, a second, contradicting rule is worse than none. The
inspector's brand panel becomes read-only, agreeing with the timeline, which already has
`brand` in `LOCKED_LANES`.

**Tech Stack:** TypeScript, React, Zod (pinned `3.22.3`), Remotion, vitest.

**Source spec:** `docs/superpowers/specs/2026-08-04-brand-lane-is-derived-design.md`

## Global Constraints

- **One layered model.** Everything reads `LayeredReel` and only `LayeredReel` (CLAUDE.md,
  "HARD RULE"). If a field is missing from the model, extend the model — never route around it.
- **Editor UI strings are English.** (Even though the project's conversations are in Czech.)
- **No brand vocabulary in `lib/`.** The brand-leak grep must keep returning exactly 2 hits.
- **`deriveLayered` runs at cut time only** — never inside a component.
- **Identity preservation is load-bearing.** `useHistory.set` short-circuits on `value === cur`,
  so any normaliser MUST return the same object reference when it changes nothing, or every
  no-op state write becomes an undo entry.
- **Measure, don't assume.** Every fix to a piece of arithmetic gets a test proven RED before
  the fix lands. Do not pipe gate commands through `tee` (that reports `tee`'s exit code).
- Commits: no `Co-Authored-By`. If signing fails, immediately re-run with `--no-gpg-sign`.

## File Structure

| File | Responsibility |
|---|---|
| `lib/reel-config-base/content-end.ts` (new) | `contentEndMs(video, fps)` — the single definition of where content ends, and `withDerivedBrandSpan(reel, fps)` — pins every brand item to `[0, contentEnd)`. Both pure; both identity-preserving where applicable. |
| `lib/reel-config-base/derive-layered.ts` (modify, ~400-420) | Stops computing the content end inline; calls `contentEndMs`. |
| `lib/reel-config-base/total-duration.ts` (modify, 21-33) | `withTotalDuration` becomes meta-only — the brand re-pin heuristic is deleted. |
| `lib/editor/host/EditorHost.tsx` (modify, 72, 171-179) | Wraps `useHistory`'s setter so every reel change is normalised, and normalises the reel loaded from `/props`. |
| `lib/editor/app/LayeredInspector.tsx` (modify, 1963-1974) | Brand panel: read-only derived span, no `TimecodeField`s. |
| `lib/editor/src/content-end.test.ts` (new) | Unit tests for both new functions. |
| `lib/editor/src/total-duration.test.ts` (modify) | The two brand-behaviour cases invert. |
| `lib/editor/app/LayeredInspector.test.tsx` (modify) | Brand panel offers no editable timing. |
| `lib/editor/app/EditorHost.test.tsx` (modify) | Host-level: a stale brand span is re-derived on load. (Note the path — the host component lives in `lib/editor/host/`, but its test sits in `lib/editor/app/`.) |

## Non-goals (deliberate, with reasons)

- **The brand repo's `CampaignBrandTrack` collapse is NOT fixed here.** Spec cause #1 names
  `projects/<name>/src/config/composition-theme.tsx` collapsing all brand items into one
  `Sequence` of `Math.max(...endMs)`. Once brand spans are derived, every brand item carries the
  *same* end, so `Math.max` returns exactly that end and the rendered picture is correct. Fixing
  the collapse would mean splitting `PersistentOverlay` into per-kind renderers, which changes
  the DOM of already-published reels and needs a visual check — real work, not a side effect of
  this plan. Task 5 *verifies* the rendered result is right; it does not restructure the brand.
- `defaultRenderBrandTrack` (`lib/theming/brand-track.tsx`) is core's correct contract and is
  not touched.

---

### Task 1: `contentEndMs` — one definition of where the content ends

**Files:**
- Create: `lib/reel-config-base/content-end.ts`
- Modify: `lib/reel-config-base/derive-layered.ts:400-419`
- Test: `lib/editor/src/content-end.test.ts` (new)

**Interfaces:**
- Consumes: `VideoItem` from `lib/reel-config-base/layered-schema`.
- Produces: `export function contentEndMs(video: readonly VideoItem[], fps: number): number | undefined`
  — the end (ms) of the last non-`outro` video item, minus that item's `transitionOut` overlap
  converted to ms. Returns `undefined` when the track has no non-outro item (caller decides the
  fallback). Task 2 consumes it.

- [ ] **Step 1: Write the failing test**

Create `lib/editor/src/content-end.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { contentEndMs } from '@video-toolkit/lib/reel-config-base/content-end';
import type { VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

const clip = (id: string, startMs: number, endMs: number, extra: Partial<VideoItem> = {}): VideoItem =>
  ({ id, kind: 'clip', startMs, endMs, source: `${id}.mp4`, sourceInMs: 0, sourceOutMs: endMs - startMs, ...extra }) as VideoItem;

describe('contentEndMs', () => {
  it('is the last item end when there is no outro', () => {
    expect(contentEndMs([clip('v1', 0, 5000), clip('v2', 5000, 12000)], 30)).toBe(12000);
  });

  it('ignores a trailing outro', () => {
    const outro = { id: 'o', kind: 'outro', startMs: 12000, endMs: 15000 } as unknown as VideoItem;
    expect(contentEndMs([clip('v1', 0, 12000), outro], 30)).toBe(12000);
  });

  it('subtracts the last content item transitionOut overlap', () => {
    const v = clip('v1', 0, 12000, { transitionOut: { kind: 'fade', frames: 15 } } as Partial<VideoItem>);
    const outro = { id: 'o', kind: 'outro', startMs: 12000, endMs: 15000 } as unknown as VideoItem;
    // 15 frames @ 30fps = 500ms
    expect(contentEndMs([v, outro], 30)).toBe(11500);
  });

  it('returns undefined when every item is an outro', () => {
    const outro = { id: 'o', kind: 'outro', startMs: 0, endMs: 3000 } as unknown as VideoItem;
    expect(contentEndMs([outro], 30)).toBeUndefined();
  });

  it('returns undefined for an empty track', () => {
    expect(contentEndMs([], 30)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it and confirm it FAILS**

```bash
cd lib/editor && npx vitest run src/content-end.test.ts
```

Expected: FAIL — cannot resolve `@video-toolkit/lib/reel-config-base/content-end`.

- [ ] **Step 3: Create the module**

`lib/reel-config-base/content-end.ts`:

```ts
import type { LayeredReel, VideoItem } from './layered-schema';

/** Where the CONTENT ends (ms) — the end of the last non-`outro` video item,
 *  minus that item's own `transitionOut` overlap, because the outro's stinger
 *  starts drawing that many frames early. This is the span the brand lane
 *  (watermark/disclaimer) covers: brand marks are hidden during the outro.
 *
 *  Returns `undefined` when there is no content at all (empty track, or every
 *  item is an outro) so the caller picks its own fallback rather than inheriting
 *  a silent 0.
 *
 *  `transitionOut` is read defensively (`frames` via an unknown cast) for the
 *  same reason `TransitionSchema` is shape-only: a brand may register a kind
 *  core has never seen. */
export function contentEndMs(video: readonly VideoItem[], fps: number): number | undefined {
  let last: VideoItem | undefined;
  for (let i = video.length - 1; i >= 0; i--) {
    if (video[i].kind !== 'outro') {
      last = video[i];
      break;
    }
  }
  if (!last) return undefined;
  const overlapFrames = Number((last.transitionOut as { frames?: unknown } | undefined)?.frames) || 0;
  const overlapMs = overlapFrames ? Math.round((overlapFrames / fps) * 1000) : 0;
  return last.endMs - overlapMs;
}
```

- [ ] **Step 4: Run the test — expect PASS**

```bash
cd lib/editor && npx vitest run src/content-end.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Rewire `deriveLayered` to the shared function**

In `lib/reel-config-base/derive-layered.ts`, add to the imports at the top:

```ts
import { contentEndMs as computeContentEndMs } from './content-end';
```

Then replace the inline block (currently lines ~400-419, the comment starting
"// Brand items (watermark/disclaimer) span CONTENT only" through the closing brace of
`if (lastNonOutroItem) { … }`) with:

```ts
  // Brand items (watermark/disclaimer) span CONTENT only — matching the old
  // composition, which wraps them in a Sequence of contentFrames (Σ non-outro
  // durations − the last content segment's transitionOut overlap), hiding them
  // during the outro stinger and its fade overlap. The rule itself lives in
  // content-end.ts because the EDITOR re-derives it on every change
  // (withDerivedBrandSpan) — two copies would drift.
  const contentEnd = computeContentEndMs(videoItems, fps) ?? totalMs;
```

and change the two brand items (currently lines ~442-443) to use it:

```ts
      brand: [
        { id: 'brand-watermark', kind: 'watermark', startMs: 0, endMs: contentEnd },
        { id: 'brand-disclaimer', kind: 'disclaimer', startMs: 0, endMs: contentEnd },
      ],
```

- [ ] **Step 6: Prove the extraction changed no behaviour**

```bash
cd lib/editor && npx vitest run src/derive-layered.test.ts src/derive-layered.pilot.test.ts src/content-end.test.ts
```

Expected: all PASS, no test edited. If a derive-layered test fails, the extraction is not
faithful — fix the extraction, do not edit the test.

- [ ] **Step 7: Commit**

```bash
git add lib/reel-config-base/content-end.ts lib/reel-config-base/derive-layered.ts lib/editor/src/content-end.test.ts
git commit -m "feat(reel-config): extract contentEndMs so cut and editor share one rule"
```

---

### Task 2: `withDerivedBrandSpan` — and `withTotalDuration` stops guessing

**Files:**
- Modify: `lib/reel-config-base/content-end.ts` (append)
- Modify: `lib/reel-config-base/total-duration.ts:21-33`
- Test: `lib/editor/src/content-end.test.ts` (append), `lib/editor/src/total-duration.test.ts`

**Interfaces:**
- Consumes: `contentEndMs` (Task 1), `computeTotalDurationMs` from `./total-duration`.
- Produces: `export function withDerivedBrandSpan(reel: LayeredReel, fps: number): LayeredReel`
  — returns a reel whose every brand item is `{ …item, startMs: 0, endMs: <content end> }`.
  Returns the SAME object reference when no brand item changes. Task 3 consumes it.

- [ ] **Step 1: Write the failing tests**

Append to `lib/editor/src/content-end.test.ts`:

```ts
import { withDerivedBrandSpan } from '@video-toolkit/lib/reel-config-base/content-end';
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';

function reel(tracks: Partial<LayeredReel['tracks']> = {}, totalMs = 15000): LayeredReel {
  return {
    version: 'layered-1',
    meta: { topic: 'T', totalDurationMs: totalMs },
    tracks: {
      video: [
        clip('v1', 0, 12000),
        { id: 'o', kind: 'outro', startMs: 12000, endMs: 15000 } as unknown as VideoItem,
      ],
      audio: [],
      music: { baseVolumeDb: -8 },
      overlays: [],
      brand: [
        { id: 'brand-watermark', kind: 'watermark', startMs: 0, endMs: 12000 },
        { id: 'brand-disclaimer', kind: 'disclaimer', startMs: 0, endMs: 12000 },
      ],
      ...tracks,
    },
  };
}

describe('withDerivedBrandSpan', () => {
  it('returns the same object when the brand span is already correct', () => {
    const r = reel();
    expect(withDerivedBrandSpan(r, 30)).toBe(r);
  });

  it('re-pins a stale brand end to the content end', () => {
    const r = reel({
      brand: [
        { id: 'brand-watermark', kind: 'watermark', startMs: 0, endMs: 34000 },
        { id: 'brand-disclaimer', kind: 'disclaimer', startMs: 0, endMs: 41667 },
      ],
    });
    const next = withDerivedBrandSpan(r, 30);
    expect(next.tracks.brand.map((b) => b.endMs)).toEqual([12000, 12000]);
  });

  it('overrides a deliberately shorter brand span — the lane is derived, not authored', () => {
    const r = reel({ brand: [{ id: 'brand-watermark', kind: 'watermark', startMs: 0, endMs: 3000 }] });
    expect(withDerivedBrandSpan(r, 30).tracks.brand[0].endMs).toBe(12000);
  });

  it('forces a non-zero brand start back to 0', () => {
    const r = reel({ brand: [{ id: 'brand-watermark', kind: 'watermark', startMs: 2000, endMs: 12000 }] });
    const b = withDerivedBrandSpan(r, 30).tracks.brand[0];
    expect([b.startMs, b.endMs]).toEqual([0, 12000]);
  });

  it('shrinks the brand span when the last content clip is trimmed', () => {
    const r = reel({
      video: [
        clip('v1', 0, 9000),
        { id: 'o', kind: 'outro', startMs: 9000, endMs: 12000 } as unknown as VideoItem,
      ],
    });
    expect(withDerivedBrandSpan(r, 30).tracks.brand[0].endMs).toBe(9000);
  });

  it('falls back to the computed total when the reel is all outro', () => {
    const r = reel({
      video: [{ id: 'o', kind: 'outro', startMs: 0, endMs: 3000 } as unknown as VideoItem],
      brand: [{ id: 'brand-watermark', kind: 'watermark', startMs: 0, endMs: 99000 }],
    });
    expect(withDerivedBrandSpan(r, 30).tracks.brand[0].endMs).toBe(3000);
  });

  it('preserves every other field on the brand item', () => {
    const r = reel({ brand: [{ id: 'brand-watermark', kind: 'watermark', startMs: 0, endMs: 1, props: { displayMode: 'corner' } }] });
    expect(withDerivedBrandSpan(r, 30).tracks.brand[0].props).toEqual({ displayMode: 'corner' });
  });
});
```

Also edit `lib/editor/src/total-duration.test.ts` — the brand assertions there encode the
heuristic this task deletes:

1. In `it('updates meta and re-pins full-span brand items to the new end', …)` — rename to
   `it('updates meta and leaves brand items alone (their span is derived elsewhere)', …)` and
   change `expect(next.tracks.brand[0].endMs).toBe(8000)` to `.toBe(10000)` (the fixture's brand
   end, now untouched).
2. Delete `it('leaves deliberately shorter brand items alone', …)` entirely — "deliberately
   shorter" is no longer a thing a brand item can be; `withDerivedBrandSpan` covers the
   replacement claim.
3. In `it('extends the total when a music bed reaches past the content', …)` change
   `expect(next.tracks.brand[0].endMs).toBe(13000)` to `.toBe(10000)`.

- [ ] **Step 2: Run both files and confirm they FAIL**

```bash
cd lib/editor && npx vitest run src/content-end.test.ts src/total-duration.test.ts
```

Expected: `content-end.test.ts` fails on the missing `withDerivedBrandSpan` export;
`total-duration.test.ts` fails on the three re-pin assertions (proving the heuristic is live
and the tests are not vacuous).

- [ ] **Step 3: Append the normaliser**

To `lib/reel-config-base/content-end.ts`:

```ts
import { computeTotalDurationMs } from './total-duration';

/** Pin every brand item to the derived content span `[0, contentEnd)`.
 *
 *  The brand lane is DERIVED, not authored: the watermark and disclaimer cover
 *  the content and stop before the outro. Nothing may author a different span —
 *  the editor offers no control for it (LayeredInspector's brand panel is
 *  read-only) and the timeline has `brand` in LOCKED_LANES. This is the function
 *  that makes that true after every edit; without it a trim of the last content
 *  clip leaves the brand end where it was.
 *
 *  Identity-preserving: returns the SAME reel when no brand item moves, because
 *  `useHistory.set` short-circuits on reference equality and a fresh object on
 *  every no-op write would mint an undo entry per keystroke. */
export function withDerivedBrandSpan(reel: LayeredReel, fps: number): LayeredReel {
  const endMs = contentEndMs(reel.tracks.video, fps) ?? computeTotalDurationMs(reel);
  let changed = false;
  const brand = reel.tracks.brand.map((b) => {
    if (b.startMs === 0 && b.endMs === endMs) return b;
    changed = true;
    return { ...b, startMs: 0, endMs };
  });
  if (!changed) return reel;
  return { ...reel, tracks: { ...reel.tracks, brand } };
}
```

- [ ] **Step 4: Delete the heuristic from `withTotalDuration`**

Replace `lib/reel-config-base/total-duration.ts:21-33` with:

```ts
// Recompute meta.totalDurationMs from the tracks. Brand items are NOT touched
// here: their span is derived from the CONTENT end (which excludes the outro),
// not from the total, so the old "re-pin anything sitting exactly at the old
// total" heuristic could only ever be right by coincidence — and silently did
// nothing on every reel that has an outro. `withDerivedBrandSpan`
// (content-end.ts) owns the brand span now; the editor host applies it on every
// change. Returns the same object when nothing changes, so callers can hand it
// straight to React state.
export function withTotalDuration(reel: LayeredReel): LayeredReel {
  const totalMs = computeTotalDurationMs(reel);
  if (totalMs === reel.meta.totalDurationMs) return reel;
  return { ...reel, meta: { ...reel.meta, totalDurationMs: totalMs } };
}
```

- [ ] **Step 5: Run the tests — expect PASS**

```bash
cd lib/editor && npx vitest run src/content-end.test.ts src/total-duration.test.ts
```

Expected: both files fully green (12 cases in `content-end.test.ts`, `total-duration.test.ts`
one case shorter than before).

- [ ] **Step 6: Run the adapter suite — nothing there may regress**

```bash
cd lib/editor && npx vitest run src/timeline/ --no-file-parallelism
```

Expected: PASS. If an adapter test asserted a brand end that came from the deleted heuristic,
that assertion was testing the coincidence; re-point it at `withDerivedBrandSpan` semantics and
say so in the commit message.

- [ ] **Step 7: Commit**

```bash
git add lib/reel-config-base/content-end.ts lib/reel-config-base/total-duration.ts lib/editor/src/content-end.test.ts lib/editor/src/total-duration.test.ts
git commit -m "feat(reel-config): derive the brand span, and stop guessing it in withTotalDuration"
```

---

### Task 3: The host normalises every reel change

**Files:**
- Modify: `lib/editor/host/EditorHost.tsx:72` (setter wrapper), `:171-179` (load path)
- Test: `lib/editor/app/EditorHost.test.tsx`

**Interfaces:**
- Consumes: `withDerivedBrandSpan(reel, fps)` (Task 2).
- Produces: nothing new for later tasks — behaviour only.

- [ ] **Step 1: Write the failing test**

`lib/editor/app/EditorHost.test.tsx` already has a nested `describe` whose `beforeEach` mocks
`../app/LayeredTimeline` and pushes each render's props into `seenTimelineProps` (see the
`passes reel.meta.guidesMs through to LayeredTimeline` case for the pattern: override the
`/props` fetch, render, wait, then read `seenTimelineProps.at(-1)`). Add this case **inside
that same describe**, so the mock and its `afterEach` `doUnmock` apply:

```tsx
it('re-derives a stale brand span from the content end on load', async () => {
  // The reported bug, as data: the watermark's authored end (34000) outlives
  // the content, which ends at 12000 — the outro runs 12000→15000 and brand
  // marks must not draw over it.
  const stale = {
    ...REEL,
    meta: { ...REEL.meta, totalDurationMs: 15000 },
    tracks: {
      ...REEL.tracks,
      video: [
        { id: 'seg-001', kind: 'clip', startMs: 0, endMs: 12000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 12000 },
        { id: 'outro', kind: 'outro', startMs: 12000, endMs: 15000 },
      ],
      brand: [
        { id: 'brand-watermark', kind: 'watermark', startMs: 0, endMs: 34000 },
        { id: 'brand-disclaimer', kind: 'disclaimer', startMs: 0, endMs: 41667 },
      ],
    },
  } as unknown as LayeredReel;
  (globalThis.fetch as any).mockImplementation(async (url: string) =>
    String(url).startsWith('/props') ? { ok: true, json: async () => ({ reel: stale }) } : { ok: true, json: async () => ({}) },
  );
  const { EditorHost: Host } = await import('../host/EditorHost');
  render(<Host {...opts} />);

  await waitFor(() => expect(seenTimelineProps.length).toBeGreaterThan(0));
  expect(seenTimelineProps.at(-1).reel.tracks.brand.map((b: { endMs: number }) => b.endMs)).toEqual([12000, 12000]);
});
```

- [ ] **Step 2: Run it and confirm it FAILS**

```bash
cd lib/editor && npx vitest run app/EditorHost.test.tsx
```

Expected: FAIL, brand end still 34000.

- [ ] **Step 3: Wrap the setter**

In `lib/editor/host/EditorHost.tsx`, add the import:

```ts
import { withDerivedBrandSpan } from '@video-toolkit/lib/reel-config-base/content-end';
```

Change line 72 to take the raw setter, and add the normalising wrapper right below it:

```ts
  const {
    state: reel,
    set: setReelRaw,
    undo,
    redo,
    reset: resetHistory,
    canUndo,
    canRedo,
  } = useHistory<LayeredReel | null>(null);
  // THE choke point for the derived brand lane. Every reel mutation in the
  // editor — adapter ops, inspector patches, delete/split/duplicate — funnels
  // through this setter, so normalising here means no individual operation has
  // to know brand items exist (and none of them carry `fps` anyway). Identity
  // is preserved by `withDerivedBrandSpan`, so a no-op edit still short-circuits
  // in `useHistory` instead of minting an undo step.
  const setReel = useCallback(
    (next: LayeredReel | null | ((prev: LayeredReel | null) => LayeredReel | null)) =>
      setReelRaw((prev) => {
        const value = typeof next === 'function' ? next(prev) : next;
        return value ? withDerivedBrandSpan(value, fps) : value;
      }),
    [setReelRaw, fps],
  );
```

- [ ] **Step 4: Normalise on load too**

At `lib/editor/host/EditorHost.tsx:171-179`, replace the `.then` body with:

```ts
      .then((data) => {
        // Normalise on load as well as on change: a Root.tsx literal written
        // before the brand span was derived carries a stale end, and the user
        // would otherwise see the old span until their first unrelated edit.
        // `savedReel` gets the SAME normalised reel deliberately — the
        // correction is a derivation, not the user's edit, and flagging the
        // editor dirty the instant it opens would be noise.
        const r = withDerivedBrandSpan((data as { reel: LayeredReel }).reel, fps);
        resetHistory(r);
        setSavedReel(r);
      })
```

Add `fps` to that `useEffect`'s dependency array (it is currently `[]`).

- [ ] **Step 5: Run the test — expect PASS**

```bash
cd lib/editor && npx vitest run app/EditorHost.test.tsx app/EditorHost-zoom.test.tsx app/EditorShell.test.tsx host/
```

Expected: PASS, including the pre-existing host tests.

- [ ] **Step 6: Commit**

```bash
git add lib/editor/host/EditorHost.tsx lib/editor/app/EditorHost.test.tsx
git commit -m "feat(editor): re-derive the brand span on every reel change and on load"
```

---

### Task 4: The inspector stops offering an edit it cannot honour

**Files:**
- Modify: `lib/editor/app/LayeredInspector.tsx:1963-1974`
- Test: `lib/editor/app/LayeredInspector.test.tsx`

**Interfaces:**
- Consumes: nothing new. Reuses `readonlyValueCls` / `fieldCls` / `labelCls` / `formatTimecode`,
  all already in `LayeredInspector.tsx` (see the no-selection Reel panel, ~line 980-1010, for
  the established read-only pattern).
- Produces: nothing for later tasks.

- [ ] **Step 1: Write the failing test**

Append to `lib/editor/app/LayeredInspector.test.tsx`. That file has no render helper — every
case renders `<LayeredInspector … />` directly against the module-level `base` fixture (whose
`brand` is `[]`), so give this one its own fixture:

```tsx
describe('LayeredInspector brand panel', () => {
  const brandReel: LayeredReel = {
    ...base,
    tracks: { ...base.tracks, brand: [{ id: 'brand-watermark', kind: 'watermark', startMs: 0, endMs: 2000 }] },
  };

  it('shows the derived span read-only and offers no timing inputs', () => {
    const { container } = render(
      <LayeredInspector reel={brandReel} selectedId="brand:brand-watermark" onChange={() => {}} onSeek={() => {}} fps={30} />);
    // The panel's whole point: nothing on it is editable.
    expect(container.querySelectorAll('input')).toHaveLength(0);
    expect(container.textContent).toContain('Derived');
    // The values are still shown, just not as fields.
    expect(container.textContent).toContain('Start');
    expect(container.textContent).toContain('End');
  });
});
```

- [ ] **Step 2: Run it and confirm it FAILS**

```bash
cd lib/editor && npx vitest run app/LayeredInspector.test.tsx
```

Expected: FAIL — two `TimecodeField` inputs are present.

- [ ] **Step 3: Replace the brand panel body**

In `lib/editor/app/LayeredInspector.tsx`, replace the brand `return` block (currently
lines ~1966-1974) with:

```tsx
  return (
    <div className={panelCls}>
      <h3 className={headingCls}>Brand · {b.kind}</h3>
      {/* Read-only ON PURPOSE. The brand lane's span is derived from the content
          end (see withDerivedBrandSpan) — the timeline already has `brand` in
          LOCKED_LANES, and an editable field here would be a control that cannot
          change the output, which is worse than no control at all. */}
      <Row>
        <div className={fieldCls}>
          <label className={`${labelCls} ed:block ed:mb-1`}>Start</label>
          <div className={readonlyValueCls}>{formatTimecode(b.startMs, fps)}</div>
        </div>
        <div className={fieldCls}>
          <label className={`${labelCls} ed:block ed:mb-1`}>End</label>
          <div className={readonlyValueCls}>{formatTimecode(b.endMs, fps)}</div>
        </div>
      </Row>
      <div className="ed:text-[11px] ed:text-ink-2 ed:mt-2">
        Derived: brand marks cover the content and stop before the outro. Trim the last content clip to change this.
      </div>
    </div>
  );
```

Verify `formatTimecode`, `readonlyValueCls`, `fieldCls` and `labelCls` are already in scope in
this file (they are used by the Reel panel above); import nothing new.

- [ ] **Step 4: Run the test — expect PASS**

```bash
cd lib/editor && npx vitest run app/LayeredInspector.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Rebuild the editor CSS if any class is new**

The panel above introduces no class the file does not already use, so this should be a no-op —
but the CSS staleness gate is byte-exact, so prove it:

```bash
cd lib/editor && npm run editor:css && git diff --exit-code app/editor.css && npx vitest run src/editor-css.test.ts
```

Expected: no diff, test PASS. If `editor.css` did change, commit it with this task.

- [ ] **Step 6: Commit**

```bash
git add lib/editor/app/LayeredInspector.tsx lib/editor/app/LayeredInspector.test.tsx
git commit -m "fix(editor): show the brand span read-only instead of offering a dead edit"
```

---

### Task 5: Gates, and verify the rendered picture

**Files:**
- Modify: `CLAUDE.md` (the Quality Gates table's editor-tests row, and the typecheck row if its
  identity set moved)
- Modify: `docs/superpowers/specs/2026-08-04-brand-lane-is-derived-design.md` (status line)

- [ ] **Step 1: Full editor suite**

```bash
cd lib/editor && npx vitest run --no-file-parallelism > /tmp/editor-gate.log 2>&1; echo "exit=$?"; tail -20 /tmp/editor-gate.log
```

Redirect, never `| tee` — `tee` reports its own exit code. Record files/tests/passed/skipped
exactly as printed.

- [ ] **Step 2: Typecheck, by IDENTITY not count**

```bash
cd lib/editor && npx tsc --noEmit ; echo "exit=$?"
```

Expected: exit 2 with exactly the three known errors — `LayeredInspector.tsx` `hide` (the line
number drifts, and WILL drift again from Task 4's edit — same error, same identity),
`derive-layered.test.ts:292` `CutConfig`, `../theming/envelope.test.ts:1` missing vitest types.
A fourth error means this plan introduced it.

- [ ] **Step 3: Core typecheck gate**

```bash
cd examples/layered-minimal && npm run typecheck
```

Expected: 0 errors. The coverage guard counts files under `lib/render` / `lib/transitions` /
`lib/theming` / `lib/reel-config-base` / `lib/transcripts`; this plan ADDS one file to
`reel-config-base` (10 → 11), which the guard (a floor) accepts. Report the new number.

- [ ] **Step 4: Brand-leak grep**

```bash
grep -riE 'lime|teal|roost|progresivn|sand-brown' lib/ --exclude-dir=node_modules --exclude='*.test.*'
```

Expected: exactly 2 hits (both comments).

- [ ] **Step 5: Pixel harness — skip, with the reason stated**

Nothing in this plan touches a transition kind, a presentation, or an effect axis; the brand
lane is not part of the transition matrix. Skip `pixel-gate:strict` and say so explicitly in
the task report rather than silently omitting it.

- [ ] **Step 6: Verify the rendered picture, not just the types**

The spec's "must not break" list requires a visual check. In the progpce brand repo
(`/Users/xaralis/Workspace/progpce/video-toolkit`), on a project with an outro, confirm the
watermark and disclaimer both stop before the outro and neither draws over it. NOTE the brand
repo state rule: `projects/pp-u-kamenne-vily` is being edited by the user right now — **never
save from the editor there, always Discard after checking**, and do not commit its
`package-lock.json` / `transcript.json` churn.

This needs the submodule pointed at the new core commits — after pushing:

```bash
git -C toolkit fetch /Users/xaralis/Workspace/progpce/core <branch> && git -C toolkit checkout <sha> && git -C toolkit log --oneline -1
```

- [ ] **Step 7: Update the CLAUDE.md gate row from the MEASURED numbers**

Re-derive; never carry a prior figure forward. The row's own history says it has drifted seven
times. State the arithmetic: prior count + this plan's additions (Task 1: 5, Task 2: 7 added
minus 1 deleted in total-duration, Task 3: 1, Task 4: 1) and confirm it closes against Step 1's
printed total. If it does not close, trust the measurement and say the gap is unaccounted.

- [ ] **Step 8: Flip the spec's status**

In `docs/superpowers/specs/2026-08-04-brand-lane-is-derived-design.md`, change the status line
from "decided 2026-08-04, deferred" to implemented, naming this plan and the fact that spec
cause #1's brand-repo collapse was left in place deliberately (see Non-goals above).

- [ ] **Step 9: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-08-04-brand-lane-is-derived-design.md
git commit -m "docs: record the brand-lane derivation and re-derive the editor gate row"
```
