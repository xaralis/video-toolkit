// TRANSITION ALIGNMENT, AT THE RENDER SITE — the same capability
// transition-alignment.test.ts pins in the layout math, pinned again where it
// is actually observable: WHICH FRAMES the transition plays on.
//
// The layout test can only say "the incoming clip lends 0 frames". This one
// says "at the cut frame the transition has not started yet, and ten frames
// later it is finished" — which is what an editor means by "Start at Cut", and
// what a wrong sign or a swapped handle would break without changing any
// single number the layout test looks at.
//
// Remotion's `Sequence` is mocked with the same minimal frame-gating +
// time-rebasing implementation two-input-transitions.test.tsx uses, because
// that is the mechanism `buildVideoNodes` places a boundary window with.
// Whether the REAL Sequence agrees is settled by the pixel harness, not here.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const clock = vi.hoisted(() => ({ frame: 0 }));

vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  const react = await import('react');
  const Offset = react.createContext(0);
  const Sequence: React.FC<{
    from?: number;
    durationInFrames?: number;
    children?: React.ReactNode;
  }> = ({ from = 0, durationInFrames = Number.POSITIVE_INFINITY, children }) => {
    const parent = react.useContext(Offset);
    const offset = parent + from;
    const local = clock.frame - offset;
    if (local < 0 || local >= durationInFrames) return null;
    return react.createElement(Offset.Provider, { value: offset }, children);
  };
  return {
    ...actual,
    Sequence,
    useCurrentFrame: () => clock.frame - react.useContext(Offset),
    useVideoConfig: () => ({ width: 540, height: 960, fps: 30, durationInFrames: 300, id: 't', defaultProps: {}, props: {} }),
    staticFile: (s: string) => s,
  };
});

import { buildVideoNodes } from '@video-toolkit/lib/render/video-track';
import { resetWarnOnce } from '@video-toolkit/lib/render/warn-once';
import type { TransitionComposite, TransitionPlanProps, TransitionRegistry } from '@video-toolkit/lib/theming/transitions';
import type { VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

// PHASE 5 TASK 5 — `{ composite: SpyComposite }` (a JSX component receiving
// `progress` as a prop, called once per live frame) is replaced with
// `{ plan: SpyPlan }`, a plain function. Every `(progress, frame)` pair the
// node was called with — not just `progress` alone — because `plan` is now
// ALSO sampled once per `buildVideoNodes` call regardless of whether the
// boundary is live (`wrapFor` in `lib/render/video-track.tsx`, learning
// whether either side declares a `wrap`), with the deliberately-inconsistent
// marker pair `{ progress: 0, frame: -1 }`. `progressAt` below filters that
// sample out, the same way `single-mount-assembly.test.tsx` does, so "has the
// transition begun" still means a genuine LIVE call, not the wrap probe.
const calls: Array<{ progress: number; frame: number }> = [];

const SpyPlan = (p: TransitionPlanProps): TransitionComposite => {
  calls.push({ progress: p.progress, frame: p.frame });
  return {};
};

const registry: TransitionRegistry = { spy: { renderer: () => ({ plan: SpyPlan }) } };

const clip = (id: string, startMs: number, endMs: number, extra: Record<string, unknown> = {}): VideoItem =>
  ({ id, kind: 'clip', startMs, endMs, source: `${id}.mp4`, sourceInMs: 0, sourceOutMs: endMs - startMs, ...extra }) as VideoItem;

/** Two 1s clips meeting at frame 30, with a 10-frame spy transition on the cut. */
const reel = (alignment?: string) => [
  clip('a', 0, 1000, { transitionOut: { kind: 'spy', frames: 10, ...(alignment ? { alignment } : {}) } }),
  clip('b', 1000, 2000),
];

const CUT = 30;

/** The transition's progress on `frame`, or null when it is not playing. */
function progressAt(items: VideoItem[], frame: number): number | null {
  clock.frame = frame;
  calls.length = 0;
  render(
    <>
      {buildVideoNodes(items, {
        renderItem: (item) => <div data-testid={`plate-${item.id}`} />,
        width: 540,
        height: 960,
        fps: 30,
        palette: undefined,
        transitions: registry,
      })}
    </>,
  );
  const live = calls.filter((c) => c.frame !== -1);
  return live.length === 0 ? null : live[0].progress;
}

beforeEach(() => {
  calls.length = 0;
});

describe('`start` plays the whole transition after the cut', () => {
  it('has not begun on the frame BEFORE the cut', () => {
    expect(progressAt(reel('start'), CUT - 1)).toBeNull();
  });

  it('begins ON the cut and finishes a full transition later', () => {
    expect(progressAt(reel('start'), CUT)).toBe(0);
    expect(progressAt(reel('start'), CUT + 5)).toBe(0.5);
    expect(progressAt(reel('start'), CUT + 10)).toBe(1);
  });

  it('is still playing where a centered transition would have finished', () => {
    // Centered, the window is [25, 35]; started, it is [30, 40]. Frame 38 is
    // the difference, and it is a frame of picture the old model could not
    // produce at all.
    expect(progressAt(reel(), 38)).toBeNull();
    expect(progressAt(reel('start'), 38)).toBe(0.8);
  });
});

describe('`end` plays the whole transition before the cut', () => {
  it('begins a full transition EARLY and is finished on the cut', () => {
    expect(progressAt(reel('end'), CUT - 10)).toBe(0);
    expect(progressAt(reel('end'), CUT - 5)).toBe(0.5);
    expect(progressAt(reel('end'), CUT)).toBe(1);
  });

  it('is already playing where a centered transition would not have started', () => {
    // Centered, the window is [25, 35]; ended, it is [20, 30]. Frame 22 is the
    // difference.
    expect(progressAt(reel(), 22)).toBeNull();
    expect(progressAt(reel('end'), 22)).toBe(0.2);
  });

  it('is over by the frame AFTER the cut', () => {
    expect(progressAt(reel('end'), CUT + 1)).toBeNull();
  });
});

// Task 1.3 left the overlapping-boundary defect (a clip shorter than its own
// in+out transition windows is composited twice) as a dev-only diagnostic, on
// the expectation that alignment would fix it in passing. It does not: a window
// is `frames` long whatever its alignment, so alignment only MOVES the overlap
// around. What alignment must not do is silence the diagnostic — the windows it
// is computed from are exactly the ones alignment re-times. See the note at the
// warning in lib/render/video-track.tsx for why the real fix is not this task's.
describe('the overlap diagnostic survives re-timed windows', () => {
  beforeEach(() => resetWarnOnce());

  const aligned = (alignment: string) => [
    clip('a', 0, 1000, { transitionOut: { kind: 'spy', frames: 10, alignment } }),
    // 300ms = 9 frames, shorter than either transition around it.
    clip('tiny', 1000, 1300, { transitionOut: { kind: 'spy', frames: 10, alignment } }),
    clip('c', 1300, 2300),
  ];

  it.each(['center', 'start', 'end'])('still names the short clip under %s alignment', (alignment) => {
    const warned: string[] = [];
    const spy = vi.spyOn(console, 'warn').mockImplementation((m: string) => void warned.push(m));
    try {
      progressAt(aligned(alignment) as VideoItem[], 30);
    } finally {
      spy.mockRestore();
    }
    expect(warned).toHaveLength(1);
    expect(warned[0]).toContain('"tiny"');
  });
});
