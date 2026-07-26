// The pure "at-the-cut" video-track layout math — split out from
// video-track.tsx (see lib/render/README.md's transition-record.ts /
// at-cut-transitions.tsx split for the same reason): video-track.tsx also
// imports Remotion + at-cut-transitions.tsx for the JSX assembly
// (buildVideoNodes). Keeping computeVideoLayout in its own Remotion-free file
// lets it be unit-tested with no mock and no jsdom; video-track.tsx re-exports
// it so consumers can still import everything from one path.
// NOTE: this split is a convenience, not a necessity. Core DOES have
// `remotion` and `@remotion/transitions` (4.0.498, lib/editor/package.json),
// and a Remotion-importing module tests fine under `vi.mock('remotion')` —
// see lib/editor/src/at-cut-transitions.test.tsx.
import { getTransitionRecord, type TransitionRecord } from './transition-record';

export interface VideoLayoutEntry {
  index: number;
  inFrames: number;
  outFrames: number;
  inHalf: number;
  outHalf: number;
  seqFrom: number;
  seqDuration: number;
  inRecord: TransitionRecord | undefined;
  outRecord: TransitionRecord | undefined;
}

// Mirrors LayeredCampaignReel.tsx's videoNodes map exactly:
// - inRecord: the first item reads its OWN transitionIn; every other item
//   reads its PREDECESSOR's transitionOut (a boundary is rendered once, by
//   the item entering it).
// - outRecord: every item reads its OWN transitionOut (including the last —
//   that's the reel's trailing edge fade).
// - inHalf/outHalf: center-at-cut split (floor on the "before" side, ceil on
//   the "after" side), but only between two REAL items — isFirst/isLast
//   suppress the handle since there's no neighbouring footage to borrow.
export function computeVideoLayout(
  items: Array<{ startMs: number; endMs: number; transitionIn?: unknown; transitionOut?: unknown }>,
  fps: number,
): VideoLayoutEntry[] {
  const msToFrames = (ms: number) => Math.round((ms / 1000) * fps);

  return items.map((item, i) => {
    const itemStartF = msToFrames(item.startMs);
    const itemEndF = msToFrames(item.endMs);
    const normalDuration = itemEndF - itemStartF;

    const isFirst = i === 0;
    const isLast = i === items.length - 1;
    const prev = items[i - 1];

    const inRecord = isFirst
      ? getTransitionRecord(item.transitionIn as Record<string, unknown> | undefined)
      : getTransitionRecord(prev?.transitionOut as Record<string, unknown> | undefined);
    const outRecord = getTransitionRecord(item.transitionOut as Record<string, unknown> | undefined);
    const inFrames = inRecord ? Number(inRecord.frames) || 0 : 0;
    const outFrames = outRecord ? Number(outRecord.frames) || 0 : 0;

    const inHalf = !isFirst && inRecord ? Math.floor(inFrames / 2) : 0;
    const outHalf = !isLast && outRecord ? Math.ceil(outFrames / 2) : 0;

    const seqFrom = itemStartF - inHalf;
    const seqDuration = normalDuration + inHalf + outHalf;

    return {
      index: i,
      inFrames,
      outFrames,
      inHalf,
      outHalf,
      seqFrom,
      seqDuration,
      inRecord,
      outRecord,
    };
  });
}
