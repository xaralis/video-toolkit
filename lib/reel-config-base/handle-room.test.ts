import { describe, it, expect } from 'vitest';
import type { VideoItem } from './layered-schema';
import { handleRoomFrames, maxTransitionFrames, boundaryState, starvationMessage } from './handle-room';

const FPS = 30;
// A clip showing [1000,4000] of a 10s file: 30 frames of head, 180 of tail.
const clip: VideoItem = { id: 'v1', kind: 'clip', startMs: 0, endMs: 3000, source: 'a.mp4', sourceInMs: 1000, sourceOutMs: 4000 };
// Cut from the very start of its file: no head at all.
const atStart: VideoItem = { ...clip, id: 'v2', sourceInMs: 0, sourceOutMs: 3000 };
const photo: VideoItem = { id: 'p1', kind: 'photo', startMs: 0, endMs: 3000, source: 'a.jpg' };

describe('handleRoomFrames', () => {
  it('measures head from sourceInMs and tail from what follows sourceOutMs', () => {
    expect(handleRoomFrames(clip, 10000, FPS)).toEqual({ head: 30, tail: 180 });
  });

  it('reports no head for a clip cut from the start of its file', () => {
    expect(handleRoomFrames(atStart, 10000, FPS)).toEqual({ head: 0, tail: 210 });
  });

  // A false alarm before decode resolves would train users to ignore the badge.
  it('leaves the tail unbounded when the file duration is unknown', () => {
    expect(handleRoomFrames(clip, undefined, FPS).tail).toBe(Infinity);
  });

  it('treats a photo as unconstrained — it has no source window to lend from', () => {
    expect(handleRoomFrames(photo, undefined, FPS)).toEqual({ head: Infinity, tail: Infinity });
  });
});

describe('maxTransitionFrames', () => {
  const left = { head: 999, tail: 10 };
  const right = { head: 4, tail: 999 };

  // NOT simply "twice the scarcer side" — `transitionHandles`'s center split is
  // `floor(f/2)` before / `ceil(f/2)` after, so the two sides tolerate
  // different maxima: `before <= head` allows f up to `2*head + 1` (the odd
  // frame lands on the tail side), `after <= tail` allows f up to `2*tail`.
  // Here head=4 is the binding side: min(2*4+1, 2*10) = 9, not
  // min(4, 10) * 2 = 8 — the fixed-after-review value (Important 3).
  it('center allows one MORE than twice the binding side, because the odd frame goes to tail', () => {
    expect(maxTransitionFrames(left, right, 'center')).toBe(9);
  });

  it('start takes everything from the left clip, so the right lends nothing', () => {
    expect(maxTransitionFrames(left, right, 'start')).toBe(10);
  });

  it('end takes everything from the right clip', () => {
    expect(maxTransitionFrames(left, right, 'end')).toBe(4);
  });

  it('an absent neighbour (reel edge) does not constrain', () => {
    expect(maxTransitionFrames(left, undefined, 'center')).toBe(20);
  });

  // The exact regression named in the review: DEFAULT_TRANSITION_FRAMES (15)
  // against a head of 7 renders perfectly (before=7<=7, after=8<=tail) but the
  // old `min(head,tail)*2` formula capped this boundary at 14, one short.
  it('does not drop the odd frame when head is the binding side', () => {
    expect(maxTransitionFrames({ head: 999, tail: 999 }, { head: 7, tail: 999 }, 'center')).toBe(15);
  });

  // The asymmetry only helps the head side (the odd frame goes to tail by
  // `transitionHandles`'s Math.ceil) — when tail is instead the binding side,
  // the max stays exactly twice it, no bonus frame.
  it('does not add a spurious extra frame when tail is the binding side', () => {
    expect(maxTransitionFrames({ head: 999, tail: 7 }, { head: 999, tail: 999 }, 'center')).toBe(14);
  });
});

describe('boundaryState', () => {
  const roomy = { head: 999, tail: 999 };
  const t = (frames: number, alignment = 'center') => ({ kind: 'gradient-wipe', frames, alignment });

  it('is ok when both sides can lend what the transition asks for', () => {
    expect(boundaryState(t(20), roomy, roomy)).toBe('ok');
  });

  it('is ok for a cut regardless of room', () => {
    expect(boundaryState({ kind: 'cut' }, { head: 0, tail: 0 }, { head: 0, tail: 0 })).toBe('ok');
  });

  // A disabled transition lends nothing — transition-record.ts:62-67 makes the
  // boundary behave exactly as a hard cut, so it cannot starve.
  it('is ok for a disabled transition even with no room at all', () => {
    expect(boundaryState({ ...t(20), enabled: false }, { head: 0, tail: 0 }, { head: 0, tail: 0 })).toBe('ok');
  });

  it('is clamped when a shorter transition would fit', () => {
    expect(boundaryState(t(20), roomy, { head: 4, tail: 999 })).toBe('clamped');
  });

  it('is impossible when no alignment and no length can work', () => {
    expect(boundaryState(t(20), { head: 999, tail: 0 }, { head: 0, tail: 999 })).toBe('impossible');
  });

  it('does not report starvation while a duration is still unknown', () => {
    expect(boundaryState(t(20), undefined, undefined)).toBe('ok');
  });

  // The review's exact regression: DEFAULT_TRANSITION_FRAMES (15) at center
  // against a head of exactly 7 (before=7<=7) and a generous tail (after=8<=
  // tail) renders perfectly. The old `Math.min(head,tail)*2` formula reported
  // this as `clamped` — one frame short of what the boundary can actually
  // carry.
  it('is ok at the exact off-by-one boundary the review named (head=7, frames=15)', () => {
    expect(boundaryState(t(15), { head: 999, tail: 999 }, { head: 7, tail: 999 })).toBe('ok');
  });

  it('is clamped, not ok, one frame past that same boundary', () => {
    expect(boundaryState(t(16), { head: 999, tail: 999 }, { head: 7, tail: 999 })).toBe('clamped');
  });
});

describe('starvationMessage', () => {
  it('names the starved side and both numbers, not just "insufficient media"', () => {
    expect(starvationMessage({ kind: 'gradient-wipe', frames: 20, alignment: 'center' }, { head: 999, tail: 999 }, { head: 4, tail: 999 }))
      .toBe('Needs 10 frames before the cut, this clip has 4');
  });

  it('is null for a healthy boundary', () => {
    expect(starvationMessage({ kind: 'gradient-wipe', frames: 20, alignment: 'center' }, { head: 999, tail: 999 }, { head: 999, tail: 999 })).toBeNull();
  });

  it('names the tail side when only the tail is short', () => {
    expect(starvationMessage({ kind: 'gradient-wipe', frames: 20, alignment: 'center' }, { head: 999, tail: 4 }, { head: 999, tail: 999 }))
      .toBe('Needs 10 frames after the cut, this clip has 4');
  });

  // Both sides short at once must say so — an earlier version silently picked
  // one (the tail branch, via a wrong `>` comparison in boundaryState), which
  // on a healthy-looking boundary blamed the wrong clip; here both are
  // genuinely short and the user needs to know that, not a guess.
  it('names BOTH sides when both are short', () => {
    expect(starvationMessage({ kind: 'gradient-wipe', frames: 20, alignment: 'center' }, { head: 999, tail: 3 }, { head: 2, tail: 999 }))
      .toBe('Needs 10 frames before the cut (this clip has 2) and 10 frames after (this clip has 3)');
  });
});
