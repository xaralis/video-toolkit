# Summary of changes — core-fold segments + shared transitions (2026-07-24)

Follows the brand theming-module work (text overlay). Goal: brands consume **core
components for the core segment functions** (clip/broll/photo), watermark becomes
generic with switchable images, and — because the segment layer is now shared —
**roost transitions actually render** (they previously had no effect). All brand
commits are **unsigned** (1Password signing skipped per request).

## What was built — core (`progpce/core`)

| Piece | File | What it does |
|---|---|---|
| **SegmentMedia** | `lib/theming/segment/SegmentMedia.tsx` | The universal footage primitive: `Img`/`OffthreadVideo` cover + crop/focal (`cropCoverStyle`) + grade (`gradeFilter`) + Ken Burns (unifies roost's `direction` shorthand **and** campaign's explicit `from/to`) + trim/handles. |
| **Video registry** | `lib/theming/types.ts`, `brand-theme.ts`, `index.ts` | A per-kind video-renderer registry parallel to the overlay one: `VideoKind`, `BrandTheme.video?`, `resolveVideoRenderer`/`videoConfig`. Generic fallback for every kind = `SegmentMedia`. |
| **Shared at-cut assembly** | `lib/render/video-track.tsx` + `video-track-layout.ts` | `buildVideoNodes` + the pure `computeVideoLayout` — the handle-borrow overlap that makes real cross-transitions render. A **verbatim extract** of campaign's proven loop, now shared. |
| **Generic watermark** | `lib/theming/generic/GenericWatermark.tsx` | Brand watermark with **switchable images** (`assets[]` + `index`, or single `asset`), corner placement. |

Core commits: `1c6223e` (SegmentMedia+types) · `0d48f95` (registry/resolver) · `e03ab89` (buildVideoNodes) · `38f63af` (GenericWatermark) · `421f665` (zero-frame guard). 369 unit tests green. Final review (opus): **Ready to merge, no Critical/Important.**

## What changed — roost (`roost/video-toolkit`, commit `a2ec19c`)

- `RoostSegment` now wraps the **core `SegmentMedia`** with roost's vintage (film/vhs) + paper-frame; registered in `brandTheme.video.{photo,broll}`. Roost's bespoke `KenBurnsPhoto`/inline video are no longer the media source — the mechanics come from core.
- `LayeredRoostReel` renders the video track through the **shared `buildVideoNodes`** → **real cross-transitions now work.** Render-verified: a dissolve between two clips shows a genuine double-exposure cross-dissolve (was a hard cut before). Normal footage frame unchanged (vintage + paper + watermark intact).
- Watermark: **kept roost's own** — it recolors one PNG via CSS `mask-image` per `variant` (black/white/brown), which `GenericWatermark` (image-swap only) can't express. Not a regression.
- Because the editor writes transitions to a clip's `transitionOut` (which the shared assembly reads), **editor-set roost transitions now render** — the reported "no effect" bug is fixed.

## What changed — campaign (`progpce/video-toolkit`, commit `2713dae`)

- `LayeredCampaignReel` adopted the **shared `buildVideoNodes`** (drop-in of its own extracted loop; renders identical). 13 projects synced.
- **Kept its own ClipSegment/BrollSegment/PhotoSegment.** They already consume core `cropCoverStyle`/`gradeFilter` and now the shared assembly. Folding their media onto `SegmentMedia` would mean reconciling campaign's baked-in handle/trim-in-seconds math with SegmentMedia's raw `sourceInMs`+handles model — a timing-sensitive change to 13 production reels that can't be safely validated with still frames and no review available. Per your "if these are shared already, it's fine / cleanest where unsure" guidance, kept as-is.

## Kept brand-only (no core projection, as intended)

Outro, chevron, card + plates, captions, quote-pull/stat/source-tag/party-logos overlays, the PP legal disclaimer, roost's paper/sand backgrounds + vintage grain.

## Follow-ups (not done)

- **Campaign clip/broll/photo → `SegmentMedia`** — reviewable fold; do a per-kind before/after same-frame render gate to catch any handle/trim timing drift. (The core primitive is proven by roost.)
- Re-sign the unsigned brand commits (roost `a2ec19c`, campaign `2713dae`) when 1Password is available.
- Campaign `PersistentOverlay` could source its logo image from `GenericWatermark` (keeps its disclaimer).
- Submodule pins (`M toolkit` in both brand repos) point at core `421f665` detached — commit properly once the core branch is pushed.
- Earlier spawned chip: reconcile the overlay placement dropdown vocabulary vs `placementGeometry`.

## Design + trace
`docs/superpowers/specs/2026-07-24-core-fold-segments-design.md`; progress ledger `.superpowers/sdd/progress.md`.
