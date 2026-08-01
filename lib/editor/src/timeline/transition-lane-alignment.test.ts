import { describe, it, expect } from 'vitest';
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';
import { computeVideoLayout } from '@video-toolkit/lib/render/video-track-layout';
import { TRANSITION_ALIGNMENTS } from '@video-toolkit/lib/reel-config-base/transition-schema';
import { layeredToTimeline } from './layered-adapter';

// THE point of this file: the transitions LANE and the RENDERER must answer
// "where does this boundary sit" identically. They used to be two independent
// implementations — the lane drew every block unconditionally centred
// (`[cut - frames/2, cut + frames/2]`), while `computeVideoLayout` split the
// window per `alignment`. A `start`- or `end`-aligned boundary therefore
// rendered offset and was DRAWN centred, with nothing failing.
//
// Now both read `transitionHandles` (lib/reel-config-base/transition-schema.ts).
// This test does NOT restate the formula: it derives the expected window from
// the renderer's own output, so it goes red if either side drifts.
//
// MUTATION that must go red: replace the `transitionHandles(...)` call in
// `layered-adapter.ts`'s transitions loop with an unconditional
// `{ before: Math.floor(f/2), after: Math.ceil(f/2) }` — the pre-fix behaviour.
// The `start` and `end` cases fail; `center` stays green (it is the case the
// old code got right).

const fps = 30;
const CUT_MS = 5000;
const FRAMES = 12;

function reelWith(alignment: string | undefined): LayeredReel {
  return {
    version: 'layered-1',
    meta: { topic: 'Alignment', totalDurationMs: 9000 },
    tracks: {
      video: [
        {
          id: 'A',
          kind: 'clip',
          startMs: 0,
          endMs: CUT_MS,
          source: 'a.mp4',
          sourceInMs: 0,
          sourceOutMs: CUT_MS,
          transitionOut: alignment === undefined
            ? { kind: 'dissolve', frames: FRAMES }
            : { kind: 'dissolve', frames: FRAMES, alignment },
        },
        { id: 'B', kind: 'clip', startMs: CUT_MS, endMs: 9000, source: 'b.mp4', sourceInMs: 0, sourceOutMs: 4000 },
      ],
      audio: [],
      music: { baseVolumeDb: -8 },
      overlays: [],
      brand: [],
    },
  } as unknown as LayeredReel;
}

/** The window the RENDERER puts the boundary in, in seconds: the outgoing
 *  item's `outHalf` reaches forwards past the cut, the incoming item's `inHalf`
 *  reaches backwards before it. */
function rendererWindowSec(reel: LayeredReel) {
  const layout = computeVideoLayout(reel.tracks.video, fps, {});
  const cutF = Math.round((CUT_MS / 1000) * fps);
  return { start: (cutF - layout[1].inHalf) / fps, end: (cutF + layout[0].outHalf) / fps };
}

function laneBlock(reel: LayeredReel) {
  const rows = layeredToTimeline(reel, fps).editorData;
  const t = rows.find((r) => r.id === 'transitions')!.actions;
  expect(t).toHaveLength(1);
  return t[0];
}

describe('transitions lane geometry === renderer window', () => {
  for (const alignment of TRANSITION_ALIGNMENTS) {
    it(`matches the rendered window for alignment: '${alignment}'`, () => {
      const reel = reelWith(alignment);
      const want = rendererWindowSec(reel);
      const got = laneBlock(reel);
      // Millisecond rounding on the lane side (every lane is authored in ms),
      // frame arithmetic on the renderer side — equal to well under a frame.
      expect(got.start).toBeCloseTo(want.start, 2);
      expect(got.end).toBeCloseTo(want.end, 2);
    });
  }

  it("an omitted alignment is drawn exactly where 'center' is", () => {
    const bare = laneBlock(reelWith(undefined));
    const centred = laneBlock(reelWith('center'));
    expect(bare.start).toBe(centred.start);
    expect(bare.end).toBe(centred.end);
  });

  it("'start' puts the whole block AFTER the cut, 'end' the whole block BEFORE it", () => {
    // Not a restatement of the formula — the directional claim the alignment
    // vocabulary makes, which a centred lane cannot satisfy at all.
    const cutSec = CUT_MS / 1000;
    const start = laneBlock(reelWith('start'));
    expect(start.start).toBeCloseTo(cutSec, 3);
    expect(start.end).toBeGreaterThan(cutSec);

    const end = laneBlock(reelWith('end'));
    expect(end.end).toBeCloseTo(cutSec, 3);
    expect(end.start).toBeLessThan(cutSec);
  });

  it('an unrecognised alignment string falls back to the centred window, like the renderer', () => {
    const bogus = laneBlock(reelWith('sideways'));
    const centred = laneBlock(reelWith('center'));
    expect(bogus.start).toBe(centred.start);
    expect(bogus.end).toBe(centred.end);
  });
});
