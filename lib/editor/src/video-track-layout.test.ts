import { describe, it, expect } from 'vitest';
// Imports from video-track-layout (not video-track.tsx) deliberately: the
// latter also pulls in Remotion + at-cut-transitions.tsx for buildVideoNodes,
// and core has no `remotion`/`@remotion/transitions` installed (see
// lib/render/README.md) — this pure layout function is re-exported from
// video-track.tsx too, but importing it here directly keeps this test
// Remotion-free, same as transition-record.test.ts.
import { computeVideoLayout } from '@video-toolkit/lib/render/video-track-layout';

const fps = 30;

describe('computeVideoLayout', () => {
  it('back-to-back items with no transitions get zero handles and exact spans', () => {
    const items = [
      { startMs: 0, endMs: 1000 },
      { startMs: 1000, endMs: 2000 },
    ];
    const layout = computeVideoLayout(items, fps);

    expect(layout).toHaveLength(2);
    expect(layout[0]).toMatchObject({
      index: 0,
      inHalf: 0,
      outHalf: 0,
      seqFrom: 0,
      seqDuration: 30,
      inRecord: undefined,
      outRecord: undefined,
    });
    expect(layout[1]).toMatchObject({
      index: 1,
      inHalf: 0,
      outHalf: 0,
      seqFrom: 30,
      seqDuration: 30,
      inRecord: undefined,
      outRecord: undefined,
    });
  });

  it('borrows handle frames across a real dissolve boundary between two items', () => {
    const items = [
      { startMs: 0, endMs: 1000, transitionOut: { kind: 'dissolve', frames: 30 } },
      { startMs: 1000, endMs: 2000 },
    ];
    const layout = computeVideoLayout(items, fps);

    // Item A (not last): outHalf = ceil(30/2) = 15, outRecord is the dissolve.
    expect(layout[0].outHalf).toBe(15);
    expect(layout[0].outRecord?.kind).toBe('dissolve');

    // Item B (not first): reads A's transitionOut as its in-boundary.
    // inHalf = floor(30/2) = 15, seqFrom = B.startF - 15, inRecord is the dissolve.
    expect(layout[1].inHalf).toBe(15);
    expect(layout[1].seqFrom).toBe(30 - 15);
    expect(layout[1].inRecord?.kind).toBe('dissolve');
  });

  it('first item with its own transitionIn gets inFrames/inRecord but zero inHalf', () => {
    const items = [
      { startMs: 0, endMs: 1000, transitionIn: { kind: 'fade', frames: 12 } },
      { startMs: 1000, endMs: 2000 },
    ];
    const layout = computeVideoLayout(items, fps);

    expect(layout[0].inHalf).toBe(0);
    expect(layout[0].inFrames).toBe(12);
    expect(layout[0].inRecord?.kind).toBe('fade');
  });

  it('treats a cut transition as no transition at all', () => {
    const items = [
      { startMs: 0, endMs: 1000, transitionOut: { kind: 'cut' } },
      { startMs: 1000, endMs: 2000 },
    ];
    const layout = computeVideoLayout(items, fps);

    expect(layout[0].outHalf).toBe(0);
    expect(layout[0].outRecord).toBeUndefined();
    expect(layout[1].inHalf).toBe(0);
    expect(layout[1].inRecord).toBeUndefined();
  });
});
