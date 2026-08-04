import { describe, it, expect } from 'vitest';
import {
  sourceToTimelineMs,
  timelineToSourceMs,
  headroomTimelineMs,
  tailroomTimelineMs,
  sourceAtTimelineMs,
} from './clip-time';

// 4s of source over 8s of timeline = 0.5x. The file holds 10s.
const slow = { startMs: 1000, endMs: 9000, sourceInMs: 2000, sourceOutMs: 6000 };
// 8s of source over 4s of timeline = 2x.
const fast = { startMs: 0, endMs: 4000, sourceInMs: 0, sourceOutMs: 8000 };
// The case every existing caller is written for.
const plain = { startMs: 0, endMs: 5000, sourceInMs: 1000, sourceOutMs: 6000 };

describe('the two directions are inverses', () => {
  it('a slowed clip stretches source into timeline', () => {
    expect(sourceToTimelineMs(slow, 1000)).toBe(2000);
    expect(timelineToSourceMs(slow, 2000)).toBe(1000);
  });

  it('a sped-up clip compresses timeline into source', () => {
    expect(sourceToTimelineMs(fast, 2000)).toBe(1000);
    expect(timelineToSourceMs(fast, 1000)).toBe(2000);
  });

  it('is the identity at 1x — which is why every existing formula still holds', () => {
    expect(sourceToTimelineMs(plain, 1234)).toBe(1234);
    expect(timelineToSourceMs(plain, 1234)).toBe(1234);
  });
});

describe('headroomTimelineMs — how far the LEFT edge may travel left', () => {
  it('is the source head, expressed in timeline ms', () => {
    // 2000ms of source before the in-point, at 0.5x, is 4000ms of timeline.
    expect(headroomTimelineMs(slow)).toBe(4000);
    expect(headroomTimelineMs(plain)).toBe(1000);
  });

  it('is zero at the source start, so the left edge is pinned', () => {
    expect(headroomTimelineMs({ ...slow, sourceInMs: 0 })).toBe(0);
  });
});

describe('tailroomTimelineMs — how far the RIGHT edge may travel right', () => {
  it('is the unused source tail, expressed in timeline ms', () => {
    // File 10000, out-point 6000 => 4000ms of source left; at 0.5x that is 8000.
    expect(tailroomTimelineMs(slow, 10000)).toBe(8000);
  });

  it('is Infinity when the footage length is unknown — an estimate must not clamp', () => {
    // Matches footageCapsById's contract: absent means "do not clamp", never zero.
    expect(tailroomTimelineMs(slow, undefined)).toBe(Infinity);
    expect(tailroomTimelineMs(slow, 0)).toBe(Infinity);
  });

  it('never reports negative room for an out-point authored past the file', () => {
    // Real case in these projects: file 10042ms, authored out 10300ms.
    expect(tailroomTimelineMs({ ...plain, sourceOutMs: 10300 }, 10042)).toBe(0);
  });
});

describe('sourceAtTimelineMs — the split point', () => {
  it('maps an absolute timeline position to the source frame showing there', () => {
    // 4000ms into a 0.5x clip that starts at 1000 => 2000ms of source consumed,
    // landing at sourceInMs 2000 + 2000 = 4000.
    expect(sourceAtTimelineMs(slow, 5000)).toBe(4000);
  });

  it('is the plain sum at 1x', () => {
    expect(sourceAtTimelineMs(plain, 2000)).toBe(3000);
  });
});
