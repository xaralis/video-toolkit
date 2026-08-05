import type { VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';
import { MIN_CLIP_MS, resizeBoundsMs } from './layered-adapter';

/** Why the editor would not let an edit go further. A CODE, never a sentence:
 *  this module is shared with non-UI consumers, and the wording belongs to the
 *  app layer (`app/block-reason-copy.ts`).
 *
 *  A runtime array, not just a union type: `app/block-reason-copy.test.ts`
 *  imports `BLOCK_REASONS` to enumerate the codes it must cover. A hand-listed
 *  duplicate array in the test would type-check against a seventh code added
 *  here without ever noticing it lacks copy — only `Record<BlockReason, …>`
 *  would catch that, and only under `tsc`, a separate gate from the test run.
 *  Deriving the type FROM this array instead keeps the test's coverage claim
 *  actually true. */
export const BLOCK_REASONS = [
  'footage-head-exhausted',
  'footage-tail-exhausted',
  'min-clip-length',
  'music-source-end',
  'timeline-start',
  'transition-handle-starved',
] as const;

export type BlockReason = (typeof BLOCK_REASONS)[number];

/** The constraint binding a clip/broll edge at `posMs`, or null if it is free.
 *
 *  Answers "is this edge AT its limit", not "did the user try to go past it" —
 *  the handle is hard-stopped by an armed bound before any overshoot reaches
 *  us (see LayeredTimeline's onActionResizeStart), and at-the-limit is the
 *  same fact from the user's side.
 *
 *  `tolMs` exists because the timeline library works in seconds and hands back
 *  floats: an exact compare would report "free" for a handle that visibly
 *  stopped. One frame is the natural value. */
export function edgeBlockReason(args: {
  item: VideoItem;
  decodedMs: number | undefined;
  edge: 'in' | 'out';
  posMs: number;
  tolMs: number;
}): BlockReason | null {
  const { item, decodedMs, edge, posMs, tolMs } = args;
  const bounds = resizeBoundsMs(item, decodedMs);
  if (!bounds) return null; // not a trimmable kind

  if (edge === 'out') {
    // The footage cap outranks the length floor when both bind — matching the
    // commit clamp, which applies the cap LAST and lets it win.
    if (bounds.maxEndMs !== undefined && posMs >= bounds.maxEndMs - tolMs) return 'footage-tail-exhausted';
    if (posMs <= item.startMs + MIN_CLIP_MS + tolMs) return 'min-clip-length';
    return null;
  }

  // Head-then-min-clip: the OPPOSITE precedence from the commit clamp's
  // operator order in `resizeVideoItem` (which applies the footage cap LAST
  // on the out-edge, see the comment above). The two can only disagree for a
  // clip already shorter than MIN_CLIP_MS — there, the LIVE armed bound really
  // is `minStartMs` (there is no room left to hit the length floor first), so
  // the message this returns is still true of what the user's handle did.
  if (posMs <= bounds.minStartMs + tolMs) return 'footage-head-exhausted';
  if (posMs >= item.endMs - MIN_CLIP_MS - tolMs) return 'min-clip-length';
  return null;
}

/** The music bed: pinned at 0, end-trimmable to the length of its file. */
export function musicBlockReason(args: {
  edge: 'in' | 'out';
  posMs: number;
  maxMs: number | undefined;
  tolMs: number;
}): BlockReason | null {
  const { edge, maxMs, posMs, tolMs } = args;
  // The left handle is pinned at 0 unconditionally — `applyTimeline` discards
  // any start change for the music lane on commit, so dragging it right (not
  // just left, back toward 0) is just as much of a no-op. Reporting only the
  // leftward case left a rightward drag travelling, doing nothing, and
  // springing back on release with no explanation at all — the exact failure
  // this feature exists to remove.
  if (edge === 'in') return 'timeline-start';
  if (maxMs === undefined) return null;
  return posMs >= maxMs - tolMs ? 'music-source-end' : null;
}
