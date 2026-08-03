# Slip Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the editor move the media *inside* a clip while holding the clip's position and length on the timeline (Alt + drag), with live waveform and Player feedback.

**Architecture:** A fourth pure operation in the timeline's edit algebra — `slipVideoItem` beside `resizeVideoItem` in `layered-adapter.ts` — plus a thin pointer handler in `LayeredTimeline.tsx` that captures Alt+drag before xzdarcy sees it and re-derives the reel from a base snapshot on every move. Nothing else changes: the schema already carries `sourceInMs`/`sourceOutMs`, the render already honours them, and `Waveform` already slices peaks by `sourceInMs`.

**Tech Stack:** TypeScript, React, vitest + @testing-library/react, `@xzdarcy/react-timeline-editor`, Remotion Player.

**Spec:** `docs/superpowers/specs/2026-08-03-editor-slip-edit-design.md`

## Global Constraints

- **HARD RULE — one layered model.** Everything reads and writes `LayeredReel`. No second shape, no derive-at-render-time. (`CLAUDE.md`)
- **Editor UI strings are English**, even though the project is discussed in Czech.
- **Invariant to preserve:** `span == sourceOutMs − sourceInMs`. Slip shifts both source fields by the same delta and therefore keeps it.
- **Slippable kinds are `clip` and `broll` only.** `photo`/`card`/`outro` have no source window; `multi-clip` has one per sub-source and is out of scope.
- **Direction:** dragging right reveals EARLIER footage — `sourceInMs` decreases. Positive `dx` ⇒ negative delta.
- **Unknown footage length ⇒ no right bound**, matching `resizeBoundsMs` (`layered-adapter.ts:159`).
- **No beat snapping and no Escape-to-cancel in v1.**
- Commit messages: imperative mood, no `Co-Authored-By`. Sign with `--no-gpg-sign` if signing fails; never let signing block a commit.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `lib/editor/src/timeline/layered-adapter.ts` | The edit algebra. Gains `slipVideoItem` beside `resizeVideoItem`. | Modify (~40 lines added) |
| `lib/editor/src/timeline/layered-adapter.test.ts` | Adapter unit tests. Gains a `slipVideoItem` describe block. | Modify |
| `lib/editor/app/LayeredTimeline.tsx` | Timeline UI. Gains `slipDeltaMs` (exported pure helper), the pointer handlers, the cursor affordance, the legend entry. | Modify |
| `lib/editor/app/LayeredTimeline.test.tsx` | Timeline tests. Gains `slipDeltaMs` tests. | Modify |

No new files. The adapter is 590 lines and the timeline 745 — both already carry this kind of logic, and splitting either is out of scope for this feature.

---

### Task 1: The `slipVideoItem` operation

**Files:**
- Modify: `lib/editor/src/timeline/layered-adapter.ts` (add after `resizeVideoItem`, which ends at `:200`)
- Test: `lib/editor/src/timeline/layered-adapter.test.ts` (append a new `describe`)

**Interfaces:**
- Consumes: `LayeredReel`, `VideoItem`, `AudioItem` from `@video-toolkit/lib/reel-config-base/layered-schema` (already imported at `:1`).
- Produces:
  ```ts
  export function slipVideoItem(
    reel: LayeredReel,
    id: string,
    deltaMs: number,
    footageMsById?: Record<string, number>,
  ): LayeredReel
  ```
  Task 2 calls this with the timeline's existing `capMsById` as `footageMsById`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/editor/src/timeline/layered-adapter.test.ts`. Add `slipVideoItem` to the existing import from `./layered-adapter` on line 3.

```ts
// A clip with 1s of unused head and 1s of unused tail inside a 10s file:
// window [1000,4000] on the timeline span [0,3000].
const SLIP_REEL: LayeredReel = {
  version: 'layered-1',
  meta: { topic: 'Slip', totalDurationMs: 3000 },
  tracks: {
    video: [{ id: 'v1', kind: 'clip', startMs: 0, endMs: 3000, source: 'a.mp4', sourceInMs: 1000, sourceOutMs: 4000 }],
    audio: [],
    music: { baseVolumeDb: -8 },
    overlays: [],
    brand: [],
  },
};
const CAPS = { v1: 10000 }; // decoded footage length

const vid = (reel: LayeredReel) => reel.tracks.video[0] as Extract<VideoItem, { kind: 'clip' }>;

describe('slipVideoItem', () => {
  it('shifts the source window by the delta and leaves the timeline span untouched', () => {
    const out = vid(slipVideoItem(SLIP_REEL, 'v1', 500, CAPS));
    expect(out.sourceInMs).toBe(1500);
    expect(out.sourceOutMs).toBe(4500);
    expect(out.startMs).toBe(0);
    expect(out.endMs).toBe(3000);
  });

  it('preserves span == sourceOut - sourceIn', () => {
    const out = vid(slipVideoItem(SLIP_REEL, 'v1', -300, CAPS));
    expect(out.sourceOutMs - out.sourceInMs).toBe(out.endMs - out.startMs);
  });

  it('clamps left at -sourceInMs — nothing exists before the file start', () => {
    const out = vid(slipVideoItem(SLIP_REEL, 'v1', -5000, CAPS));
    expect(out.sourceInMs).toBe(0);
    expect(out.sourceOutMs).toBe(3000);
  });

  it('clamps right at the footage end when the length is known', () => {
    const out = vid(slipVideoItem(SLIP_REEL, 'v1', 9000, CAPS));
    expect(out.sourceOutMs).toBe(10000);
    expect(out.sourceInMs).toBe(7000);
  });

  it('applies no right bound when the footage length is unknown', () => {
    const out = vid(slipVideoItem(SLIP_REEL, 'v1', 9000, {}));
    expect(out.sourceOutMs).toBe(13000);
    expect(out.sourceInMs).toBe(10000);
  });

  it('gives a linked bed the same delta, on both source fields', () => {
    const reel: LayeredReel = {
      ...SLIP_REEL,
      tracks: {
        ...SLIP_REEL.tracks,
        audio: [{ id: 'a1', startMs: 0, endMs: 3000, source: 'a.mp3', sourceInMs: 2000, sourceOutMs: 5000, followsVideoId: 'v1' }],
      },
    };
    const out = slipVideoItem(reel, 'v1', 500, CAPS);
    expect(out.tracks.audio[0].sourceInMs).toBe(2500);
    expect(out.tracks.audio[0].sourceOutMs).toBe(5500);
  });

  // THE SYNC RULE. A bed with less headroom than the clip must limit the WHOLE
  // gesture: clamping each side separately would move picture and sound by
  // different amounts and desync them silently.
  it('limits the delta to the linked bed headroom so picture and sound never diverge', () => {
    const reel: LayeredReel = {
      ...SLIP_REEL,
      tracks: {
        ...SLIP_REEL.tracks,
        audio: [{ id: 'a1', startMs: 0, endMs: 3000, source: 'a.mp3', sourceInMs: 200, followsVideoId: 'v1' }],
      },
    };
    // The clip could go -1000; the bed only -200. Both must move -200.
    const out = slipVideoItem(reel, 'v1', -1000, CAPS);
    expect(vid(out).sourceInMs).toBe(800);
    expect(out.tracks.audio[0].sourceInMs).toBe(0);
  });

  it('leaves an unlinked bed alone', () => {
    const reel: LayeredReel = {
      ...SLIP_REEL,
      tracks: {
        ...SLIP_REEL.tracks,
        audio: [{ id: 'a1', startMs: 0, endMs: 3000, source: 'a.mp3', sourceInMs: 2000 }],
      },
    };
    const out = slipVideoItem(reel, 'v1', 500, CAPS);
    expect(out.tracks.audio[0].sourceInMs).toBe(2000);
  });

  it('is a no-op for kinds with no single source window', () => {
    const reel: LayeredReel = {
      ...SLIP_REEL,
      tracks: { ...SLIP_REEL.tracks, video: [{ id: 'p1', kind: 'photo', startMs: 0, endMs: 3000, source: 'a.jpg' }] },
    };
    expect(slipVideoItem(reel, 'p1', 500, {})).toBe(reel);
  });

  it('is a no-op for an unknown id', () => {
    expect(slipVideoItem(SLIP_REEL, 'nope', 500, CAPS)).toBe(SLIP_REEL);
  });

  // An authored sourceOutMs can overshoot the real file (drift). The right bound
  // is then BELOW the left one; slipping must refuse rather than move backwards.
  it('refuses to move when the bounds cross (authored out beyond the file)', () => {
    const reel: LayeredReel = {
      ...SLIP_REEL,
      tracks: { ...SLIP_REEL.tracks, video: [{ id: 'v1', kind: 'clip', startMs: 0, endMs: 3000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 3000 }] },
    };
    expect(slipVideoItem(reel, 'v1', 500, { v1: 2000 })).toBe(reel);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd lib/editor && npx vitest run src/timeline/layered-adapter.test.ts -t slipVideoItem
```

Expected: FAIL — `slipVideoItem is not a function` / TypeScript cannot resolve the import.

- [ ] **Step 3: Implement `slipVideoItem`**

Insert into `lib/editor/src/timeline/layered-adapter.ts` immediately after `resizeVideoItem` (after line `200`):

```ts
// SLIP: move the media INSIDE a clip's window while its position and length on
// the timeline stay put — the fourth operation in this algebra, beside move and
// the two trims. Both source fields shift by the same delta, so the adapter's
// `span == sourceOutMs - sourceInMs` invariant survives untouched.
//
// The delta is clamped ONCE, over the intersection of the clip's headroom and
// every LINKED bed's, and the result is applied to all of them. Clamping each
// party against its own file would shift picture and sound by different amounts
// and silently break the sync the link exists to guarantee. Left headroom is
// always known (`sourceInMs`); on the right an unknown footage length means NO
// bound, matching resizeBoundsMs above.
//
// KNOWN GAP: a linked bed contributes no RIGHT bound — the editor does not
// decode bed durations today, so slipping right can run a short bed past its
// own end (silence, not desync). Pass audio caps here when they exist.
export function slipVideoItem(
  reel: LayeredReel,
  id: string,
  deltaMs: number,
  footageMsById: Record<string, number> = {},
): LayeredReel {
  const item = reel.tracks.video.find((v) => v.id === id);
  if (!item || (item.kind !== 'clip' && item.kind !== 'broll')) return reel;

  const beds = reel.tracks.audio.filter((a) => a.followsVideoId === id);
  // Most-negative delta anyone can take (each party's own head), then the
  // least-generous of them.
  const minDelta = Math.max(-item.sourceInMs, ...beds.map((b) => -b.sourceInMs));
  const cap = footageMsById[id];
  const maxDelta = cap && cap > 0 ? cap - item.sourceOutMs : Infinity;
  if (maxDelta < minDelta) return reel; // bounds crossed (authored out past the file)

  const d = Math.min(Math.max(deltaMs, minDelta), maxDelta);
  if (d === 0) return reel;

  return {
    ...reel,
    tracks: {
      ...reel.tracks,
      video: reel.tracks.video.map((v) =>
        v.id === id && (v.kind === 'clip' || v.kind === 'broll')
          ? { ...v, sourceInMs: v.sourceInMs + d, sourceOutMs: v.sourceOutMs + d }
          : v,
      ),
      audio: reel.tracks.audio.map((a) =>
        a.followsVideoId === id
          ? {
              ...a,
              sourceInMs: a.sourceInMs + d,
              ...(a.sourceOutMs !== undefined ? { sourceOutMs: a.sourceOutMs + d } : {}),
            }
          : a,
      ),
    },
  };
}
```

Note `Math.max(-item.sourceInMs, ...beds.map(...))` — with no beds this is `Math.max(-sourceInMs)`, which is just that value. Correct, no special case needed.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd lib/editor && npx vitest run src/timeline/layered-adapter.test.ts -t slipVideoItem
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Typecheck**

```bash
cd lib/editor && npx tsc --noEmit ; echo "exit=$?"
```

Expected: the SAME 3 pre-existing errors as before the change (`LayeredInspector.tsx:1052`, `derive-layered.test.ts:277`, `../theming/envelope.test.ts:1`), `exit=2`. Compare by IDENTITY, not count. If a fourth error appears in `layered-adapter.ts`, it is yours — fix it.

- [ ] **Step 6: Commit**

```bash
git add lib/editor/src/timeline/layered-adapter.ts lib/editor/src/timeline/layered-adapter.test.ts
git commit --no-gpg-sign -m "feat(editor): slipVideoItem — shift a clip's source window in place"
```

---

### Task 2: The Alt+drag gesture

**Files:**
- Modify: `lib/editor/app/LayeredTimeline.tsx`
- Test: `lib/editor/app/LayeredTimeline.test.tsx`

**Interfaces:**
- Consumes: `slipVideoItem(reel, id, deltaMs, footageMsById)` from Task 1; the component's existing `capMsById` (`:316-333`), `scaleWidth` prop (`:234`, px per second), `playerRef` (`:230`), `onChange` (`:227`), and `parseActionId` (already imported from the adapter).
- Produces:
  ```ts
  export function slipDeltaMs(dxPx: number, scaleWidth: number): number
  ```
  Exported for tests, alongside the file's existing exported helpers (`colorFor`, `timelineLabel`, `audioUrl`, `videoUrl`).

- [ ] **Step 1: Write the failing test**

Append to `lib/editor/app/LayeredTimeline.test.tsx`, adding `slipDeltaMs` to the import on line 3.

```ts
// The sign is the whole point: dragging RIGHT pulls the film right inside its
// window, so EARLIER footage slides into view and sourceInMs DECREASES. Premiere
// and Resolve both work this way, and the inverted sign is the natural mistake.
describe('slipDeltaMs', () => {
  it('turns a rightward drag into a negative delta (reveals earlier footage)', () => {
    expect(slipDeltaMs(80, 80)).toBe(-1000);
  });

  it('turns a leftward drag into a positive delta (reveals later footage)', () => {
    expect(slipDeltaMs(-40, 80)).toBe(500);
  });

  it('scales with the zoom — the same pixels mean less time when zoomed in', () => {
    expect(slipDeltaMs(80, 160)).toBe(-500);
  });

  it('is zero for no movement', () => {
    expect(slipDeltaMs(0, 80)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd lib/editor && npx vitest run app/LayeredTimeline.test.tsx -t slipDeltaMs
```

Expected: FAIL — `slipDeltaMs is not a function`.

- [ ] **Step 3: Add the pure helper**

In `lib/editor/app/LayeredTimeline.tsx`, near the other module-level helpers (above the component, e.g. after the `gripState` helper around `:134`):

```ts
// px dragged → ms of source shift. NEGATED: dragging right pulls the media right
// inside a fixed window, so what precedes it slides into view (sourceInMs falls).
// Matches Premiere/Resolve. `scaleWidth` is px per second.
export function slipDeltaMs(dxPx: number, scaleWidth: number): number {
  return -(dxPx / scaleWidth) * 1000;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd lib/editor && npx vitest run app/LayeredTimeline.test.tsx -t slipDeltaMs
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Wire the gesture**

Import `slipVideoItem` from `../src/timeline/layered-adapter` alongside the existing `parseActionId` import.

Inside `LayeredTimelineImpl`, beside the other refs (`:271-274`):

```tsx
  // An in-flight slip. `base` is the reel as it was when the gesture STARTED, so
  // every move re-derives from it rather than accumulating — no drift, and the
  // clamp stays honest at the edges. History coalesces the stream of commits
  // into one undo step (useHistory.ts:5-8).
  const slipRef = useRef<{ id: string; x0: number; base: LayeredReel } | null>(null);
```

Then the three handlers, next to the other callbacks in the component body:

```tsx
  const beginSlip = (e: React.PointerEvent<HTMLDivElement>, actionId: string) => {
    if (!e.altKey) return;
    const { lane, id } = parseActionId(actionId);
    if (lane !== 'video') return;
    const item = reel.tracks.video.find((v) => v.id === id);
    if (!item || (item.kind !== 'clip' && item.kind !== 'broll')) return;
    // Keep xzdarcy out: without this it starts its own move on the same press.
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    slipRef.current = { id, x0: e.clientX, base: reel };
    // Feedback needs a live frame FROM THIS CLIP. If the playhead is already
    // inside it, leave it — the user chose that reference frame.
    const nowMs = ((playerRef.current?.getCurrentFrame() ?? 0) / fps) * 1000;
    if (nowMs < item.startMs || nowMs >= item.endMs) {
      playerRef.current?.seekTo(Math.round((item.startMs / 1000) * fps));
    }
  };

  const moveSlip = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = slipRef.current;
    if (!s) return;
    onChange(slipVideoItem(s.base, s.id, slipDeltaMs(e.clientX - s.x0, scaleWidth), capMsById));
  };

  const endSlip = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!slipRef.current) return;
    slipRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
```

Attach them to the action block `<div>` that starts at `:556` — add these props next to the existing `title={action.id}`:

```tsx
                onPointerDownCapture={(e) => beginSlip(e, action.id)}
                onPointerMove={moveSlip}
                onPointerUp={endSlip}
                onPointerCancel={endSlip}
```

- [ ] **Step 6: Run the full editor suite**

```bash
cd lib/editor && npx vitest run --no-file-parallelism
```

Expected: green. Re-derive the file/test counts from THIS run — the documented baseline is 112 files / 1818 tests, and Tasks 1-2 add 15 tests. **Do not copy a count forward; report what the run printed.**

- [ ] **Step 7: Typecheck**

```bash
cd lib/editor && npx tsc --noEmit ; echo "exit=$?"
```

Expected: the same 3 pre-existing errors by identity, `exit=2`.

- [ ] **Step 8: Verify by hand — this is the only check the gesture gets**

The wiring is not covered by any test (see the spec's Testing section). Run the editor in a brand repo, open a project with a trimmed clip, and confirm all five:

1. Alt+drag on a clip body moves the media; the clip does not move or resize.
2. Dragging right shows earlier footage.
3. A linked bed's waveform scrolls with it.
4. The Player shows a live frame throughout.
5. Plain drag (no Alt) still moves the clip as before.

- [ ] **Step 9: Commit**

```bash
git add lib/editor/app/LayeredTimeline.tsx lib/editor/app/LayeredTimeline.test.tsx
git commit --no-gpg-sign -m "feat(editor): alt+drag slips the shot inside its window"
```

---

### Task 3: Discoverability — cursor and legend

**Files:**
- Modify: `lib/editor/app/LayeredTimeline.tsx`

**Interfaces:**
- Consumes: everything from Task 2. Produces nothing new for later tasks.

- [ ] **Step 1: Track whether Alt is held**

The cursor can only change while the modifier is down, and CSS cannot see a modifier. Add beside the other effects in `LayeredTimelineImpl`:

```tsx
  // Alt held → slippable clips show they can be slipped. Window-level because
  // the key may be pressed before the pointer enters a block. `blur` clears it:
  // a tab switch swallows the keyup and would otherwise leave it stuck on.
  const [altHeld, setAltHeld] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.altKey) setAltHeld(true); };
    const up = (e: KeyboardEvent) => { if (!e.altKey) setAltHeld(false); };
    const clear = () => setAltHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, []);
```

- [ ] **Step 2: Apply the cursor**

In the action block `<div>`'s `style` object (`:556-570`), add as the last property so it wins:

```tsx
                  cursor: parseActionId(action.id).lane === 'video' && altHeld ? 'ew-resize' : undefined,
```

- [ ] **Step 3: Add the legend entry**

In the status line (`:723-737`), insert as the SECOND child — directly after the Ripple `<span>` that ends at `:727`, before the volume-line one. Position matters: the row is `whiteSpace: nowrap` with `overflow: hidden`, so a fifth entry clips from the right; placing slip beside Ripple groups the two clip-drag semantics and lets `⌫ delete · ⌘Z undo` be what gets cut on a narrow window.

```tsx
        <span>
          <span style={{ color: '#9a9a95' }}>⌥/Alt + drag a clip</span> — slip the shot inside its window
        </span>
```

- [ ] **Step 4: Run the editor suite and typecheck**

```bash
cd lib/editor && npx vitest run --no-file-parallelism
cd lib/editor && npx tsc --noEmit ; echo "exit=$?"
```

Expected: green; same 3 pre-existing type errors by identity, `exit=2`.

- [ ] **Step 5: Verify by hand**

Hold Alt over a clip — the cursor becomes `ew-resize`; release — it reverts. Switch tabs while holding Alt and come back: the cursor must NOT be stuck. The legend reads the new entry, and it survives narrowing the window before `⌫ delete` does.

- [ ] **Step 6: Commit**

```bash
git add lib/editor/app/LayeredTimeline.tsx
git commit --no-gpg-sign -m "feat(editor): the legend and cursor advertise alt+drag slip"
```

---

## Final gates

Run after Task 3, before calling the feature done.

```bash
cd lib/editor && npx vitest run --no-file-parallelism
cd lib/editor && npx tsc --noEmit ; echo "exit=$?"
cd examples/layered-minimal && npm run typecheck
grep -riE 'lime|teal|roost|progresivn|sand-brown' lib/ --exclude-dir=node_modules --exclude='*.test.*'
grep -n 'it\.fails' lib/editor/src/at-cut-transitions.test.tsx
```

| Gate | Expected |
|---|---|
| Editor tests | Green. **Re-derive the counts from the run** — baseline was 112 files / 1818 tests, this plan adds 15. Never carry a count forward. |
| Editor types | The same 3 pre-existing errors, by identity, `exit=2`. Read the exit code separately — a piped `grep -c` prints `0` when tsc crashes. |
| Render/transitions types | 0 errors. Unchanged by this work, but cheap. |
| Brand-leak grep | Exactly 2 hits, both comments. |
| `it.fails` guard | 0. |

**The pixel harness is deliberately skipped.** Slip touches no transition kind and no axis of the matrix, so its 300 stills (~45 s) would measure something that cannot have moved. Record the skip and its reason in the final report — as a decision, not an omission.

**Python `sync_template`** is untouched by editor work and is not run.
