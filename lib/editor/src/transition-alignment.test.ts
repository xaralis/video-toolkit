// TRANSITION ALIGNMENT — what Phase 4 Task 1.4 ADDED.
//
// Not "center still splits the cut in half": that is what the change
// PRESERVES, and examples/layered-minimal's pixel harness measures it
// byte-for-byte. What this file pins is the capability that did not exist
// before —
//
//   a transition can sit ENTIRELY AFTER the cut (`start`) or ENTIRELY BEFORE
//   it (`end`), instead of always straddling it half-and-half.
//
// The implementation is `transitionHandles` in
// lib/reel-config-base/transition-schema.ts, consumed by `computeVideoLayout`
// (lib/render/video-track-layout.ts) and by the editor's transitions lane —
// one decider, two readers (see src/timeline/transition-lane-alignment.test.ts).
// `start` and `end` are pinned separately
// because they are not symmetric in effect (one borrows handles from the
// incoming clip, the other from the outgoing), and each is pinned at an ODD
// frame count too, which is where an off-by-one hides.
import { describe, it, expect } from 'vitest';
import { computeVideoLayout } from '@video-toolkit/lib/render/video-track-layout';
import {
  TransitionSchema,
  TRANSITION_ALIGNMENTS,
} from '@video-toolkit/lib/reel-config-base/transition-schema';

const fps = 30;

/** Two 1s clips meeting at frame 30, with one transition on the cut between
 *  them — a real INTERIOR cut, with real footage on both sides, which is the
 *  only place alignment has anything to align to. */
const pair = (t: Record<string, unknown>) => [
  { startMs: 0, endMs: 1000, transitionOut: t },
  { startMs: 1000, endMs: 2000 },
];

const CUT_FRAME = 30;

describe('alignment: start — the whole transition sits AFTER the cut', () => {
  it('takes no handle from the incoming clip and the full length from the outgoing one', () => {
    const layout = computeVideoLayout(pair({ kind: 'dissolve', frames: 10, alignment: 'start' }), fps);

    // The outgoing clip is held for the whole transition past the cut…
    expect(layout[0].outHalf).toBe(10);
    // …and the incoming clip is NOT pulled in early: it starts on the cut.
    expect(layout[1].inHalf).toBe(0);
    expect(layout[1].seqFrom).toBe(CUT_FRAME);
  });

  it('puts the boundary window at [cut, cut+frames] — nothing before the cut', () => {
    const layout = computeVideoLayout(pair({ kind: 'dissolve', frames: 10, alignment: 'start' }), fps);

    // The boundary starts at the incoming item's seqFrom (video-track.tsx) and
    // runs `inFrames` long.
    const start = layout[1].seqFrom;
    expect([start, start + layout[1].inFrames]).toEqual([CUT_FRAME, CUT_FRAME + 10]);
    // The outgoing clip really does reach the far end of that window.
    expect(layout[0].seqFrom + layout[0].seqDuration).toBe(CUT_FRAME + 10);
  });

  it('takes the FULL odd frame count, not floor/ceil of it', () => {
    const layout = computeVideoLayout(pair({ kind: 'dissolve', frames: 11, alignment: 'start' }), fps);

    expect(layout[0].outHalf).toBe(11); // not ceil(11/2) = 6
    expect(layout[1].inHalf).toBe(0); // not floor(11/2) = 5
  });
});

describe('alignment: end — the whole transition sits BEFORE the cut', () => {
  it('takes the full length from the incoming clip and no handle from the outgoing one', () => {
    const layout = computeVideoLayout(pair({ kind: 'dissolve', frames: 10, alignment: 'end' }), fps);

    // The incoming clip is pulled in a whole transition early…
    expect(layout[1].inHalf).toBe(10);
    expect(layout[1].seqFrom).toBe(CUT_FRAME - 10);
    // …and the outgoing clip is NOT held past the cut: it ends on it.
    expect(layout[0].outHalf).toBe(0);
    expect(layout[0].seqFrom + layout[0].seqDuration).toBe(CUT_FRAME);
  });

  it('puts the boundary window at [cut-frames, cut] — nothing after the cut', () => {
    const layout = computeVideoLayout(pair({ kind: 'dissolve', frames: 10, alignment: 'end' }), fps);

    const start = layout[1].seqFrom;
    expect([start, start + layout[1].inFrames]).toEqual([CUT_FRAME - 10, CUT_FRAME]);
  });

  it('takes the FULL odd frame count, not floor/ceil of it', () => {
    const layout = computeVideoLayout(pair({ kind: 'dissolve', frames: 11, alignment: 'end' }), fps);

    expect(layout[1].inHalf).toBe(11); // not floor(11/2) = 5
    expect(layout[0].outHalf).toBe(0); // not ceil(11/2) = 6
  });
});

describe('alignment: center is the default, and unchanged', () => {
  // The harness proves byte-identity; these two only guard the DEFAULTING path
  // — an absent field and a value from a stale config must both land on the
  // exact floor/ceil split, never on `start`'s or `end`'s.
  it.each([
    ['absent', undefined],
    ['explicit center', 'center'],
    ['an unrecognised value from a hand-edited config', 'middle'],
  ])('%s → floor before the cut, ceil after it', (_label, alignment) => {
    const layout = computeVideoLayout(pair({ kind: 'dissolve', frames: 11, ...(alignment ? { alignment } : {}) }), fps);

    expect(layout[1].inHalf).toBe(5); // floor(11/2)
    expect(layout[0].outHalf).toBe(6); // ceil(11/2)
  });
});

// The frames `start`/`end` ask for at a reel edge do not exist. The choice is
// CLAMP, not overrun: the transition plays inside the only clip there is.
describe('alignment at the reel edges is clamped, not overrun', () => {
  it('`end` on the FIRST item’s own transitionIn does not reach before frame 0', () => {
    const items = [
      { startMs: 0, endMs: 1000, transitionIn: { kind: 'fade', frames: 12, alignment: 'end' } },
      { startMs: 1000, endMs: 2000 },
    ];
    const layout = computeVideoLayout(items, fps);

    expect(layout[0].inHalf).toBe(0);
    expect(layout[0].seqFrom).toBe(0);
    // The transition is still THERE — it just plays over the item's own frames.
    expect(layout[0].inFrames).toBe(12);
    expect(layout[0].inRecord?.kind).toBe('fade');
  });

  it('`start` on the LAST item’s own transitionOut does not reach past the reel', () => {
    const items = [
      { startMs: 0, endMs: 1000 },
      { startMs: 1000, endMs: 2000, transitionOut: { kind: 'fade', frames: 12, alignment: 'start' } },
    ];
    const layout = computeVideoLayout(items, fps);

    expect(layout[1].outHalf).toBe(0);
    expect(layout[1].seqFrom + layout[1].seqDuration).toBe(60);
    expect(layout[1].outFrames).toBe(12);
  });
});

describe('alignment is a property of the TRANSITION, so brand kinds get it too', () => {
  it('a brand-authored kind aligns exactly as a core kind does', () => {
    const layout = computeVideoLayout(pair({ kind: 'my-brand-thing', frames: 10, alignment: 'start' }), fps, {
      brandKinds: ['my-brand-thing'],
    });

    expect(layout[0].outHalf).toBe(10);
    expect(layout[1].inHalf).toBe(0);
  });
});

describe('the schema carries alignment on BOTH branches', () => {
  it.each(TRANSITION_ALIGNMENTS)('accepts %s on a core kind', (alignment) => {
    const parsed = TransitionSchema.safeParse({ kind: 'dissolve', frames: 10, alignment });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toEqual({ kind: 'dissolve', frames: 10, alignment });
  });

  it.each(TRANSITION_ALIGNMENTS)('accepts %s on a brand kind, alongside its own params', (alignment) => {
    const parsed = TransitionSchema.safeParse({ kind: 'my-brand-thing', frames: 10, alignment, swirl: 3 });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toEqual({ kind: 'my-brand-thing', frames: 10, alignment, swirl: 3 });
  });

  it('refuses a value outside the vocabulary on a core kind', () => {
    expect(TransitionSchema.safeParse({ kind: 'dissolve', frames: 10, alignment: 'middle' }).success).toBe(false);
  });

  // Pinned separately from the core case, and it is the assertion that pays for
  // the intersection: `BrandTransitionSchema` is `.passthrough()`, so a brand
  // transition would carry an `alignment` key either way — but only a DECLARED
  // field makes a nonsense value fail to parse instead of sailing through to the
  // renderer as an unknown string.
  it('refuses a value outside the vocabulary on a brand kind too', () => {
    expect(TransitionSchema.safeParse({ kind: 'my-brand-thing', frames: 10, alignment: 'middle' }).success).toBe(false);
  });

  it('leaves a transition without alignment exactly as it was', () => {
    const t = { kind: 'dissolve', frames: 10 };
    expect(TransitionSchema.parse(t)).toEqual(t);
    expect(Object.keys(TransitionSchema.parse(t) as object)).toEqual(['kind', 'frames']);
  });
});
