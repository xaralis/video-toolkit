import type { VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';
import { MIN_CLIP_MS, resizeBoundsMs } from './layered-adapter';

/** Why the editor would not let an edit go further. A CODE, never a sentence:
 *  this module is shared with non-UI consumers, and the wording belongs to the
 *  app layer (`app/block-reason-copy.ts`). */
export type BlockReason =
  | 'footage-head-exhausted'
  | 'footage-tail-exhausted'
  | 'min-clip-length'
  | 'music-source-end'
  | 'timeline-start'
  | 'transition-handle-starved';

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
  const { edge, posMs, maxMs, tolMs } = args;
  if (edge === 'in') return posMs <= tolMs ? 'timeline-start' : null;
  if (maxMs === undefined) return null;
  return posMs >= maxMs - tolMs ? 'music-source-end' : null;
}
