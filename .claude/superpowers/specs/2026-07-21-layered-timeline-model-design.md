# Layered timeline model + multi-track editor

**Date:** 2026-07-21
**Status:** Approved (brainstorming) → decompose into sub-specs → plans

## Problem

The reel editor and its config are **segment-centric**: a single ordered track of clip/broll/
multi-clip/outro segments, with overlays hanging off each segment as properties
(`appearAt`/`durationMs` relative to the segment), the chevron as a reel-level string rendered once
by a component, the watermark + "zpracovatel/zadavatel" disclaimer baked into a persistent overlay
component, and audio as a single music track with a rule-computed volume (broll +6 dB, outro +10 dB)
plus per-segment `audioMode`. The editor's timeline shows only that one track.

That is not how a real editor works, and it blocks the MVP: a reviewer can't see or independently
adjust the layers (overlays, chevron, brand marks, music, clip audio), can't align things across
layers, and can't work with audio. **This redesign makes the model and the timeline multi-track /
layered**, the way Remotion Studio and normal NLEs do.

## Decision & approach (from brainstorming)

- **Track-native layered model** is the target for all projects, reached by a **staged migration**:
  1. Build a **derivation** (old segment-centric config → new layered model) — the new model is
     largely a **reshape of numbers that already exist** (segment/overlay/rule timings broken out
     into explicit layer items), which keeps it tractable.
  2. **Pilot on `pp-namesti-republiky`** — convert that one real project, validate it renders + edits
     correctly in the new model, and use it as the reference.
  3. Once the pilot is OK, **mechanically flip the remaining projects.** This is expected to be
     mostly-mechanical, and **the result need not be 100 % one-to-one** with the old render —
     "close" is acceptable.
- During the transition the **old composition path is kept** so un-migrated projects keep rendering;
  it can be retired once everything is flipped. **Render/derivation parity is a "close, acceptable
  drift" bar, not pixel-perfect.**

## The layered model

Four kinds of track. Each track holds **items** with absolute `startMs`/`endMs` on the reel timeline.

### 1. Video track
Clip / broll / multi-clip items. Each item:
- `source`, a source **trim window** (in/out), **duration** (resize by dragging an edge — this is
  what changes its span/time; downstream items ripple), and **slip** (shift the source in/out
  *together*, keeping duration — "scrub which part of the take shows").
- Transitions live at **junctions** between adjacent video items (existing `TransitionPicker` +
  Timeline junction badges).

### 2. Audio
- **Clip/broll audio items** — a clip's own or inherited audio as an item: `source`, `in-point`,
  `volume`. For **broll** (no talking head), the audio bed is a **separately slippable** item
  (maps today's `audioSource`/`audioStartSec`, made draggable) so you can shift which part of the
  audio plays independently of the video.
- **Music layer** (separate track) — a **static base volume** for MVP + an **effective volume
  envelope computed from each clip's `musicBoost` (boost/duck/mute) property**. The envelope is
  **visualized in the timeline**. You edit it *indirectly* by setting a clip's boost — which
  **travels with the clip** when it moves/retimes. Manual base-envelope keyframes are **post-MVP**.

### 3. Overlays
Independent, **absolute-timed** items (title / quote-pull / stat-callout). `/cut` computes their
initial position aligned to the relevant clip, but they are **freely movable** afterward.
The **chevron** becomes an overlay item too (timing seeded from brand rule #7 "once at start", then
editable). Overlay content editing reuses the existing WYSIWYG `AccentEditor` + position controls.

### 4. Brand layers
Watermark + "zpracovatel/zadavatel" disclaimer become **editable layer items**; their timing is
**seeded from brand rules** (full-span) and **baked into the config**, then editable. Brand rules
become **lint/warnings**, not hard locks.

## Timeline interaction

- **Multi-track view** — every layer is a track (video, audio incl. music envelope, overlays, brand
  layers). Item timing is adjustable by dragging.
- **Snapping (toggleable off)** — while dragging (item edges, whole items, overlays, audio in-points,
  the playhead), items **snap to alignment points across layers** — other items' edges, clip/junction
  boundaries, the playhead, reel start/end — so layers can be aligned precisely. A visible toggle
  disables it for free positioning.
- **Select any item → inspector shows *its* editable props**: transition → type/duration picker;
  overlay → text (AccentEditor) + position + timing; clip → source / trim / slip / focal / musicBoost;
  audio item → source / in-point / volume; brand layer → text / timing.
- **Volume visualization** — a clip with active audio shows its audio volume under it; the music
  track shows the derived effective envelope.
- **Slip** — a dedicated handle/toggle on clip and audio items shifts the source window without
  changing the item's slot.

## Model change, render, `/cut`, and migration

- A new **layered Zod schema** (tracks + item types).
- The **composition renders from the layered model** (new `CampaignReel` variant). Parity target is
  **"close, acceptable drift"** — not pixel-perfect (per the migration decision).
- **Derivation tool** `oldConfig → layeredModel`: breaks the existing rule-driven numbers into
  explicit layer items (overlay absolute times = segment start + `appearAt`; chevron/brand timing
  from rules; per-clip `musicBoost` from the +6/+10 rules; clip/broll audio items from
  `audioMode`/`audioSource`/`audioStartSec`). This is the migration engine AND the initializer.
- **Pilot:** run the derivation on **`pp-namesti-republiky`**, then verify it renders (close enough)
  and edits correctly in the new editor. This project is the reference cut.
- **Rollout:** after the pilot passes, apply the derivation to the remaining projects (mechanical;
  not required to be 1:1). Keep the old composition path until a project is flipped.
- **`/cut`** (new cuts) produces the layered model directly.

## Decomposition (three dependent sub-specs)

1. **Layered data model + render + derivation + pilot** *(foundational)* — the new schema
   (tracks/items), the new composition rendering from it ("close" parity), the **derivation tool**
   (old→layered), `/cut` emitting the layered model, and **piloting the derivation on
   `pp-namesti-republiky`** (render + edit validation). This sub-spec is done when the pilot project
   round-trips through the new model + editor acceptably.
2. **Multi-track timeline editor UI** — render all tracks, drag-timing with snapping (toggle),
   item-select → inspector routing, junction transitions, slip handles.
3. **Audio subsystem** — clip/broll audio items + independent audio slip, music base + per-clip
   `musicBoost` → derived envelope computation + its timeline visualization.

Sub-spec 1 is the foundation; 2 and 3 build on it (2 and 3 can overlap since audio visualization is
part of the timeline UI). Each gets its own spec → plan → implementation cycle.

## Non-goals (MVP)

- **Pixel-perfect** render parity with the old model — "close, acceptable drift" is the bar; the
  full rollout is mechanical and need not be 1:1.
- Manual keyframe editing of the music base envelope (envelope is derived from clip boosts for MVP;
  static base).
- Reordering clips by free drag ("slide"); duration changes (resize) + ripple cover time changes for
  MVP.
- Migrating *all* projects up front — only the **pilot** (`pp-namesti-republiky`) is in scope for
  sub-spec 1; the rest are a mechanical rollout after the pilot passes.

## What is reused (not rebuilt)

The editor UI pieces already built stay: `EditorShell`, `Inspector` (extended with per-item-type
routing), `AccentEditor`, `TransitionPicker`, `FrameOverlay`, the surgical Prettier-clean Save
(`updateDefaultPropsSurgically` + format hook), and the template-hosted Vite architecture. The
**Timeline** component and the **data model** are what change most.
