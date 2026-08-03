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

  it('center is twice the scarcer side, since each lends half', () => {
    expect(maxTransitionFrames(left, right, 'center')).toBe(8);
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
});

describe('starvationMessage', () => {
  it('names the starved side and both numbers, not just "insufficient media"', () => {
    expect(starvationMessage({ kind: 'gradient-wipe', frames: 20, alignment: 'center' }, { head: 999, tail: 999 }, { head: 4, tail: 999 }))
      .toBe('Needs 10 frames before the cut, this clip has 4');
  });

  it('is null for a healthy boundary', () => {
    expect(starvationMessage({ kind: 'gradient-wipe', frames: 20, alignment: 'center' }, { head: 999, tail: 999 }, { head: 999, tail: 999 })).toBeNull();
  });
});
