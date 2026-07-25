# LayeredReelComposition — one core assembly for all layered templates

**Date:** 2026-07-25
**Status:** approved (design), pending implementation plan
**Repos touched:** core (`xaralis/video-toolkit`), then `templates/roost-reels` (ROOST repo), then `templates/campaign-reels` (PP repo)

## Problem

The layered data model (`reel-config-base`: absolute-ms track items across
`video` / `audio` / `music` / `overlays` / `brand`) is shared core, but the
**assembly** of those tracks into Remotion nodes is only half extracted:

- `buildVideoNodes` (video track, at-cut transitions, handle borrowing) — core. Both templates use it.
- `computeMusicEnvelope` — core. Only campaign uses it; roost keeps a private inline envelope.
- **Audio (voice) track rendering — inline in `LayeredCampaignReel.tsx` only.**
  Roost never mounts `reel.tracks.audio` at all, so a roost reel cannot play
  clip voice even though its config schema (`audioMode: 'voice'`) and the
  derivation both support it.
- Overlays / brand track / background — hand-assembled per template.

Result: capability differences between brands (roost can't do talking-head
audio) that are **accidents of template history**, not design. A template today
chooses *which tracks to render*; it should only choose *how they look*.

## Goal

One core composition that renders **every track of the layered model
identically for every brand**; a template contributes only visual style —
renderers and tokens — through the existing theming-module mechanism.

## Non-goals

- Merging the `music` track into the `audio` track (music-as-just-another-
  audio-item). Deliberately deferred; see Future directions. The schema work
  here is designed not to block it.
- `web-program-intro` — not on the layered model; untouched.
- The footage-first `/toolkit:assemble` command — separate spec (stage 2).

## Design

### 1. Component

`toolkit/lib/render/layered-composition.tsx`:

```tsx
export const LayeredReelComposition: React.FC<{
  reel: LayeredReel;
  theme: CompositionTheme;
}>
```

Templates become thin wrappers — `LayeredRoostReel` / `LayeredCampaignReel`
keep their exported names and props (`{ reel }`) and render
`<LayeredReelComposition reel={reel} theme={brandCompositionTheme} />`.
`Root.tsx`, `calculateMetadata`, and the editor (`.editor/main.tsx` mounts the
template export) need no changes.

### 2. Theme contract

`CompositionTheme` extends the existing `BrandTheme`
(`toolkit/lib/theming/types.ts`) — same registration mechanism, widened to
cover the whole assembly:

- `background: string` — root `AbsoluteFill` color (campaign coal `#0a0a0a`,
  roost paper).
- `video`: per-kind registrations widened from `clip | broll | photo` to also
  accept `multi-clip | card | outro`. Unregistered kind → core generic (for
  clip/broll/photo) or `null` (for the rest), preserving today's behavior.
- `prepareVideoTrack?: (items: VideoItem[]) => VideoItem[]` — pre-pass before
  `buildVideoNodes` (roost's `withBurnLook` mask/glow injection).
- `overlays`: per-kind registrations for **all** overlay kinds, each with a
  routing mode:
  - `track` (default) — one absolute `Sequence` per item, core-mounted.
  - `anchored` — NOT rendered on the track; delivered to the owning video
    item's renderer via `VideoRenderProps.anchoredOverlays` (campaign `title`,
    whose caption-lift logic lives inside the footage body).
  Core knows the *modes*, never the kind names — a brand declares which of its
  kinds routes which way.

  A third mode, `singleton` (mounted once, unwrapped, capped at one node per
  kind), was introduced here for campaign's `chevron` and **has since been
  removed**: a reel may legitimately carry several chevrons at different points on
  the timeline, so chevron routes on the `track` like everything else, and nothing
  else ever adopted the mode. Dropping it also retired the z-ordering question of
  where unwrapped singletons paint relative to the overlay track.
- `renderBrandTrack?: (items: BrandLayerItem[]) => ReactNode` — one hook, the
  template decides (roost: `Watermark` per watermark item; campaign: a single
  `PersistentOverlay` spanning the union of brand-item spans, because that
  component renders watermark + disclaimer together).
- `resolveAudioSource?: (raw: string) => string` — override for the audio
  source prefix convention (default: `recordings/` unless already prefixed,
  matching campaign today).

### 3. Track assembly (core, identical for every brand)

| Track | Core behavior |
|---|---|
| video | `prepareVideoTrack` → `buildVideoNodes` (unchanged) → per-kind dispatch through theme registrations |
| audio | per item: `Sequence[startMs,endMs)` + `<Audio startFrom={sourceInMs} volume={…}/>`; volume = `dbToLinear(volumeDb ?? 0)` × per-item fade ramps, 0 when muted |
| music | `computeMusicEnvelope(reel)` → single `<Audio>` |
| overlays | per item by routing mode (see above); renderer receives the raw `OverlayItem` + brand config. Existing text renderers stay compatible via a thin adapter to today's `OverlayRenderProps` |
| brand | `renderBrandTrack(items)` |

`VideoRenderProps` gains two optional, core-supplied context fields:

- `anchoredOverlays: OverlayItem[]` — overlays with `anchorVideoId === item.id`
  whose kind is registered as `anchored`.
- `boundAudio?: AudioItem` — the audio item with `followsVideoId === item.id`
  (campaign derives captions from it via `transcriptWindow`; that logic stays
  in campaign's renderers — core only delivers the data).

### 4. Fade as a first-class schema citizen

Fades move from hardcoded render constants into the data model, editable in
the editor UI:

**Schema (`reel-config-base`):**
- `music` track: add `fadeInMs?`, `fadeOutMs?` (alongside existing `endMs`,
  `baseVolumeDb`).
- `AudioItemSchema`: add `fadeInMs?`, `fadeOutMs?` — same fields, same
  semantics, on any audio item.

**Render:**
- `computeMusicEnvelope` reads `fadeOutMs` from data instead of the fixed
  1-second constant; the fade anchors to `endMs` when set (today it hard-cuts
  there), else to the outro/content end. Derivation defaults `fadeOutMs` to
  1000 so existing reels render unchanged.
- Core audio nodes apply per-item fade ramps in the `volume` callback.

**Editor (`toolkit/lib/editor`):**
- Music inspector: fade-out (and fade-in) fields next to the existing
  end-trim.
- Audio item inspector (`LayeredInspector`): the same fade fields.

### 5. Migration order

1. **Core** — component, widened theming types, schema fade fields, envelope
   change, editor fields, tests. Backwards-compatible: existing template
   components keep working until they migrate.
2. **roost-reels** (ROOST repo, submodule bump) — wrapper + registrations
   (outro renderer, `withBurnLook` as `prepareVideoTrack`, watermark brand
   hook). Roost thereby gains the audio track (voice) and the core music
   envelope; its inline envelope is deleted. Parity note: roost's current
   fade anchors to `music.endMs`; the envelope change above makes core match
   before roost adopts it.
3. **campaign-reels** (PP repo, submodule bump) — `renderVideoItem` /
   `renderOverlayItem` bodies relocate into theme registrations; render bodies
   (FootageSegment etc.) untouched. Parity is most sensitive here (handle
   offsets, title/caption lift, chevron routing) — verify with tsc + vitest
   + before/after frame dumps on an existing pilot project.

Vendored template copies inside `projects/` are unaffected; projects pull the
new assembly via `/toolkit:sync-template` when they choose to.

### 6. Testing

- Core unit tests beside the existing `reel-config-base` / editor tests:
  audio-node math (startFrom/duration/fade ramps), overlay routing modes,
  envelope fade-to-trim behavior.
- Templates: `tsc --noEmit` + vitest + render smoke; campaign additionally the
  frame-dump parity check.

## Risks

- **Campaign parity** — the relocated dispatch logic carries subtle offset
  corrections (`frameOffsetSec`, handle-extended trims). Mitigated by moving
  the code as-is into registrations and the frame-dump comparison.
- **Two-repo choreography** — core must land and be pinned before either
  template migrates; each migration is an independent, revertable commit in
  its own repo.

## Future directions (explicitly deferred)

- **Music/audio unification** — music becomes an ordinary long-span audio
  item; the per-item `fadeInMs`/`fadeOutMs` fields introduced here are the
  same fields that unification would use, so no schema rework is expected.
- Migrating `web-program-intro` onto the layered model, at which point it
  consumes this composition for free.
