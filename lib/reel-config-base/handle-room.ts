import type { VideoItem } from './layered-schema';
import { isCut, transitionAlignmentOf, transitionHandles, msToFrames, TRANSITION_ALIGNMENTS } from './transition-schema';
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
  // Only clip/broll carry a REAL source window read here. `photo`/`card`/
  // `outro` genuinely hold their span outright and are correctly unbounded.
  // `multi-clip` is DIFFERENT: its `sources[]` (layered-schema.ts's `SubSource`)
  // carry real per-sub-clip `sourceInMs`/`sourceOutMs` windows, so it does NOT
  // "hold its span outright" — but nothing here reasons about which sub-clip
  // sits at the boundary, so it is treated as unbounded too, deliberately: a
  // false negative (missing a starved multi-clip boundary) is the safe
  // direction, the same one an unmeasured `fileMs` takes below. Tightening
  // this is future work, not a bug this file claims to fix.
  if (item.kind !== 'clip' && item.kind !== 'broll') return UNBOUNDED;
  const toFrames = (ms: number) => msToFrames(ms, fps);
  return {
    head: toFrames(item.sourceInMs),
    // Clamped at 0: a `sourceOutMs` that overruns the file (drift between an
    // authored trim and the file ffprobe actually measures — see
    // LayeredTimeline.tsx's `capMsById` comment, which documents this as real
    // data, not a hypothetical) would otherwise make `fileMs - sourceOutMs`
    // negative, and a negative "frames available" is nonsense that also
    // corrupts `maxTransitionFrames`'s arithmetic below.
    tail: fileMs && fileMs > 0 ? Math.max(0, toFrames(fileMs - item.sourceOutMs)) : Infinity,
  };
}

/** The longest transition this boundary can carry at `alignment`.
 *
 *  `start` spends the whole length from the left item's tail and `end` all
 *  from the right item's head — exact, no rounding involved.
 *
 *  `center` is NOT simply "twice the scarcer side": `transitionHandles` splits
 *  an odd frame count with `Math.floor` on the "before"/head side and
 *  `Math.ceil` on the "after"/tail side, so the two sides are asymmetric.
 *  `before = floor(f/2) <= head` allows `f` up to `2*head + 1` (the extra
 *  frame goes to the tail side); `after = ceil(f/2) <= tail` allows `f` only
 *  up to `2*tail`. The old `Math.min(head, tail) * 2` dropped that extra frame
 *  whenever `head` was the binding side, reporting a boundary that renders
 *  perfectly as starved by exactly one frame — fixed after the 2026-08-03
 *  whole-branch review (Important 3). An absent neighbour is the reel edge,
 *  which lends freely — the layout already suppresses handles there, and
 *  `Infinity` arithmetic here (`2 * Infinity + 1 === Infinity`) needs no
 *  special case. */
export function maxTransitionFrames(
  left: HandleRoom | undefined,
  right: HandleRoom | undefined,
  alignment: TransitionAlignment,
): number {
  const tail = left ? left.tail : Infinity;
  const head = right ? right.head : Infinity;
  if (alignment === 'start') return tail;
  if (alignment === 'end') return head;
  return Math.min(2 * head + 1, 2 * tail);
}

export type BoundaryState = 'ok' | 'clamped' | 'impossible';

/** Whether this boundary can be rendered as authored.
 *
 *  Tests the AUTHORED alignment's actual `before`/`after` split against
 *  `right.head`/`left.tail` directly, rather than collapsing to a single
 *  "max frames" scalar and comparing `frames` against it — the direct form is
 *  what `starvationMessage` below also needs (which side is short), and
 *  keeping one shared shape between the two means they cannot silently
 *  disagree about a boundary that `maxTransitionFrames`'s scalar reduction
 *  would report identically but for the wrong reason.
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
  const { before, after } = transitionHandles(frames, alignment);
  const headOk = !right || before <= right.head;
  const tailOk = !left || after <= left.tail;
  if (headOk && tailOk) return 'ok';
  const best = Math.max(...TRANSITION_ALIGNMENTS.map((a) => maxTransitionFrames(left, right, a)));
  return best >= 1 ? 'clamped' : 'impossible';
}

/** A diagnosis, not a label: which side is short and by how much, naming BOTH
 *  sides when both are short rather than silently picking one — an earlier
 *  version fell through to the tail branch whenever the head test used `>`
 *  against an already-fixed boundary, printing a tail shortfall on a boundary
 *  that was actually fine on both sides. "Insufficient media" tells a user
 *  something is wrong but not which clip to touch. Returns null when the
 *  boundary is fine. */
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
  const headShort = !!right && before > right.head;
  const tailShort = !!left && after > left.tail;
  if (headShort && tailShort) {
    return `Needs ${before} frames before the cut (this clip has ${right!.head}) and ${after} frames after (this clip has ${left!.tail})`;
  }
  if (headShort) return `Needs ${before} frames before the cut, this clip has ${right!.head}`;
  if (tailShort) return `Needs ${after} frames after the cut, this clip has ${left!.tail}`;
  // boundaryState's direct test and this one use the identical before/after
  // comparison, so if boundaryState said not-ok, one of the two above is
  // always true. Unreachable in practice; kept as a safe fallback rather than
  // a non-null assertion.
  return null;
}
