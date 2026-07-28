// THE TWO-INPUT CONTRACT — what Phase 4 Task 1.3 ADDED, pinned at the
// production call site.
//
// Not "the 13 correct kinds still render": that is what the change PRESERVES,
// and examples/layered-minimal's pixel harness measures it byte-for-byte. What
// this file pins is the capability that did not exist before:
//
//   a transition is invoked ONCE per boundary and receives BOTH clips,
//   compositing them itself — with `from`/`to` NULLABLE, so the reel's leading
//   and trailing edges are ordinary boundaries rather than special cases.
//
// Before 1.3 a presentation was mounted twice, once per side, and could never
// see the clip on the other side of the cut. Every assertion below fails if
// `lib/render/video-track.tsx` goes back to handing a node one input.
//
// Remotion's `Sequence` is mocked with a minimal frame-gating + time-rebasing
// implementation, because that is precisely the mechanism `buildVideoNodes`
// relies on to hand a transition a clip that still knows its own time base.
// Whether the REAL Sequence agrees is settled by the pixel harness, not here.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const clock = vi.hoisted(() => ({ frame: 0 }));

vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  const react = await import('react');
  // The accumulated `from` of every enclosing Sequence — Remotion's own time
  // rebasing, reduced to the one property these tests depend on.
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

import { useCurrentFrame } from 'remotion';
import { buildVideoNodes } from '@video-toolkit/lib/render/video-track';
import type { TransitionNodeProps, TransitionRegistry } from '@video-toolkit/lib/theming/transitions';
import type { VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

/** Every call the node saw, in order. */
const calls: Array<{ from: boolean; to: boolean; progress: number }> = [];

/** A two-input node that records its inputs and DRAWS BOTH — so "it received
 *  the input" is observable in the DOM, not only in a spy array. It also acts
 *  on a null input (the edge marker), which is the second capability 1.3 adds. */
const SpyComposite: React.FC<TransitionNodeProps> = ({ from, to, progress }) => {
  calls.push({ from: from !== null, to: to !== null, progress });
  return (
    <div data-testid="boundary">
      {from === null ? <div data-testid="no-from" /> : <div data-testid="from">{from}</div>}
      {to === null ? <div data-testid="no-to" /> : <div data-testid="to">{to}</div>}
    </div>
  );
};

const registry: TransitionRegistry = { spy: { renderer: () => ({ composite: SpyComposite }) } };

const clip = (id: string, startMs: number, endMs: number, extra: Record<string, unknown> = {}): VideoItem =>
  ({ id, kind: 'clip', startMs, endMs, source: `${id}.mp4`, sourceInMs: 0, sourceOutMs: endMs - startMs, ...extra }) as VideoItem;

const spyT = (frames = 10) => ({ kind: 'spy', frames });

function draw(items: VideoItem[], frame: number) {
  clock.frame = frame;
  calls.length = 0;
  return render(
    <>
      {buildVideoNodes(items, {
        renderItem: (item) => <div data-testid={`plate-${item.id}`} />,
        width: 540,
        height: 960,
        fps: 30,
        transitions: registry,
      })}
    </>,
  );
}

beforeEach(() => {
  calls.length = 0;
});

// Two 1s clips at 30fps meeting at frame 30, with a 10-frame transition. The
// handle split puts the boundary window at frames 25..35.
const CUT = [clip('a', 0, 1000, { transitionOut: spyT() }), clip('b', 1000, 2000)];

describe('a transition receives BOTH clips at a cut', () => {
  it('hands the node the outgoing AND the incoming clip in ONE call', () => {
    const { getByTestId } = draw(CUT, 30);
    expect(calls).toEqual([{ from: true, to: true, progress: 0.5 }]);
    // …and both are really on screen, inside the transition, not beside it.
    expect(getByTestId('from').querySelector('[data-testid="plate-a"]')).not.toBeNull();
    expect(getByTestId('to').querySelector('[data-testid="plate-b"]')).not.toBeNull();
  });

  it('invokes the node ONCE per boundary, not once per side', () => {
    draw(CUT, 30);
    expect(calls).toHaveLength(1);
  });

  it('draws each clip exactly once — the boundary takes the frames over', () => {
    const { queryAllByTestId } = draw(CUT, 30);
    expect(queryAllByTestId('plate-a')).toHaveLength(1);
    expect(queryAllByTestId('plate-b')).toHaveLength(1);
  });

  it('gives the outgoing clip its OWN time base inside the transition', () => {
    // Clip A's Sequence starts at composition frame 0; at frame 30 a body
    // mounted inside the transition must still read 30, not 5 (the boundary's
    // own local frame). The re-basing Sequence is what makes that true.
    const seen: number[] = [];
    const Probe: React.FC = () => {
      seen.push(useCurrentFrame());
      return null;
    };
    clock.frame = 30;
    calls.length = 0;
    render(
      <>
        {buildVideoNodes(CUT, {
          renderItem: (item) => (item.id === 'a' ? <Probe /> : null),
          width: 540,
          height: 960,
          fps: 30,
          transitions: registry,
        })}
      </>,
    );
    expect(seen).toEqual([30]);
  });
});

describe('from/to are NULLABLE — the reel edges are ordinary boundaries', () => {
  it('passes from === null at the leading edge, and the node can act on it', () => {
    const { getByTestId } = draw([clip('solo', 0, 1000, { transitionIn: spyT() })], 5);
    expect(calls).toEqual([{ from: false, to: true, progress: 0.5 }]);
    expect(getByTestId('no-from')).toBeTruthy();
    expect(getByTestId('to').querySelector('[data-testid="plate-solo"]')).not.toBeNull();
  });

  it('passes to === null at the trailing edge, and the node can act on it', () => {
    // A lone clip's transitionOut has no successor: window 20..30 of a 30-frame
    // clip. Before 1.3 this drew NOTHING at all — the "trailing edge fade" the
    // layout comment promised was unreachable, because the model needed a
    // successor to ENTER.
    const { getByTestId } = draw([clip('solo', 0, 1000, { transitionOut: spyT() })], 25);
    expect(calls).toEqual([{ from: true, to: false, progress: 0.5 }]);
    expect(getByTestId('no-to')).toBeTruthy();
    expect(getByTestId('from').querySelector('[data-testid="plate-solo"]')).not.toBeNull();
  });

});

describe('the boundary owns its window, the clips do not', () => {
  it('blanks both clips for the frames the transition draws them on', () => {
    // Outside the window each clip draws itself; inside, only the boundary does
    // (asserted above). Without the blanking, clip A would be painted twice at
    // frame 30 — once plainly, once inside the transition.
    const { queryAllByTestId } = draw(CUT, 20);
    expect(calls).toEqual([]);
    expect(queryAllByTestId('plate-a')).toHaveLength(1);
    expect(queryAllByTestId('plate-b')).toHaveLength(0);
  });

  it('runs progress 0 → 1 across the window, inclusive at both ends', () => {
    const seen: number[] = [];
    for (const frame of [25, 30, 35]) {
      draw(CUT, frame);
      seen.push(calls[0]?.progress);
    }
    expect(seen).toEqual([0, 0.5, 1]);
  });
});
