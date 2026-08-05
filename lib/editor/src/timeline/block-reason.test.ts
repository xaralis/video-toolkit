import { describe, it, expect } from 'vitest';
import { edgeBlockReason, musicBlockReason } from './block-reason';
import { MIN_CLIP_MS } from './layered-adapter';
import type { VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

// A 4s clip starting 1s into a source file. At 1x, the head can give back
// 1000ms and the tail reaches 1000 + decoded.
const clip = (over: Partial<VideoItem> = {}): VideoItem =>
  ({ id: 'v1', kind: 'clip', startMs: 2000, endMs: 6000, source: 'a.mp4',
     sourceInMs: 1000, sourceOutMs: 5000, ...over }) as VideoItem;

const TOL = 34; // one frame at 30fps

describe('edgeBlockReason', () => {
  it('is null in the middle of the range — nothing is blocking', () => {
    expect(edgeBlockReason({ item: clip(), decodedMs: 20000, edge: 'out', posMs: 7000, tolMs: TOL })).toBeNull();
    expect(edgeBlockReason({ item: clip(), decodedMs: 20000, edge: 'in', posMs: 1500, tolMs: TOL })).toBeNull();
  });

  it('names the head when the in-point is back at the start of the source', () => {
    // startMs 2000 − sourceInMs 1000 = 1000ms is as far left as it can go.
    expect(edgeBlockReason({ item: clip(), decodedMs: 20000, edge: 'in', posMs: 1000, tolMs: TOL }))
      .toBe('footage-head-exhausted');
  });

  it('names the tail when the out-point is at the end of the file', () => {
    // decoded 6000 − sourceIn 1000 = 5000ms of tail from startMs 2000 ⇒ 7000.
    expect(edgeBlockReason({ item: clip(), decodedMs: 6000, edge: 'out', posMs: 7000, tolMs: TOL }))
      .toBe('footage-tail-exhausted');
  });

  it('names the minimum length when an edge is squeezed against the other', () => {
    expect(edgeBlockReason({ item: clip(), decodedMs: 20000, edge: 'out', posMs: 2000 + MIN_CLIP_MS, tolMs: TOL }))
      .toBe('min-clip-length');
    expect(edgeBlockReason({ item: clip(), decodedMs: 20000, edge: 'in', posMs: 6000 - MIN_CLIP_MS, tolMs: TOL }))
      .toBe('min-clip-length');
  });

  it('lets the footage cap outrank the minimum length when both bind', () => {
    // A file with less than MIN_CLIP_MS of tail left: resizeVideoItem applies
    // the footage cap LAST and it wins (layered-adapter.ts) — the reason the
    // user is shown must agree with the clamp they actually got.
    const item = clip({ startMs: 0, endMs: 50, sourceInMs: 0, sourceOutMs: 50 });
    expect(edgeBlockReason({ item, decodedMs: 50, edge: 'out', posMs: 50, tolMs: TOL }))
      .toBe('footage-tail-exhausted');
  });

  it('answers within one frame of the bound, not only exactly on it', () => {
    // The library clamps in seconds and hands back floats; an exact compare
    // would report "nothing is blocking" for a handle that visibly stopped.
    expect(edgeBlockReason({ item: clip(), decodedMs: 6000, edge: 'out', posMs: 6980, tolMs: TOL }))
      .toBe('footage-tail-exhausted');
    expect(edgeBlockReason({ item: clip(), decodedMs: 6000, edge: 'out', posMs: 6900, tolMs: TOL }))
      .toBeNull();
  });

  it('says nothing for an undecoded source — there is no known cap to hit', () => {
    expect(edgeBlockReason({ item: clip(), decodedMs: undefined, edge: 'out', posMs: 999999, tolMs: TOL })).toBeNull();
  });

  it('says nothing for kinds that cannot be trimmed', () => {
    const card = { id: 'c', kind: 'card', startMs: 0, endMs: 3000 } as unknown as VideoItem;
    expect(edgeBlockReason({ item: card, decodedMs: 9000, edge: 'out', posMs: 3000, tolMs: TOL })).toBeNull();
  });

  it('answers in TIMELINE ms, not source ms, when the clip runs at 2x', () => {
    // Timeline span 2000..6000 (4000ms) plays back source span 1000..9000
    // (8000ms) ⇒ speed = 8000/4000 = 2. Every fixture above runs at 1x, where
    // timeline ms and source ms happen to agree — this repo has had SIX
    // timeline-ms/source-ms conflations, so this one pins that `edgeBlockReason`
    // reads `resizeBoundsMs` (which is itself in timeline ms) rather than
    // reasoning in source ms.
    const item = clip({ startMs: 2000, endMs: 6000, sourceInMs: 1000, sourceOutMs: 9000 });

    // Head bound: headroomTimelineMs = sourceToTimelineMs(sourceInMs) =
    // 1000 / speed(2) = 500ms of timeline headroom ⇒
    // minStartMs = round(startMs(2000) - 500) = 1500. (A source-ms reading
    // would instead put the head bound at startMs - sourceInMs = 1000.)
    expect(edgeBlockReason({ item, decodedMs: 20000, edge: 'in', posMs: 1500, tolMs: TOL }))
      .toBe('footage-head-exhausted');

    // Footage cap: with only 8000ms decoded (less than the authored
    // sourceOutMs of 9000), maxEndMs = round(startMs(2000) +
    // sourceToTimelineMs(decodedMs(8000) - sourceInMs(1000))) =
    // round(2000 + 7000/2) = round(2000 + 3500) = 5500 — short of the clip's
    // own endMs (6000), so this is the cap binding, not min-clip-length.
    // (A source-ms reading would instead put the cap at endMs - (sourceOutMs -
    // decodedMs) = 6000 - 1000 = 5000.)
    expect(edgeBlockReason({ item, decodedMs: 8000, edge: 'out', posMs: 5500, tolMs: TOL }))
      .toBe('footage-tail-exhausted');
  });
});

describe('musicBlockReason', () => {
  it('names the end of the music file', () => {
    expect(musicBlockReason({ edge: 'out', posMs: 30000, maxMs: 30000, tolMs: TOL })).toBe('music-source-end');
  });

  it('names the start of the timeline for the pinned left edge', () => {
    expect(musicBlockReason({ edge: 'in', posMs: 0, maxMs: 30000, tolMs: TOL })).toBe('timeline-start');
  });

  // Fix round, FINDING 2 (Important): `applyTimeline` discards any start
  // change for the music lane on commit regardless of direction — the left
  // handle is pinned at 0 whether it's dragged left (back toward 0, already
  // covered above) or right (away from 0). Only the leftward case was
  // explained; a rightward drag travelled, did nothing, and sprang back on
  // release with no message at all.
  it('names the start of the timeline for a RIGHTWARD drag of the pinned left edge too', () => {
    expect(musicBlockReason({ edge: 'in', posMs: 5000, maxMs: 30000, tolMs: TOL })).toBe('timeline-start');
  });

  it('is null away from both', () => {
    expect(musicBlockReason({ edge: 'out', posMs: 12000, maxMs: 30000, tolMs: TOL })).toBeNull();
  });
});
