import type { VideoItem } from './layered-schema';
import { isCut, transitionAlignmentOf, transitionHandles, TRANSITION_ALIGNMENTS } from './transition-schema';
import type { TransitionAlignment } from './transition-schema';
import { isNodeEnabled } from './node-enabled';

/** Frames of source material a video item can lend on each side of itself:
 *  `head` is what exists BEFORE its in-point, `tail` what exists AFTER its
 *  out-point. A transition at a boundary is paid for out of these. */
export interface HandleRoom {
  head: number;
  tail: number;
}

const UNBOUNDED: HandleRoom = { head: Infinity, tail: Infinity };

/** What `item` can lend, given its file's measured length.
 *
 *  An UNKNOWN `fileMs` leaves the tail unbounded rather than zero — the same
 *  rule `resizeBoundsMs` uses. Reporting starvation from a not-yet-decoded
 *  source would fire on every reel the moment it opened, and a warning that
 *  cries wolf is worse than none. */
export function handleRoomFrames(item: VideoItem, fileMs: number | undefined, fps: number): HandleRoom {
  // Only clip/broll carry a source window. photo/card/outro/multi-clip hold
  // their span outright, so there is nothing to run out of.
  if (item.kind !== 'clip' && item.kind !== 'broll') return UNBOUNDED;
  const toFrames = (ms: number) => Math.floor((ms / 1000) * fps);
  return {
    head: toFrames(item.sourceInMs),
    tail: fileMs && fileMs > 0 ? toFrames(fileMs - item.sourceOutMs) : Infinity,
  };
}

/** The longest transition this boundary can carry at `alignment`.
 *
 *  `center` splits the length across both sides, so it is bounded by TWICE the
 *  scarcer side; `start` spends it all from the left item's tail and `end` all
 *  from the right item's head. An absent neighbour is the reel edge, which
 *  lends freely — the layout already suppresses handles there. */
export function maxTransitionFrames(
  left: HandleRoom | undefined,
  right: HandleRoom | undefined,
  alignment: TransitionAlignment,
): number {
  const tail = left ? left.tail : Infinity;
  const head = right ? right.head : Infinity;
  if (alignment === 'start') return tail;
  if (alignment === 'end') return head;
  return Math.min(tail, head) * 2;
}

export type BoundaryState = 'ok' | 'clamped' | 'impossible';

/** Whether this boundary can be rendered as authored.
 *
 *  `clamped` means a shorter length (or a different alignment) would fit;
 *  `impossible` means no alignment at any length ≥ 1 works, because
 *  `TransitionFrames` forbids zero. The remedy for `impossible` is to disable
 *  the transition — which lends no handles at all and leaves the clips where
 *  they are (see transition-record.ts) — but that is the user's call, applied
 *  in the editor, never here. */
export function boundaryState(
  transition: unknown,
  left: HandleRoom | undefined,
  right: HandleRoom | undefined,
): BoundaryState {
  // The three "there is nothing here" cases plus a disabled node all borrow
  // nothing, so they can never starve.
  if (isCut(transition) || !isNodeEnabled(transition)) return 'ok';
  const frames = (transition as { frames?: unknown }).frames;
  if (typeof frames !== 'number') return 'ok';
  const alignment = transitionAlignmentOf(transition);
  if (frames <= maxTransitionFrames(left, right, alignment)) return 'ok';
  const best = Math.max(...TRANSITION_ALIGNMENTS.map((a) => maxTransitionFrames(left, right, a)));
  return best >= 1 ? 'clamped' : 'impossible';
}

/** A diagnosis, not a label: which side is short and by how much. "Insufficient
 *  media" tells a user something is wrong but not which clip to touch. Returns
 *  null when the boundary is fine. */
export function starvationMessage(
  transition: unknown,
  left: HandleRoom | undefined,
  right: HandleRoom | undefined,
): string | null {
  if (boundaryState(transition, left, right) === 'ok') return null;
  const { before, after } = transitionHandles(
    (transition as { frames: number }).frames,
    transitionAlignmentOf(transition),
  );
  const headShort = right && before > right.head;
  if (headShort) return `Needs ${before} frames before the cut, this clip has ${right!.head}`;
  return `Needs ${after} frames after the cut, this clip has ${left ? left.tail : 0}`;
}
