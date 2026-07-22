# Layered Multi-Track Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the reel editor consume and edit the `LayeredReel` model through a multi-track timeline built on `@xzdarcy/react-timeline-editor` (MIT), following the Remotion Timeline interaction principles, with edits persisted by the existing surgical Save.

**Architecture:** A pure **adapter** (`LayeredReel` ↔ xzdarcy `editorData`) is the single seam; a **`LayeredTimeline`** React wrapper renders fixed typed lanes (Video/Overlays/Audio/Brand) via xzdarcy and maps its change callbacks back onto the `LayeredReel`; the pilot is **flipped** to a `LayeredReel` literal as source of truth; item selection routes to the existing Inspector; `onChange`→surgical Save persists. Spike-first: Task 2 is the de-risk gate before the migration + inspector work.

**Tech Stack:** TypeScript + React (core `lib/editor`); `@xzdarcy/react-timeline-editor` (MIT) in the template `.editor/` host; Vitest for the adapter; `@remotion/player` for preview. Node 20.

## Global Constraints

- **Spec:** [2026-07-22-layered-editor-multitrack-design.md](../specs/2026-07-22-layered-editor-multitrack-design.md). Decisions D1–D5 bind every task.
- **`LayeredReel` is the source of truth**, persisted as a Prettier-clean literal in the pilot's `Root.tsx` `defaultProps`; the **existing surgical Save** (`updateDefaultPropsSurgically`, preserves comments + `as const`) writes edits. Do NOT invent a new persistence path.
- **Interaction principles = Remotion Timeline** (Player-above/timeline-below shared clock; track headers + ruler + zoom; drag-move + resize; snapping with guide lines; `onChange`→persist; isolated/ debounced playhead; frame-based fps-aware). Fixed typed lanes, not a blank generic editor.
- **Reuse, don't rebuild:** `EditorShell`, `Inspector` (extend routing), `AccentEditor`, `TransitionPicker`, `FrameOverlay`, surgical Save spine, `playerRef` playhead sync, the template `.editor/` Vite host. The single-track `Timeline` is **replaced**.
- Times: `LayeredReel` items are **absolute ms**; xzdarcy actions are **seconds** — the adapter is the ONLY place this conversion lives. 30 fps.
- Node 20 (`~/.nvm/versions/node/v20.18.1/bin`); core tests `cd lib/editor && npx vitest run`. Commit signing disabled. Branch latitude: temporary breakage OK on `feat/reel-editor-skeleton`, validate at task completion.
- **Pilot** `pp-namesti-republiky` is the browser-verification target (footage present locally). xzdarcy installs into the pilot's `.editor/` host (and the template's, when promoted).

---

### Task 1: `LayeredReel` ↔ timeline adapter (pure, TDD)

**Files:**
- Create: `lib/editor/src/timeline/layered-adapter.ts`
- Test: `lib/editor/src/timeline/layered-adapter.test.ts`

**Interfaces (produces):**
- `layeredToTimeline(reel: LayeredReel): { editorData: TLRow[] }` — maps the 4 tracks to 4 rows; each item → a `TLAction` with `id = \`${lane}:${itemId}\``, `start = startMs/1000`, `end = endMs/1000`, `effectId` = a per-type tag (`video-clip`/`video-broll`/…/`overlay`/`audio`/`brand-watermark`/…) used for styling in `getActionRender`.
- `applyTimelineChange(reel: LayeredReel, rows: TLRow[]): LayeredReel` — maps each action's `start`/`end` (s) back to its item's `startMs`/`endMs` (ms, rounded) by `lane:id`; items not present in `rows` are unchanged; returns a new reel (no mutation).
- `parseActionId(actionId: string): { lane: LaneId; id: string }` — inverse of the id scheme, for selection routing (Task 4).
- Types `TLRow`/`TLAction` mirror xzdarcy's minimally (the real ones come from the library; the adapter stays library-version-agnostic by using a local structural type).

```ts
// lib/editor/src/timeline/layered-adapter.ts
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';

export interface TLAction { id: string; start: number; end: number; effectId: string; movable?: boolean; flexible?: boolean; }
export interface TLRow { id: string; actions: TLAction[]; }

export const LANES = ['video', 'overlays', 'audio', 'brand'] as const;
export type LaneId = (typeof LANES)[number];
const MS = 1000;

export function parseActionId(actionId: string): { lane: LaneId; id: string } {
  const i = actionId.indexOf(':');
  return { lane: actionId.slice(0, i) as LaneId, id: actionId.slice(i + 1) };
}

export function layeredToTimeline(reel: LayeredReel): { editorData: TLRow[] } {
  const act = (lane: LaneId, id: string, startMs: number, endMs: number, effectId: string): TLAction => ({
    id: `${lane}:${id}`, start: startMs / MS, end: endMs / MS, effectId,
  });
  const video = reel.tracks.video.map((v) => act('video', v.id, v.startMs, v.endMs, `video-${v.kind}`));
  const overlays = reel.tracks.overlays.map((o) => {
    const kind = (o.content as { kind?: string }).kind ?? 'overlay';
    return act('overlays', o.id, o.startMs, o.endMs, `overlay-${kind}`);
  });
  const audio = reel.tracks.audio.map((a) => act('audio', a.id, a.startMs, a.endMs, 'audio'));
  const brand = reel.tracks.brand.map((b) => act('brand', b.id, b.startMs, b.endMs, `brand-${b.kind}`));
  return {
    editorData: [
      { id: 'video', actions: video },
      { id: 'overlays', actions: overlays },
      { id: 'audio', actions: audio },
      { id: 'brand', actions: brand },
    ],
  };
}

export function applyTimelineChange(reel: LayeredReel, rows: TLRow[]): LayeredReel {
  const byId = new Map<string, TLAction>();
  for (const r of rows) for (const a of r.actions) byId.set(a.id, a);
  const patch = <T extends { id: string; startMs: number; endMs: number }>(lane: LaneId, item: T): T => {
    const a = byId.get(`${lane}:${item.id}`);
    if (!a) return item;
    return { ...item, startMs: Math.round(a.start * MS), endMs: Math.round(a.end * MS) };
  };
  return {
    ...reel,
    tracks: {
      ...reel.tracks,
      video: reel.tracks.video.map((v) => patch('video', v)),
      overlays: reel.tracks.overlays.map((o) => patch('overlays', o)),
      audio: reel.tracks.audio.map((a) => patch('audio', a)),
      brand: reel.tracks.brand.map((b) => patch('brand', b)),
    },
  };
}
```

- [ ] **Step 1: Write the failing test** — `layered-adapter.test.ts`: build a small `LayeredReel` (1 video clip [0,3000], 1 overlay [0,3000], 1 audio [0,3000], 1 brand watermark [0,5000]); assert `layeredToTimeline` yields 4 rows in order video/overlays/audio/brand; the video action `id==='video:v1'`, `start===0`, `end===3`, `effectId==='video-clip'`. Assert `applyTimelineChange` with the video action moved to `{start:1,end:4}` returns a reel whose `tracks.video[0]` has `startMs===1000,endMs===4000` and every other track unchanged, original reel unmutated. Assert `parseActionId('overlays:seg-1-ov')` → `{lane:'overlays',id:'seg-1-ov'}`.
- [ ] **Step 2: Run → fails** (`cd lib/editor && npx vitest run src/timeline/layered-adapter.test.ts`; module missing).
- [ ] **Step 3: Implement** `layered-adapter.ts` exactly as above.
- [ ] **Step 4: Run → passes**; full `lib/editor` suite + `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `feat(editor): LayeredReel ↔ timeline adapter (pure)`.

---

### Task 2: `LayeredTimeline` wrapper + xzdarcy spike (de-risk GATE)

**Files (core + template):**
- Create: `lib/editor/app/LayeredTimeline.tsx` (core UI; wraps xzdarcy)
- Modify: `templates/campaign-reels/.editor/package.json` (add `@xzdarcy/react-timeline-editor`) and the pilot's `.editor/` host (vendored) so it installs
- Wire: `lib/editor/app/EditorShell.tsx` — swap the single-track timeline slot for `LayeredTimeline`

**Interfaces:**
- Consumes: `layeredToTimeline`/`applyTimelineChange` (Task 1); the current `reel: LayeredReel` (derived in-memory for the spike — NO source flip yet); `playerRef` (existing) for playhead sync.
- Produces: `<LayeredTimeline reel onChange={(next: LayeredReel)=>void} selectedId playerRef onSelect />` — renders 4 fixed lanes with headers, ruler, zoom, drag-move, resize, snapping.

**xzdarcy API to use** (verify exact signatures against the installed `node_modules/@xzdarcy/react-timeline-editor` `.d.ts` FIRST): `<Timeline editorData effects onChange getActionRender scale scaleWidth startLeft rowHeight gridSnap dragLine autoScroll onClickAction onActionMoveEnd onActionResizeEnd ref />`; a `TimelineState` ref exposing `setTime/getTime/listener` for cursor↔player sync. Build the `effects` map from the distinct `effectId`s the adapter emits (each maps to a color/label used in `getActionRender`).

**Approach (spike — read the `.d.ts` before coding):**
1. Install xzdarcy in the `.editor/` host; import its CSS.
2. `getActionRender(action,row)` → a typed block: color+icon+label by `effectId`; for the **video** lane, render transition-junction badges between adjacent actions (reuse the existing junction-badge visual). Audio lane = plain blocks (envelope = sub-spec 3).
3. Fixed lanes: pass the 4 rows; **disable add-track/add-item** (our lanes are fixed). Lock cross-lane moves (`movable` within-row only) so items can't jump lanes.
4. **onChange** → `applyTimelineChange(reel, editorData)` → call `onChange(nextReel)` (parent holds state). Enable `gridSnap` + `dragLine` (guide-line snapping).
5. **Playhead sync:** bind the xzdarcy cursor to the existing `playerRef` frameupdate (player→cursor) and `onCursorDrag`/click→`playerRef.seekTo` (cursor→player), reusing the current sync logic. Keep the playhead update isolated/debounced (Remotion principle).
6. Zoom via xzdarcy `scale`/`scaleWidth` bound to a zoom control.

- [ ] **Step 1:** Install xzdarcy in the pilot's `.editor/` host; read its `.d.ts` to pin exact prop/callback names + `TimelineRow`/`TimelineAction`/`TimelineState` types. Record them in the report.
- [ ] **Step 2:** Build `LayeredTimeline.tsx` per the approach; wire into `EditorShell` (in-memory derived reel for now).
- [ ] **Step 3: SPIKE VERIFY (the gate) — browser over the pilot** (`npm run editor` in the pilot): 4 lanes render with correct items; drag an item to move (snaps to neighbors/playhead with guide line); drag an edge to resize; playhead scrubs and stays synced with the Player; zoom works; no lane-jumping. Capture screenshots.
- [ ] **Step 4: GATE.** If the spike holds up → proceed. If xzdarcy blocks a core principle (e.g. can't do fixed lanes / controlled data / cursor sync cleanly), STOP and report BLOCKED with specifics — the controller decides fall-back (extend our own timeline following the same principles). Do NOT force a bad fit.
- [ ] **Step 5: Commit** (core + template) `feat(editor): LayeredTimeline multi-track (xzdarcy) — spike verified`.

> No unit test (it's a Remotion/DOM integration). Gate = browser verification. The reviewer checks the adapter is the only model↔library seam, lanes are fixed, and cursor sync reuses the existing spine.

---

### Task 3: Flip the pilot to `LayeredReel` source of truth (migration)

**Files (video-toolkit pilot):** `projects/pp-namesti-republiky/src/Root.tsx`; a one-shot migrate helper.

**Approach:**
- Write a one-shot script/step that computes `deriveLayered(<old defaultProps>, {fps,outroFrames})` and **serializes the resulting `LayeredReel` to a Prettier-formatted TS literal**, then replaces the pilot's `Root.tsx` `defaultProps` with `{ reel: <that literal> }` for the `LayeredCampaignReel` composition. Remove the old `CampaignReel` composition + the now-unused old config imports/schema from the pilot. `calculateMetadata` uses `reel.meta.totalDurationMs`.
- The editor server's `readDefaultProps`/`/props`/`/save` now read/write this layered literal (they're model-agnostic — verify `updateDefaultPropsSurgically` round-trips the layered literal).

- [ ] **Step 1:** Generate the layered literal (run `deriveLayered` on the pilot's old props; format with Prettier) and write it as the pilot `Root.tsx` `defaultProps` for `LayeredCampaignReel`; remove old `CampaignReel` + old config from the pilot.
- [ ] **Step 2: Verify render** — `npx remotion still src/index.ts LayeredCampaignReel out/flip-f200.png --frame=200` matches the pre-flip render (byte-identical to the earlier `layered-f200`), proving the literal == the derived model.
- [ ] **Step 3: Verify editor read** — `npm run editor`; the editor server serves the layered `defaultProps` (GET /props returns the `LayeredReel`); the timeline (Task 2) renders from it.
- [ ] **Step 4: Commit** (video-toolkit) `feat(pilot): flip pp-namesti-republiky to LayeredReel source of truth`.

---

### Task 4: Item-select → inspector routing

**Files (core):** `lib/editor/app/Inspector.tsx` (extend routing); `EditorShell.tsx` (selection state from timeline `onClickAction`).

**Approach:**
- Timeline `onClickAction(action)` → `parseActionId` → set `selected = {lane,id}` in `EditorShell`; also seek the player to the item start (existing select+seek behavior).
- Extend `Inspector` to route by `lane`: **video** → source/trim/focal (`FrameOverlay`)/effects list/`audioMode`/musicBoost; **overlays** → `AccentEditor` (content.text) + position + timing; **audio** → source/in-point (`sourceInMs`)/volume; **brand** → text/timing; **transition** (junction badge click) → `TransitionPicker` on the video item's `transitionOut`. Each editor already exists — wire it to patch the corresponding `LayeredReel` item and bubble the change (→ Task 5 Save).
- Edits update the in-memory reel → Player re-renders + timeline reflects new spans.

- [ ] **Step 1:** Extend `Inspector` routing by lane/item-type (reuse existing editors); render the correct panel for a selected item of each lane. Add a unit test for the routing selector (given a selected `{lane,id}` + reel → which panel/props), if the Inspector's structure allows a pure selector; otherwise cover via the browser gate.
- [ ] **Step 2:** Wire timeline selection → EditorShell → Inspector; wire each panel's change → patch reel item → onChange.
- [ ] **Step 3: Browser-verify over the pilot:** click a video clip, an overlay, an audio bed, a brand item, and a transition badge — each shows the right inspector; edit one field of each (e.g. overlay text via `AccentEditor`, clip trim, audio volume) → Player + timeline update live.
- [ ] **Step 4: Commit** (core) `feat(editor): item-select → inspector routing for layered items`.

---

### Task 5: `onChange` → surgical Save + integration

**Files (core + template):** the Save wiring in `EditorShell`/the `.editor/` host `/save`.

**Approach:**
- Debounce the reel `onChange` (from timeline drags + inspector edits) and route Save through the existing surgical spine: serialize the changed `LayeredReel` back into `Root.tsx` `defaultProps` via `updateDefaultPropsSurgically` (preserving comments + `as const`). Reuse the existing dirty-indicator/beforeunload guard.
- Confirm the whole round-trip on the flipped layered literal.

- [ ] **Step 1:** Wire debounced `onChange`→Save; keep the dirty indicator + Save button behavior.
- [ ] **Step 2: Browser-verify full round-trip over the pilot:** move an item on the timeline + edit an overlay's text → Save → server writes `Root.tsx` → GET /props re-parses the updated `LayeredReel` → `LayeredCampaignReel` in the Player reflects it → Studio still loads the file (valid TS). Then revert the test edits.
- [ ] **Step 3: Full integration pass** — the pilot round-trips through the multi-track editor: view all lanes, select+edit every item type, drag/resize/snap, Save, reload. Write a short report to `.superpowers/sdd/subspec2-report.md`.
- [ ] **Step 4: Commit** (core + template) `feat(editor): layered onChange → surgical Save (multi-track round-trip)`.

---

## Self-Review
- **Spec coverage:** D1 flip (Task 3), D2 xzdarcy engine + spike (Task 2), D3 principles (Task 2 wrapper), D4 fixed lanes (Task 2), D5 inspector routing (Task 4); adapter seam (Task 1); onChange→Save (Task 5). Audio envelope/slip correctly deferred to sub-spec 3 (Audio lane = plain blocks — stated).
- **Placeholder scan:** Task 1 has complete code. Tasks 2–5 are React/DOM/library integration with concrete approaches + exact reuse targets + browser gates; the xzdarcy exact API is read from the installed `.d.ts` in Task 2 Step 1 (unavoidable — the library's types are the source of truth) and the spike gate (Task 2 Step 4) is the explicit fall-back decision point.
- **Type consistency:** `TLRow`/`TLAction`/`LaneId`/`parseActionId`/`layeredToTimeline`/`applyTimelineChange` names identical across Tasks 1/2/4; `lane:id` action-id scheme consistent between adapter emit and selection parse; ms↔s conversion only in the adapter.

## Next (not this plan)
Sub-spec 3 — audio subsystem: derived music-envelope visualization on the Audio lane, independent bed slip, music base, fine `extend-previous`/outro-fade parity. Then the mechanical rollout (promote `LayeredCampaignReel` + the layered editor to the template; flip remaining projects; `/cut` emits layered directly).
