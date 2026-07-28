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
import { getTransitionRecord, type TransitionRecord, type TransitionRecordOptions } from './transition-record';
// `transitionHandles` is the ONE decider for where a boundary's window sits
// relative to its cut — shared with the editor's transitions lane so the ruler
// and the render cannot disagree. `transitionAlignmentOf` defaults an unparsed
// value (see `getTransitionRecord`: a project's Root.tsx is hand-edited and
// never re-parsed at render time).
import { transitionAlignmentOf, transitionHandles } from '../reel-config-base/transition-schema';

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
//   that's the reel's trailing edge fade). TRUE SINCE PHASE 4 TASK 2.2, and a
//   wish before it: the last item's boundary has `to === null`, and until 2.2
//   the missing input was drawn as nothing, so seven kinds whose exiting branch
//   is the identity function ended the reel with no fade at all. A null input
//   now resolves to a plate of the composition background (`edgeInput`), which
//   is what makes this sentence describe what renders.
// - inHalf/outHalf: the frames each side lends, per the transition's own
//   `alignment` (default `center` — floor on the "before" side, ceil on the
//   "after" side), but only between two REAL items — isFirst/isLast suppress
//   the handle since there's no neighbouring footage to borrow.
export function computeVideoLayout(
  items: Array<{ startMs: number; endMs: number; transitionIn?: unknown; transitionOut?: unknown }>,
  fps: number,
  opts: TransitionRecordOptions = {},
): VideoLayoutEntry[] {
  const msToFrames = (ms: number) => Math.round((ms / 1000) * fps);

  return items.map((item, i) => {
    const itemStartF = msToFrames(item.startMs);
    const itemEndF = msToFrames(item.endMs);
    const normalDuration = itemEndF - itemStartF;

    const isFirst = i === 0;
    const isLast = i === items.length - 1;
    const prev = items[i - 1];

    // `opts` carries the brand's declared transition kinds (and the warn sink).
    // FEEDING IT IS NOT OPTIONAL POLISH: this is the only production call site
    // of `getTransitionRecord`, so an unfed `brandKinds` means every
    // brand-registered kind warns as unrecognised on the very reels it renders
    // correctly — a warning that cries wolf is a warning nobody reads when the
    // real typo arrives.
    const inRecord = isFirst
      ? getTransitionRecord(item.transitionIn as Record<string, unknown> | undefined, opts)
      : getTransitionRecord(prev?.transitionOut as Record<string, unknown> | undefined, opts);
    const outRecord = getTransitionRecord(item.transitionOut as Record<string, unknown> | undefined, opts);
    const inFrames = inRecord ? Number(inRecord.frames) || 0 : 0;
    const outFrames = outRecord ? Number(outRecord.frames) || 0 : 0;

    // The two sides of ONE cut read the SAME record (item i's `transitionOut`
    // is item i+1's `inRecord`), so they always agree on the alignment — the
    // window can never be claimed asymmetrically.
    //
    // EDGE CLAMPING: `!isFirst`/`!isLast` still zero the handle at the reel's
    // leading and trailing edges, and that now doubles as the answer to "what
    // does `end` do when there is nothing before the first clip?". It CLAMPS:
    // the transition plays inside the only clip there is, over the same frames
    // `center` would have used, rather than reaching for frames that do not
    // exist. Alignment describes how a cut is straddled; at a reel edge there
    // is no cut to straddle.
    const inHalf = !isFirst && inRecord ? transitionHandles(inFrames, transitionAlignmentOf(inRecord)).before : 0;
    const outHalf = !isLast && outRecord ? transitionHandles(outFrames, transitionAlignmentOf(outRecord)).after : 0;

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
