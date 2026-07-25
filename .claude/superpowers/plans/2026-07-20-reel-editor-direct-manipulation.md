# Reel Editor — Direct Manipulation (Plan 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). Deliverables are browser-verified. Executed in **checkpoint milestones** — stop for human review after each checkpoint.

**Goal:** Turn the skeleton into a real editor: a working timeline (scenes you can see, select, and trim by dragging), an inspector that reflects/edits the selection, all mutating the live Player preview and persisting via the existing Save spine.

**Architecture:** Core (`lib/editor/app`) ships the editing UI as presentational, controlled React components — `Timeline`, `Inspector`, (later) `FrameOverlay` — each taking a config slice + callbacks, no Remotion/composition dependency. `EditorShell` gains `timeline` / `inspector` slots (falls back to the "coming soon" placeholders). The template's `.editor/main.tsx` holds the state (`props`, `selectedId`) and composes core components around the passed-in `<Player>`; pure edit logic (trim clamping) lives in core helpers, unit-tested. Save/read unchanged (Plan 1 spine).

**Tech Stack:** React 19 (core authoring) / 18 (template runtime) — `ReactNode` + plain JSX only, no version-specific APIs; `@remotion/player`; Vite host (Plan 2). Duration math from `@video-toolkit/lib/reel-config-base/duration`.

## Global Constraints

- **All editor UI strings in English** (user preference — see memory `reel-editor-ui-english`). No Czech in any component or the template host.
- **Controlled components:** core editing components own no state; they take config + `onSelect`/`onChange` callbacks. State lives in `main.tsx`.
- **Single source of truth stays `Root.tsx`'s inline `defaultProps` literal;** edits flow `main.tsx` state → Save spine (`POST /save`). Never convert the literal to a reference. Browser sends JSON only.
- **Min-duration rules (brand):** broll effective duration (`trimOut − trimIn`) ≥ 3.0 s; multi-clip `durationMs` ≥ 1000 ms; clip ≥ 0.5 s floor. Clamp at the drag; never write below the floor.
- **Live preview parity:** after any edit, the Player's `durationInFrames` is recomputed from the edited props (`totalDurationFrames(buildReelConfig(props).segments, fps, outroFrames)`) so preview length never drifts.
- **Core authoring skew:** author components against React 19 but use only APIs present in React 18 (the template's runtime).
- **Node 20+** for all npm/vitest commands. Core sub-package tests: `cd lib/editor && npx vitest run`.
- **Cross-repo landing note:** core changes reach the template via the locally-checked-out `toolkit/` submodule (already at the editor branch); after each core commit that the template consumes, re-sync the submodule (`cd video-toolkit/toolkit && git fetch <core> feat/reel-editor-skeleton && git checkout <new core HEAD>`) so `npm run editor` sees it. Do not commit the submodule pointer; do not push.
- **Branches:** continue on `feat/reel-editor-skeleton` in both repos (skeleton + direct-manipulation ship together until the human lands them).

---

## CHECKPOINT 1 — Interaction backbone (timeline · selection · inspector · trim)

*Stop for human review after Task 5.*

### Task 1: `EditorShell` gains `timeline` / `inspector` slots

**Files:** Modify `lib/editor/app/EditorShell.tsx`, `lib/editor/app/EditorShell.test.tsx`

**Interfaces (produces):** `EditorShellProps` adds `inspector?: ReactNode` and `timeline?: ReactNode`. Render `inspector` in the right panel and `timeline` in the bottom strip; when a slot is omitted, keep the current English placeholder ("Inspector (coming soon)" / "Timeline (coming soon)"). `preview`, `projectName`, `onSave`, `saving` unchanged.

- [ ] Write failing test: passing `inspector={<div>INSP</div>}` / `timeline={<div>TL</div>}` renders them; omitting shows the placeholders. Keep the existing tests green.
- [ ] Implement the two optional slots (`{inspector ?? 'Inspector (coming soon)'}` etc.).
- [ ] `cd lib/editor && npx vitest run` (all green) + `npx tsc --noEmit`. Commit `feat(editor): EditorShell timeline/inspector slots`. Re-sync submodule to the new core HEAD.

### Task 2: core `Timeline` component (render + select)

**Files:** Create `lib/editor/app/Timeline.tsx`, `lib/editor/app/Timeline.module.css`, `lib/editor/app/Timeline.test.tsx`

**Interfaces (produces):** `Timeline(props: { segments: Segment[]; selectedId: string | null; onSelect: (id: string) => void; fps: number; outroFrames: number }): JSX.Element`. `Segment` = the reel config's segment union (import the base type from `@video-toolkit/lib/reel-config-base/base-types` or accept a structural `{ id: string; type: string }`-plus shape — match what `segmentDurationFrames` accepts). Renders one block per segment, **flex-grow proportional to that segment's duration in frames** (`segmentDurationFrames(seg, fps, outroFrames)` from `@video-toolkit/lib/reel-config-base/duration`), labelled with a human scene name (e.g. `clip · 1`, `broll · 2`, `outro`). The block whose `id === selectedId` gets a selected style. Clicking a block calls `onSelect(seg.id)`.

- [ ] Failing test: given 3 segments (clip/broll/outro), renders 3 blocks; clicking the 2nd calls `onSelect` with its id; the block matching `selectedId` has the selected class; block flex-basis/grow reflects relative duration (assert the selected one carries a `data-duration-frames` attr equal to `segmentDurationFrames`).
- [ ] Implement (grounded on the demo config: clip trimIn0/trimOut3, broll 0/3, outro). Confirm `segmentDurationFrames`' real signature first.
- [ ] Tests green + tsc. Commit `feat(editor): Timeline block render + selection`. Re-sync submodule.

### Task 3: core `Inspector` component (reel field + segment summary)

**Files:** Create `lib/editor/app/Inspector.tsx`, `lib/editor/app/Inspector.module.css`, `lib/editor/app/Inspector.test.tsx`

**Interfaces (produces):** `Inspector(props: { segments: Segment[]; selectedId: string | null; topic: string; onTopicChange: (v: string) => void }): JSX.Element`. When `selectedId` is null → a **Reel** section with a labelled `Topic` text input bound to `topic`/`onTopicChange`. When a segment is selected → a **Scene** section showing read-only summary: type, `source` (if present), and timing — for clip/broll `trimIn`–`trimOut` shown in **seconds** ("2.0s → 5.0s · 3.0s") ; for multi-clip `durationMs` in seconds; for outro/card just the type. (Editable segment fields are CP2.)

- [ ] Failing test: `selectedId=null` shows the Topic input, typing calls `onTopicChange`; selecting a clip shows its source + a seconds-formatted timing string; no Czech strings.
- [ ] Implement. Tests green + tsc. Commit `feat(editor): Inspector reel/scene panel`. Re-sync submodule.

### Task 4: wire the backbone in `main.tsx` (brand repo)

**Files (video-toolkit):** Modify `templates/campaign-reels/.editor/main.tsx`

**Interfaces (consumes):** core `EditorShell` (new slots), `Timeline`, `Inspector`.

- [ ] Add `selectedId` state (default null). Compose: `<EditorShell projectName="campaign-reels" onSave saving preview={<Player .../>} timeline={<Timeline segments={props.segments} selectedId={selectedId} onSelect={setSelectedId} fps={fps} outroFrames={outroFrames} />} inspector={<Inspector segments={props.segments} selectedId={selectedId} topic={props.topic} onTopicChange={(v) => setProps({ ...props, topic: v })} />} />`. **Remove** the ad-hoc Topic input currently inside the `preview` slot (Topic now lives in the Inspector).
- [ ] Browser-verify (in-app browser): timeline shows the 3 demo scenes with proportional widths; clicking a scene highlights it AND the Inspector switches to that scene's summary; clicking empty timeline area / a deselect affordance returns to the Reel/Topic panel; editing Topic in the Inspector updates the Player (chevron/topic) and Save round-trips (200, Root.tsx updated). Screenshot.
- [ ] Commit in video-toolkit on `feat/reel-editor-skeleton`: `feat(campaign-reels): wire timeline + inspector into editor`. No push; don't commit submodule pointer.

### Task 5: drag-to-trim on the timeline

**Files:** Create `lib/editor/app/trim.ts` + `lib/editor/app/trim.test.ts` (core, pure); Modify `lib/editor/app/Timeline.tsx` (edge handles + drag), `templates/campaign-reels/.editor/main.tsx` (apply).

**Interfaces (produces):**
- `applyTrim(seg: Segment, edge: 'start' | 'end', deltaFrames: number, opts: { fps: number }): Segment` — returns a new segment with adjusted timing, clamped to the min-duration rules (broll ≥3s, multi-clip durationMs ≥1000ms, clip ≥0.5s). For clip/broll: `end` adjusts `trimOut`, `start` adjusts `trimIn` (converting frames→seconds via `fps`); for multi-clip: `end` adjusts `durationMs` (start is a no-op). Segments without editable duration (outro) return unchanged.
- `Timeline` gains, on the selected block only, left/right drag handles that report pixel deltas converted to frames (using the block's px width ÷ its duration-in-frames) via a new callback `onTrim(id: string, edge: 'start' | 'end', deltaFrames: number)`.

- [ ] Failing unit tests for `applyTrim`: broll end-trim that would go below 3s clamps to exactly 3s; clip start-trim increases trimIn and shrinks duration but not below 0.5s; multi-clip end-trim adjusts durationMs, clamped ≥1000; outro unchanged; frames→seconds conversion correct at fps=30.
- [ ] Implement `applyTrim` (pure) → tests green.
- [ ] Add drag handles to `Timeline` (pointer events; convert px delta → frames). Wire `main.tsx`: `onTrim={(id, edge, df) => setProps({ ...props, segments: props.segments.map(s => s.id === id ? applyTrim(s, edge, df, { fps }) : s) })}`. The Player `durationInFrames` recompute (already derived from `props`) makes the preview length follow.
- [ ] Browser-verify: drag the selected scene's right edge → its block resizes, the Player total time changes, the Inspector timing string updates; dragging past the min clamps stops at the floor; Save persists the new trim (Root.tsx `trimOut`/`durationMs` updated, still valid + inline). Screenshot the before/after.
- [ ] Commit: core `feat(editor): applyTrim helper + Timeline drag handles`; brand `feat(campaign-reels): drag-to-trim wiring`. Re-sync submodule. No push.

### Checkpoint 1 verification (controller) → STOP
Run core `lib/editor` suite + tsc; browser-verify the full CP1 loop (see scenes → select → inspector reflects → drag-trim → Player follows → Save persists). Then **STOP and present CP1 to the human** with screenshots; do not start CP2 until they've looked.

---

## CHECKPOINT 2 — On-frame manipulation + inspector editing *(outline — detail after CP1 review)*
- `FrameOverlay` over the Player stage: draggable focus dot → `focalX/focalY`; draggable crop rectangle → `crop.width/x/y`. Maps to the selected segment.
- Inspector editable fields: take/source picker (thumbnails of `public/recordings|broll`), caption text + **Accent** button (wraps selected word as `{lime:…}` — hide the syntax), audio toggle (voice/silent; multi-clip first/mix/silent).
- Brand-rule warnings (reuse `check-brand`) as non-blocking inline notices.

## CHECKPOINT 3 — Transitions + multi-clip *(outline — detail after CP2 review)*
- Timeline junction badges (◇ cut / ● effect) → popover gallery (8 types), duration presets + seconds slider, contextual sub-options; writes `transitionOut`.
- Multi-clip inspector list: layout switcher, per-sub-clip take/trim/label, audio mode.

## Self-Review (CP1)
- Spec coverage (CP1 slice): timeline render+select (T2), inspector reflect+topic (T3), shell slots (T1), wiring (T4), drag-trim with clamps + live preview (T5). Focus/crop, take/caption/accent, transitions, multi-clip internals deferred to CP2/CP3 as the spec's MVP staging intends.
- Placeholder scan: "coming soon" slots are intentional UI fallbacks; every task has concrete contracts + browser-verify.
- Type consistency: `Segment` shape consistent across Timeline/Inspector/applyTrim; `onSelect`/`onTrim`/`onTopicChange`/`onChange` signatures identical between core Interfaces and `main.tsx` usage; `segmentDurationFrames`/`totalDurationFrames`/`applyTrim` names exact.
