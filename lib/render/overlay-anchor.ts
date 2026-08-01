// lib/render/overlay-anchor.ts — pure frame-domain rebase for an overlay
// item routed 'anchored' onto its owning video item (Phase 4 Task 4.1, spec
// docs/superpowers/sdd/2026-07-26-phase4-node-contract/task-4.1-brief.md).
//
// The guarantee this buys: flipping an overlay's `routing` between 'track'
// and 'anchored' never moves which COMPOSITION FRAME it appears on. Track
// overlays land at `Math.round(o.startMs / 1000 * fps)` (see
// `LayeredReelComposition`'s `msToFrames`). An anchored overlay must land on
// that exact same frame, offset only by the handle frames its parent video
// item borrowed at its in-edge.
import type { OverlayItem, VideoItem } from '../reel-config-base/layered-schema';

export interface AnchorTiming {
  /** Frame, relative to the PARENT item's own Sequence, where the anchored
   *  overlay's Sequence should start. */
  from: number;
  /** Length of the anchored overlay's own Sequence, in frames. */
  durationInFrames: number;
}

/** Rebase `overlay`'s [startMs, endMs) window into frames relative to `item`'s
 *  own Sequence, given the handle frames `item` borrowed for cross-item
 *  transitions.
 *
 *  PER-ENDPOINT ROUNDING — round each ms endpoint to ITS OWN frame first, then
 *  subtract — NOT `Math.round((overlay.startMs - item.startMs) / 1000 * fps)`.
 *  The two forms agree on most inputs and disagree exactly at rounding
 *  boundaries (see overlay-anchor.test.ts for constructed inputs where they
 *  give different answers — e.g. fps=30, item.startMs=2000, overlay.startMs
 *  =2050: per-endpoint frame 1, naive frame 2). Per-endpoint rounding is the
 *  one that reproduces the SAME frame `msToFrames` would compute for this
 *  overlay if it were routed 'track' instead — the naive form does not, and
 *  the whole point of this module is that routing must never move the
 *  picture. */
export function anchorTiming(
  overlay: OverlayItem,
  item: VideoItem,
  handles: { inHalf: number; outHalf: number },
  fps: number,
): AnchorTiming {
  const msToFrames = (ms: number) => Math.round((ms / 1000) * fps);
  const from = msToFrames(overlay.startMs) - msToFrames(item.startMs) + handles.inHalf;
  const durationInFrames = msToFrames(overlay.endMs) - msToFrames(overlay.startMs);
  return { from, durationInFrames };
}
