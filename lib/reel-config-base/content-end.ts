import type { LayeredReel, VideoItem } from './layered-schema';
import { computeTotalDurationMs } from './total-duration';

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

/** Pin every brand item to the derived content span `[0, contentEnd)`.
 *
 *  The brand lane is DERIVED, not authored: the watermark and disclaimer cover
 *  the content and stop before the outro. Nothing may author a different span —
 *  the editor offers no control for it (LayeredInspector's brand panel is
 *  read-only) and the timeline has `brand` in LOCKED_LANES. This is the function
 *  that makes that true after every edit; without it a trim of the last content
 *  clip leaves the brand end where it was.
 *
 *  Identity-preserving: returns the SAME reel when no brand item moves, because
 *  `useHistory.set` short-circuits on reference equality and a fresh object on
 *  every no-op write would mint an undo entry per keystroke. */
export function withDerivedBrandSpan(reel: LayeredReel, fps: number): LayeredReel {
  const endMs = contentEndMs(reel.tracks.video, fps) ?? computeTotalDurationMs(reel);
  let changed = false;
  const brand = reel.tracks.brand.map((b) => {
    if (b.startMs === 0 && b.endMs === endMs) return b;
    changed = true;
    return { ...b, startMs: 0, endMs };
  });
  if (!changed) return reel;
  return { ...reel, tracks: { ...reel.tracks, brand } };
}
