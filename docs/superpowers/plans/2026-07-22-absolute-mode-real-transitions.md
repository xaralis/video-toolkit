# Real Transitions in Absolute Placement (model B — at-the-cut, handles) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Real transitions render at the cut using handle frames (Premiere/FCP model) — clips stay butted, sequence length unchanged — plus a derived at-the-cut Transitions lane in the editor with kind/direction/length editing.

**Architecture:** No derivation change (clips butted; `transitionOut` already on the outgoing clip). The composition renders each transition by extending both clips' render Sequences by ~N/2 into their handle frames over a window centered on the cut, driving the kind's `@remotion/transitions` presentation (exiting/entering). The editor derives a Transitions lane (verified in xzdarcy) from `transitionOut`.

**Tech Stack:** TypeScript, Vitest, Remotion + `@remotion/transitions`.

## Global Constraints

- Editor strings English; no `Co-Authored-By`; brand-repo commits use `-c commit.gpgsign=false` (user-authorized).
- Transitions are DERIVED — no schema change. `transitionOut = { kind, frames, direction?, color? }` on the outgoing clip; clips stay butted (`B.startMs === A.endMs`); sequence length unchanged.
- Alignment is center-at-cut. Window frames `[Tf − floor(N/2), Tf + ceil(N/2)]`, `Tf = msToFrames(cut)`, `cut = A.endMs`.
- Kind→presentation: dissolve/fade-coal→`fade()`; glitch→`glitch()`; whip-pan→`whipPan({direction})`; wipe→`wipe({color,direction})`; zoom-through→`zoomThrough({direction})`; cut/none→no transition.
- Handles: extend into source beyond trim; clamp per side to available handle frames, freeze if zero.
- In scope: render + derived lane (kind/direction/length edit). Deferred: alignment selector, drag-block-edge, drag-to-create.
- Core suite + `tsc` green at each task boundary. No `derive-layered.ts` change in this plan.

---

### Task 1: Adapter — derived at-the-cut Transitions lane

**Files:**
- Modify: `lib/editor/src/timeline/layered-adapter.ts`
- Test: `lib/editor/src/timeline/layered-adapter.test.ts`

**Interfaces:**
- Produces: `LANES` includes `'transitions'` (directly under `video`). `layeredToTimeline` emits, on that lane, one action per adjacent pair A→B where A has a non-`cut` `transitionOut`: `{ id: 'transition:'+A.id, start: cut − halfMs, end: cut + halfMs, effectId: kind }` where `cut = A.endMs`, `halfMs = round((frames/2)/fps*1000)` (needs `fps` — thread it through, or store frames and convert in the timeline; prefer passing `fps` into `layeredToTimeline`). `parseActionId('transition:X')` → `{ lane: 'transitions', itemId: 'X' }`.

- [ ] **Step 1: Write failing tests** in `layered-adapter.test.ts` (use the file's existing `LayeredReel` fixture helpers; fps 30):

```ts
it('derives a centered at-cut transition action for a clip with transitionOut', () => {
  // clip A [0,5000] transitionOut {kind:'dissolve',frames:12}; clip B [5000,9000]
  const rows = layeredToTimeline(reel, 30);
  const t = rows.find((r) => r.id === 'transitions')!.actions;
  expect(t).toHaveLength(1);
  const halfMs = Math.round((6 / 30) * 1000); // 200
  expect(t[0]).toMatchObject({ id: 'transition:A', start: 5000 - halfMs, end: 5000 + halfMs, effectId: 'dissolve' });
});
it('no transition action for a cut / absent transitionOut', () => {
  // clip A [0,5000] no transitionOut; clip B [5000,9000]
  expect(layeredToTimeline(reel, 30).find((r) => r.id === 'transitions')!.actions).toHaveLength(0);
});
it('a dissolve into the outro still yields a transition action', () => {
  // clip A [0,5000] transitionOut dissolve; outro [5000,8000]
  expect(layeredToTimeline(reel, 30).find((r) => r.id === 'transitions')!.actions).toHaveLength(1);
});
```

- [ ] **Step 2: Run — verify fail.** `export PATH="/Users/xaralis/.nvm/versions/node/v20.18.1/bin:$PATH"; cd lib/editor && npx vitest run src/timeline/layered-adapter.test.ts`

- [ ] **Step 3: Implement.** Add `'transitions'` to `LANES` (`['overlays','video','transitions','audio','music','brand']`). Thread `fps` into `layeredToTimeline` (add a param; update its one caller in `LayeredTimeline.tsx` to pass `fps`). Build transition actions:

```ts
const vids = reel.tracks.video;
const transitionActions = [];
for (let i = 0; i < vids.length - 1; i++) {
  const A = vids[i];
  const t = A.transitionOut as { kind?: string; frames?: number } | undefined;
  if (!t?.kind || t.kind === 'cut' || !t.frames) continue;
  const cut = A.endMs;
  const halfMs = Math.round((t.frames / 2 / fps) * 1000);
  transitionActions.push({ id: `transition:${A.id}`, start: Math.max(0, cut - halfMs), end: cut + halfMs, effectId: t.kind });
}
```

Mount on the `transitions` row; extend `parseActionId` for the `transition:` prefix.

- [ ] **Step 4: Run tests + tsc green** (whole `lib/editor` suite).

- [ ] **Step 5: Commit** `feat(layered-adapter): derived at-the-cut transitions lane`.

---

### Task 2: Timeline render + inspector transition editor

**Files:**
- Modify: `lib/editor/app/LayeredTimeline.tsx`, `lib/editor/app/LayeredInspector.tsx`
- Test: adapter tests cover data; UI verified in Step 4.

- [ ] **Step 1: Timeline lane.** In `LayeredTimeline.tsx`: pass `fps` to `layeredToTimeline`; add `'transitions'` to `LOCKED_LANES`; give the row a thinner `rowHeight`. In `getActionRender`, for a `transition:` action render a marker (a small centered pill) with label `"<kind> · <frames>f"`, where `frames = Math.round((action.end - action.start) / 1000 * fps)`. Lock: `flexible: false, movable: false` for transition actions; `onActionMoving`/`onActionResizing` return false.

- [ ] **Step 2: Inspector transition route.** In `LayeredInspector.tsx`, when the selected action's lane is `transitions`, find the outgoing clip by `itemId` and render:
  - **kind**: `SelectField` `['dissolve','fade-coal','glitch','whip-pan','wipe','zoom-through','cut']` → writes `transitionOut.kind`.
  - **direction**: only for `whip-pan`/`wipe`; `SelectField` `['left','right','up','down']` → writes `transitionOut.direction`.
  - **length (frames)**: `NumberField` → writes `transitionOut.frames` (min 1). No reposition. (Handle clamping is enforced at render; the field is free-entry here.)
  All writes mutate only that clip's `transitionOut`.

- [ ] **Step 3: Run tests + tsc green.** `cd lib/editor && npx vitest run && npx tsc --noEmit`

- [ ] **Step 4: Commit** `feat(editor): at-the-cut transitions lane render + inspector kind/direction/length editor`.

- [ ] **Step 5: Browser check (controller, after review).** Pilot editor: transitions lane shows the dissolve marker at the cut; clicking opens the transition inspector; changing kind + length persists.

---

### Task 3: Pilot composition — handle-based at-cut render

**Files:**
- Modify: `../video-toolkit/projects/pp-namesti-republiky/src/LayeredCampaignReel.tsx`
- (No `Root.tsx` data change — clips already butted.)

- [ ] **Step 1: Pure helpers (unit-testable, keep in the file or a sibling).**

```tsx
import { fade } from '@remotion/transitions/fade';
// brand: glitch, whipPan, wipe as customWipe, zoomThrough — from the path pp-05's CampaignReel.tsx imports

export function presentationFor(t?: { kind?: string; direction?: string; color?: string }) {
  switch (t?.kind) {
    case 'dissolve':
    case 'fade-coal':    return fade();
    case 'glitch':       return glitch();
    case 'whip-pan':     return whipPan({ direction: t.direction as never });
    case 'wipe':         return customWipe({ color: t.color as never, direction: t.direction as never });
    case 'zoom-through': return zoomThrough({ direction: t.direction as never });
    default:             return null;
  }
}
```

- [ ] **Step 2: Extend each clip's render into its transition handle windows.** In the video-node builder, for each item compute:
  - **exiting** (this clip has a non-`cut` `transitionOut` and a following clip): `Nx = frames`, `halfX = ceil(Nx/2)`. Extend this Sequence's end by `halfX` frames; pass an extended `trimOut` (`+ halfX/fps` seconds) to the segment so it shows handle frames past `trimOut`. Over the window `[endFrame − floor(Nx/2), endFrame + halfX]` wrap the body in `presentationFor(transitionOut)`’s component with `presentationDirection="exiting"` and `presentationProgress = clamp((f − winStart)/Nx, 0,1)`.
  - **entering** (the previous clip has a non-`cut` `transitionOut`): `Ne = prev.frames`, `halfE = floor(Ne/2)`. Start this Sequence `halfE` frames earlier; pass an extended `trimIn` (`− halfE/fps`, clamped ≥ 0) so it shows handle frames before `trimIn`. Over the window wrap the body `entering`.
  A clip can be both (nest the two wrappers — disjoint windows). Use `useCurrentFrame()` (Sequence-relative) for progress. Drive the presentation component directly:

```tsx
const P = pres.component;
<P presentationProgress={p} presentationDirection="exiting" passedProps={pres.props} presentationDurationInFrames={Nx}>
  {body}
</P>
```

  Remove `FadeIn` and the old `TransitionRecord` fade path.

- [ ] **Step 3: Handle clamp.** Clamp the entering extension to `trimInFrames` (never seek before source start). For the exiting side, extending `trimOut` past source end lets Remotion hold the last frame — acceptable; do not seek negative. Keep it simple; the parity render validates.

- [ ] **Step 4: Typecheck.** `cd ../video-toolkit/projects/pp-namesti-republiky && npx tsc --noEmit` — no NEW errors vs the known pre-existing baseline (remotion module-resolution noise + the pre-existing quote-pull `placement` issue).

- [ ] **Step 5: Commit (unsigned).**

```bash
cd /Users/xaralis/Workspace/progpce/video-toolkit
git add projects/pp-namesti-republiky/src/LayeredCampaignReel.tsx
git -c commit.gpgsign=false commit -m "feat(pilot): render real at-the-cut transitions via handle frames + presentations"
```

---

### Task 4: Pilot render-parity verification

**Files:** none (verification). Produces go/no-go.

- [ ] **Step 1: Render** the window around the dissolve into the outro (~40s) at `--concurrency=1 --timeout=90000` (avoids the pre-existing font flake):

```bash
cd /Users/xaralis/Workspace/progpce/video-toolkit/projects/pp-namesti-republiky
npx remotion render src/index.ts LayeredCampaignReel out/transition-check.mp4 --scale=0.5 --frames=1180-1250 --concurrency=1 --timeout=90000
```

- [ ] **Step 2: Verify** a real cross-dissolve at the cut into the outro (both visible, blending via handle frames) — not a fade-from-coal, not a hard cut. Sample frames across the window.

- [ ] **Step 3: Confirm** total duration is **UNCHANGED** (`46301`ms — model B keeps length), audio across the cut intact, brand hides at content end. Record PASS/FAIL in `.superpowers/sdd/progress.md`; clean up `out/transition-check.mp4`.

---

## Self-Review

- **Spec coverage:** derived at-cut lane (T1), lane render + inspector kind/direction/length (T2), handle-based at-cut composition render (T3), parity (T4). No derivation change (model B) — correct.
- **Types:** `transitionOut` is a base field on the `VideoItem` union — no kind narrowing needed for the transition itself.
- **No placeholders:** T1 carries real code; T2 references existing inspector/timeline patterns; T3 carries the presentation-driving + extension code; T4 is verification.
- **Deferred:** alignment selector, drag-block-edge, drag-to-create.
