# Audio subsystem (sub-spec 3)

**Date:** 2026-07-22
**Status:** Approved (brainstorming) → plan
**Parent:** [layered-timeline-model-design](2026-07-21-layered-timeline-model-design.md) — sub-spec 3 of 3.
**Depends on:** sub-spec 1 (layered model + `LayeredCampaignReel` + `musicVolumeAt`) and sub-spec 2 (multi-track editor: `LayeredTimeline` xzdarcy, `LayeredInspector`, Music/Audio lanes), both complete.

## Problem

The multi-track editor renders the Audio and Music lanes as flat coloured blocks. The music's effective volume is imperative logic buried in the composition (`musicVolumeAt`/`classifyFrame`), invisible to the editor; the audio beds show no content. To edit audio meaningfully a reviewer needs to **see** the music volume envelope and the audio waveforms, and edit the music base + a bed's in-point.

## Decisions

### D1 — Derived music envelope, shared and visualized
The composition's per-frame music dynamics (`musicVolumeAt` + `classifyFrame` in `LayeredCampaignReel`: base volume, +6 dB under a silent broll, +10 dB over the outro, the last-1s outro fade, silence after the outro end) are extracted into a **pure shared function** `computeMusicEnvelope(reel, { fps })` in core (`lib/reel-config-base/` or `lib/editor` — see Architecture). The composition **consumes it** (replacing its inline logic — one source of truth), and the editor **draws it** as a line/area over the **Music lane**. It is **read-only**: you shape it indirectly by setting a clip's `musicBoostDb` (per the parent spec). Manual envelope keyframes are post-MVP.

### D2 — Audio waveforms on the tracks (editor-only)
Waveforms are drawn inside **Audio-lane** blocks (and the Music lane's source block) via xzdarcy's `getActionRender`. Peak data is computed in the browser: fetch each unique audio source → Web Audio `decodeAudioData` → downsample to peaks → **cache by source URL** (decoding is expensive; do it once per source). Each block draws the slice of its source waveform for its window (`sourceInMs` … `sourceInMs + span`). Until a source's peaks resolve, the block shows a flat placeholder. This is editor-only — the composition doesn't need peaks. **De-risk with a spike** (decode + render one real waveform) before wiring all blocks.

### D3 — Music inspector panel
Selecting the Music lane block routes the inspector to a **Music panel**: edit `tracks.music.baseVolumeDb` and `tracks.music.source`. (Add the `music` lane route to `LayeredInspector`; the Music block is already selectable though drag-locked.)

### D4 — Audio bed in-point via the inspector (slip)
Shifting **which part** of an inherited broll audio bed plays (independently of the video) is done through the audio item's existing inspector **"In-point (s)"** field (edits `sourceInMs`). This is the MVP "slip" (user's choice); a timeline slip-drag gesture is a deferred non-goal. Ensure audio-item selection + the in-point field round-trip cleanly (and that the waveform re-slices when the in-point changes).

## Architecture

- **`computeMusicEnvelope(reel, opts)`** — pure, in core (`lib/reel-config-base/music-envelope.ts`). Returns the effective music volume over the reel as a queryable form usable by (a) the composition per-frame (`volumeAt(frame)`) and (b) the editor to draw a polyline. Ported faithfully from the current `musicVolumeAt`/`classifyFrame` so render parity holds. The composition's `LayeredCampaignReel` imports and uses it (removing its inline copy).
- **`useAudioPeaks(sources: string[])`** — editor hook (`lib/editor/app/useAudioPeaks.ts`): resolves a `Map<source, Float32Array peaks>`; fetches from the editor's served public dir, decodes via a shared `AudioContext`, downsamples, caches (module-level cache keyed by URL so it survives re-renders). Returns peaks + a per-source loading flag.
- **`Waveform`** — a small presentational component (SVG polyline/bars) given peaks + a source window → draws the slice to fill its container. Used inside `getActionRender` for audio/music blocks.
- **`MusicEnvelope`** — overlay drawn on the Music lane row from `computeMusicEnvelope` samples (an SVG polyline positioned over the row, mapped time→x, dB→y).
- **`LayeredInspector`** — add the `music` route (base volume + source); the audio route already has the in-point field.
- Reuse: `LayeredTimeline`, `LayeredInspector`, the adapter, the composition. The Music lane's single block gains the envelope overlay + music waveform; Audio blocks gain waveforms.

## Scope (this sub-spec)
- `computeMusicEnvelope` shared function + composition adopts it + Music-lane envelope visualization.
- Audio waveforms (peaks hook + `Waveform` render in Audio/Music blocks), spike-validated.
- Music inspector panel (base volume + source).
- Audio bed in-point editing verified end-to-end (inspector) + waveform re-slice on change.

## Non-goals (deferred)
- Timeline **slip-drag gesture** for beds (inspector in-point is the MVP; the user chose this).
- **Manual music-envelope keyframes** (envelope stays derived from clip boosts; post-MVP).
- Waveforms in the composition/render (editor-only).
- Per-sample audio scrubbing / audio-only preview.

## Testing
- **`computeMusicEnvelope`** — pure unit tests: base level; +6 under a silent broll; +10 over the outro; last-1s linear fade; 0 after outro end; matches the values the old `musicVolumeAt` produced at sample frames (parity).
- **Composition parity** — after the composition adopts the shared function, re-render the pilot stills — must stay byte-identical (video) and the audio-affecting logic unchanged (the envelope is the same numbers).
- **Waveform spike** — decode + render one real pilot audio source's waveform in the browser; confirm it draws and slices to the window.
- **Editor round-trip** — select the Music block → edit base volume → envelope redraws + Save; select an audio bed → change in-point → waveform re-slices + Player reflects + Save.

## Reuse (not rebuilt)
The composition's existing `musicVolumeAt` math (ported into the shared function, not reinvented), `LayeredTimeline`/`LayeredInspector`/adapter, xzdarcy `getActionRender`, the surgical Save. New units: `music-envelope.ts` (core), `useAudioPeaks.ts` + `Waveform` + `MusicEnvelope` (editor).
