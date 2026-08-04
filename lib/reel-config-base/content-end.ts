import type { VideoItem } from './layered-schema';

/** Where the CONTENT ends (ms) — the end of the last non-`outro` video item,
 *  minus that item's own `transitionOut` overlap, because the outro's stinger
 *  starts drawing that many frames early. This is the span the brand lane
 *  (watermark/disclaimer) covers: brand marks are hidden during the outro.
 *
 *  Returns `undefined` when there is no content at all (empty track, or every
 *  item is an outro) so the caller picks its own fallback rather than inheriting
 *  a silent 0.
 *
 *  `transitionOut` is read defensively (`frames` via an unknown cast) for the
 *  same reason `TransitionSchema` is shape-only: a brand may register a kind
 *  core has never seen. */
export function contentEndMs(video: readonly VideoItem[], fps: number): number | undefined {
  let last: VideoItem | undefined;
  for (let i = video.length - 1; i >= 0; i--) {
    if (video[i].kind !== 'outro') {
      last = video[i];
      break;
    }
  }
  if (!last) return undefined;
  const overlapFrames = Number((last.transitionOut as { frames?: unknown } | undefined)?.frames) || 0;
  const overlapMs = overlapFrames ? Math.round((overlapFrames / fps) * 1000) : 0;
  return last.endMs - overlapMs;
}
