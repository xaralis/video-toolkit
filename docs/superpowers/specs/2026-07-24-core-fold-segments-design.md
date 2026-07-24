# Core-Fold Segments + Shared Transitions — Design

**Date:** 2026-07-24
**Status:** Approved direction (user); autonomous execution
**Repos:** core (`progpce/core`), campaign (`progpce/video-toolkit`), roost (`roost/video-toolkit`)

## Goal

Make both brands consume **core components for the core segment functions** — `clip`, `broll`, `photo` (text overlay already done via `lib/theming`). Brand-specific chrome (outro, chevron, card/plates, captions, PP disclaimer) stays brand-only with no core projection. Make the brand **watermark** generic with switchable images. And because the segment renderers become shared, make **roost transitions actually render** (currently no effect) by moving the at-cut *assembly* to core so both brands share it.

## What the investigation established

- **Core today** ships the segment *inputs* (schema, `deriveLayered`/`deriveMontageLayered`, and the pure CSS helpers `cropCoverStyle`/`focalObjectPosition`/`gradeFilter`/`segmentDurationFrames`) and the at-cut *engine* (`lib/render/at-cut-transitions.tsx`: `AtCutTransition`, `presentationFor`, `getTransitionRecord`) — but **no shared renderer** for clip/broll/photo/watermark. The `<video>`/`<img>` JSX is brand-side.
- **Campaign** clip/broll (`@brand-lib/segments/*`) already use core `cropCoverStyle`+`gradeFilter`; photo (`PhotoSegment`) is fully generic. The brand-specific parts are the `recordings/`/`broll/` path convention and the overlay dispatch (captions/quote-pull/stat/source-tag, PP-colored). Campaign's `LayeredCampaignReel` holds the **full at-cut assembly** (handle-borrow: `inHalf`/`outHalf` extend each Sequence's `from`/`duration`, `renderVideoItem` extends the clip trim by the same handles).
- **Roost** photo=`KenBurnsPhoto` (generic Img cover + ken burns) and broll=inline `OffthreadVideo` cover, each wrapped in roost's `vintageWrap` (film/vhs grain) + `displayModeWrap` (paper-frame: sand bg, roost border/shadow). Its `videoNodes` use a **naive** assembly: `outPresentation=null`, `outFrames=0`, no handles → transitions can't cross-dissolve (adjacent clips never co-exist on a frame). Its derivation only ever emits a hardcoded `{kind:'fade',frames:6}` and the generator hardcodes `"cut"`.
- The at-cut engine supports real cross-dissolve/glitch/wipe **only** when adjacent items' Sequences overlap (handle-extended) so A's `outPresentation` and B's `inPresentation` render simultaneously. That overlap assembly is the missing piece for roost.

## Architecture

Mirror the `lib/theming` overlay pattern (generic-or-brand-custom + registry) for the **video track**, add a shared **segment-media primitive** and a shared **video-track assembly**, and a **generic watermark**.

### 1. Core segment-media primitive — `lib/theming/segment/SegmentMedia.tsx`
The universal mechanics for a footage `VideoItem`, brand-agnostic:
- `clip`/`broll` → `<OffthreadVideo muted startFrom={trim + handle offset}>`; `photo` → `<Img>` (or `<OffthreadVideo>` for a video-photo by extension).
- `objectFit: 'cover'` + `cropCoverStyle(item.crop, item.focalX, item.focalY)` + `filter: gradeFilter(item.grade)`.
- **Ken Burns** interpolation from `item.effects` entry `{ type: 'ken-burns', ... }` (fromScale/toScale/fromX/toX/fromY/toY, or a `direction` shorthand) against `useCurrentFrame()`.
- Trim: `startFrom = round((sourceInMs/1000)*fps) - handleInFrames`; duration covers the handle-extended span.

Props: `interface VideoRenderProps { item: VideoItem; handles: { inHalf: number; outHalf: number }; config?: unknown; }` (dims/frame from Remotion hooks). `SegmentMedia` reads only the brand-agnostic fields; brand flavor is composed *around* it by a brand-custom renderer.

### 2. Core generic renderers + video registry — `lib/theming/`
- `generic/GenericClip.tsx`, `GenericBroll.tsx`, `GenericPhoto.tsx` = `SegmentMedia` with full-bleed defaults (no flavor). These are the fallbacks.
- Extend `BrandTheme`: `video?: Partial<Record<VideoKind, VideoRegistration>>`, `VideoKind = 'clip' | 'broll' | 'photo'`, `VideoRegistration = { renderer: VideoRenderer; config? }`, `VideoRenderer = React.FC<VideoRenderProps>`.
- `resolveVideoRenderer(theme, kind)` + `videoConfig(theme, kind)` — same shape as the overlay resolver. `GENERIC_VIDEO_RENDERERS = { clip: GenericClip, broll: GenericBroll, photo: GenericPhoto }`.

### 3. Shared video-track assembly — `lib/render/video-track.tsx`
Extract campaign's `videoNodes` handle-overlap loop into a core helper:
```ts
buildVideoNodes(videoTrack: VideoItem[], opts: {
  renderItem: (item, handles: {inHalf,outHalf}) => React.ReactNode,
  width: number; height: number; fps: number;
}): React.ReactNode[]
```
It computes per-boundary `inHalf`/`outHalf` from `getTransitionRecord(item.transitionIn ?? prev.transitionOut)` / `item.transitionOut`, sets `seqFrom = startF - inHalf`, `seqDuration = normal + inHalf + outHalf`, wraps in `<Sequence><AtCutTransition in/out .../></Sequence>`, and calls `renderItem(item, {inHalf,outHalf})`. Both brands pass their own `renderItem` (which resolves the per-kind renderer and threads handles into `SegmentMedia`). Campaign switches to this (render-verify **identical**); roost switches to this → **transitions work**.

### 4. Generic watermark — `lib/theming/generic/GenericWatermark.tsx`
Renders a `BrandLayerItem` (`kind:'watermark'`) from its `props`, supporting **switchable images**:
`props = { assets: string[]; index?: number; corner; sizePx; marginPx; alpha }` (or a single `asset` for back-compat → treated as `assets:[asset]`). The chosen image is `assets[index ?? 0]`. Positioned by `corner`. This is a core default renderer for the brand watermark; a brand may still register a custom one.

### 5. Brand adoption
- **Roost:** register `video.{photo,broll}` custom renderers that render `<SegmentMedia>` wrapped in roost's `vintageWrap`+`displayModeWrap` (moved into the renderer; the generic media mechanics now come from core, not `KenBurnsPhoto`/inline). `LayeredRoostReel` uses `buildVideoNodes` → real transitions. Roost watermark → `GenericWatermark` (its brand item already carries `asset`/`corner`/`variant`; extend to `assets[]`). Render-verify.
- **Campaign:** refactor `ClipSegment`/`BrollSegment`/`PhotoSegment` to get their media mechanics from `<SegmentMedia>` (keeping the `recordings/`/`broll/` path convention by mapping `source` before passing, and keeping their overlay dispatch around it). `LayeredCampaignReel` uses `buildVideoNodes`. Render-verify **unchanged**. Watermark: keep `PersistentOverlay` (bundles the PP legal disclaimer — genuinely brand-specific); optionally source its image via `GenericWatermark` later. If SegmentMedia adoption risks regressing campaign's tuned output, keep campaign segments as-is (they already consume core crop/grade) and record the divergence — "cleanest where unsure."

### Stays brand-only (no core projection)
Outro, chevron, card + plates, captions, quote-pull/stat/source-tag/party-logos overlays, PP legal disclaimer, roost paper/sand backgrounds + vintage grain assets.

## Verification
- Core: TDD for `SegmentMedia` (ken-burns/crop/trim math), the video registry resolver, `buildVideoNodes` handle math, `GenericWatermark`.
- Roost: `remotion still` — a photo/broll frame renders with vintage+paper-frame intact; a frame across a set clip→clip transition shows a real cross-effect (not a hard cut).
- Campaign: `remotion still` at matching frames — clip/broll/photo + transitions render **identical** to before.

## Deferred
- Extending `deriveMontageLayered`/`MontageSegment`/`build_cut.py` to *emit* real per-clip transitions (the editor path already lets a user set them; generator emission is a separate enhancement).
- Campaign `PersistentOverlay` adopting `GenericWatermark` for its image.
- The placement-vocabulary reconciliation (already spawned as a follow-up).
