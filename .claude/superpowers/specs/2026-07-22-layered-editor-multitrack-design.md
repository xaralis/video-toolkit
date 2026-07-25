# Layered multi-track editor (sub-spec 2)

**Date:** 2026-07-22
**Status:** Approved (brainstorming) → plan
**Parent:** [layered-timeline-model-design](2026-07-21-layered-timeline-model-design.md) — sub-spec 2 of 3.
**Depends on:** sub-spec 1 (layered model + `deriveLayered` + `LayeredCampaignReel`), complete.

## Problem

Sub-spec 1 built the `LayeredReel` model and a composition that renders the pilot from it at near-perfect parity. But the **editor still operates on the OLD segment-centric `defaultProps`** — a single-track timeline. To make the layered model editable the way a real NLE is, the editor must consume `LayeredReel` and present a **multi-track timeline** whose interaction model matches a proven editor.

## Decisions

### D1 — Source of truth flips to `LayeredReel` (pilot "migrated")
`deriveLayered` runs **once** as a migration: serialize the resulting `LayeredReel` to a Prettier-clean literal and write it as the pilot's `Root.tsx` `defaultProps`. `LayeredCampaignReel` becomes the **sole** composition; the old `CampaignReel` + old config schema are removed from the pilot. The editor server reads/writes this layered `defaultProps`; the existing **surgical Save** (`updateDefaultPropsSurgically` — model-agnostic, patches the literal, preserves comments + `as const`) persists edits. This is the migration spec's "flip the project" state. The derivation becomes a one-time migrate step, not a per-render derive.

### D2 — Timeline engine: `@xzdarcy/react-timeline-editor` (MIT)
No free reusable Remotion timeline component exists (Remotion's is $300, license-gated; the docs are a build-it-yourself tutorial). `@xzdarcy/react-timeline-editor` (MIT, v1.0.0 Jan 2026) is a data-driven multi-track timeline: `editorData: TimelineRow[]` (one row per track; each row holds `actions` with `{id, start, end, effectId}`), an `effects` map, drag + scale (resize), grid + auxiliary-line snapping, zoom, custom action rendering, and change callbacks. It is a **controlled, data-driven view** — the parent owns the model and maps changes back — which fits D1 exactly.

**Spike-first (de-risk):** the FIRST implementation step validates xzdarcy over the pilot (adapt `LayeredReel`→`editorData`, render the lanes, verify drag/resize/snap + select→inspector + playhead sync feel right). If the spike reveals blocking gaps, fall back to extending our existing timeline following the same principles (D3). Either way MIT, no cost.

### D3 — Interaction principles: match the Remotion Timeline
Regardless of engine, the timeline's behavior follows the **Remotion Timeline** principles (studied from `timeline.remotion.dev` + docs):
- **Player above, timeline below, one shared clock.** The Player is the preview; the timeline drives it.
- **Left track-header column + right scrollable track area**, a **time ruler** (timecodes) across the top, a **zoom slider** (pixels-per-second).
- **Stacked track rows**; **items are colored blocks with a type icon + label**, positioned by time.
- **Playhead scrubbing bidirectionally synced with the Player** via `playerRef` (scrub → seek; play → playhead moves). *(Already built.)*
- **Drag item body to move; drag edges to resize/trim.**
- **Snapping with auxiliary guide lines** (other items' edges, playhead, grid), toggleable.
- **Select an item → it becomes the edit target.**
- **`onChange` fires on every mutation** (move/resize/add/remove) → persist. Maps onto surgical Save.
- **Playhead position isolated + debounced** for smooth scrubbing without re-rendering heavy components.
- **Frame-based, fps-aware** math; the Player renders `LayeredCampaignReel` (our `CanvasComposition` equivalent).

### D4 — Fixed, typed lanes (simplified editor, not a blank generic one)
The Remotion demo is a *generic* editor (add any Solid/Text/Image/track anywhere). We keep **fixed, typed lanes driven by the `LayeredReel`** — **Video** (with transition-junction badges), **Overlays**, **Audio**, **Brand** — not free-form adding. Structure comes from the reel + brand presets, per the project's real-model-plus-brand-presets principle. Adopt the *interaction* principles, not the blank-canvas freedom.

### D5 — Item-select → inspector routing (reuse existing editors)
Clicking any item routes the Inspector by item type, reusing what sub-spec-1-and-earlier built:
- **video-clip** → source / trim / focal (`FrameOverlay`) / effects / `audioMode` / musicBoost
- **overlay** → `AccentEditor` (text) + position + timing
- **transition** (junction) → `TransitionPicker`
- **audio** → source / in-point / volume
- **brand** → text / timing

## Architecture

```
LayeredReel (source of truth, in Root.tsx defaultProps)
   │  adapter: tracks → xzdarcy rows, items → actions (start/end = ms→s)
   ▼
<Timeline editorData effects onChange getActionRender .../>   (xzdarcy, themed)
   │  onChange / onActionMove/Resize End → map action start/end back to item startMs/endMs
   ▼
patch LayeredReel (in-memory)  ──►  surgical Save  ──►  Root.tsx defaultProps
   │
   └► @remotion/player renders LayeredCampaignReel(reel) ; playerRef ⇄ playhead
```

- **Adapter (new, focused unit):** `layeredToTimeline(reel)` → `{ editorData, effects }`; `applyTimelineChange(reel, rows)` → new `LayeredReel`. Pure, unit-testable, the single seam between our model and the library. ms↔seconds (or ms↔frames) conversion lives here only.
- **`getActionRender`** draws our typed item blocks (icon + label + transition-junction badges + focal dot hooks) inside xzdarcy actions.
- **Selection** → existing `EditorShell`/`Inspector` routing extended per D5.
- **Persistence** → `onChange` debounced → surgical Save (existing spine).
- **Player sync** → existing `playerRef` frameupdate ⇄ playhead; xzdarcy cursor bound to the same clock.
- Reuse: `EditorShell`, `Inspector`, `AccentEditor`, `TransitionPicker`, `FrameOverlay`, surgical Save, the template-hosted Vite host.

## Scope (this sub-spec)
- Flip the pilot to layered source-of-truth + wire editor read/write/Save on `LayeredReel`.
- Multi-track timeline (xzdarcy, spike-validated) with the D3 principles + D4 fixed lanes: **drag-move, resize/trim, snapping, zoom, playhead sync** (largely from the library).
- Item-select → inspector routing (D5), editing any item's props, surgical Save.

## Non-goals (deferred)
- **Audio envelope visualization + independent bed slip** → **sub-spec 3** (the Audio lane here shows items as plain blocks).
- **Free-form add-any-item / add-track** (we're fixed/typed).
- **Manual music-envelope keyframes**, clip reordering by free "slide", multi-select bulk ops — post-MVP.
- Migrating projects other than the pilot (mechanical rollout later).

## Testing
- **Adapter** (`layeredToTimeline` / `applyTimelineChange`) — pure unit tests (round-trip a `LayeredReel`, assert row/action mapping + that a moved/resized action maps back to correct `startMs`/`endMs`).
- **Spike gate** — the pilot renders in the multi-track editor; drag/resize/snap + select→inspector + playhead sync verified in the browser over the real pilot.
- **Regression** — surgical Save round-trip on the flipped `LayeredReel` literal (edit → Save 200 → `Root.tsx` valid + re-parses + Studio/Player still loads).

## Reuse (not rebuilt)
`EditorShell`, `Inspector` (extended routing), `AccentEditor`, `TransitionPicker`, `FrameOverlay`, surgical Save spine, the template `.editor/` Vite host, the `playerRef` playhead sync. The single-track `Timeline` component is **replaced** by the xzdarcy-based multi-track timeline + adapter.
