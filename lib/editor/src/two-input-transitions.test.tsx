// THE TWO-INPUT CONTRACT — what Phase 4 Task 1.3 ADDED, pinned at the
// production call site.
//
// Not "the 13 correct kinds still render": that is what the change PRESERVES,
// and examples/layered-minimal's pixel harness measures it byte-for-byte. What
// this file pins is the capability that did not exist before:
//
//   a transition is invoked ONCE per boundary and receives BOTH clips — with
//   `from`/`to` NULLABLE, so the reel's leading and trailing edges are
//   ordinary boundaries rather than special cases.
//
// Before 1.3 a presentation was mounted twice, once per side, and could never
// see the clip on the other side of the cut. Every assertion below fails if
// `lib/render/video-track.tsx` goes back to handing a node one input.
//
// PHASE 5 TASK 5 — "receives BOTH clips, COMPOSITING THEM ITSELF" is no longer
// the whole story, and this file's fixture and several assertions changed
// with it. Under the `composite` arm a node received its two inputs as
// already-instantiated REACT SUBTREES and drew them itself (`from`/`to` props
// on a JSX component); under the single-mount `plan` arm (the only arm left —
// `TransitionNode.composite` is deleted, `lib/theming/transitions.ts`) a node
// receives `LayerHandle`s (a `{range}` descriptor, not a subtree) and only
// STYLES the shell around a clip `LayerShell` already mounted — it never
// draws anything itself. The capabilities this file title promises (one call
// per boundary, both clips, nullable edges) are UNCHANGED and still pinned
// below, adapted to receive handles instead of subtrees; the ONE capability
// that inverted outright ("the boundary owns its window, the clips do not:
// blanks both clips for the frames the transition draws them on") is called
// out at its own site, because the `plan` arm's whole point is the opposite —
// every item stays mounted for its entire life, transition window included.
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
import { resetWarnOnce } from '@video-toolkit/lib/render/warn-once';
import type { TransitionComposite, TransitionPlanProps, TransitionRegistry } from '@video-toolkit/lib/theming/transitions';
import type { VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

/** Every call the node saw, in order — INCLUDING the frame:-1 "does this
 *  boundary declare a wrap" sample `wrapFor` (`lib/render/video-track.tsx`)
 *  takes once per `buildVideoNodes` call, live window or not. `liveCalls()`
 *  below filters it out, the same way `single-mount-assembly.test.tsx` and
 *  `transition-alignment-render.test.tsx` do. */
const calls: Array<{ from: boolean; to: boolean; progress: number; frame: number }> = [];

/** PHASE 5 TASK 5 — `SpyComposite` (a JSX component that received its two
 *  inputs as already-mounted subtrees and drew them itself) is replaced with
 *  `spyPlan`, a plain function that receives `LayerHandle`s (never a subtree)
 *  and records what it was called with. It draws nothing — under the `plan`
 *  arm the clips are ALREADY mounted by `LayerShell` before the node is ever
 *  asked anything; "it received the input" is what `calls` below records,
 *  and "the real clip is on screen" is checked directly through
 *  `renderItem`'s own testid, not through anything this node renders. */
const spyPlan = (p: TransitionPlanProps): TransitionComposite => {
  calls.push({ from: p.from !== null, to: p.to !== null, progress: p.progress, frame: p.frame });
  return {};
};

/** Only the genuine LIVE calls, projected to the fields every test compares —
 *  `frame` itself is dropped once it has done its filtering job, so `toEqual`
 *  against a plain `{from, to, progress}` literal still reads the same as it
 *  did against the old composite's props. */
const liveCalls = () =>
  calls.filter((c) => c.frame !== -1).map(({ from, to, progress }) => ({ from, to, progress }));

/** PHASE 5 TASK 5 — a `plan` boundary is also sampled by `auditGhosts`
 *  (`lib/render/video-track-plan.tsx`) on every LIVE frame, in any
 *  non-production environment: 5 extra calls at the fixed checkpoint
 *  progresses `[0, 0.25, 0.5, 0.75, 1]`, purely to dev-warn on a `ghosts`
 *  count that varies with progress. That is unrelated to what this file
 *  pins (a boundary hands the node ONE call, both sides, one progress) and
 *  would otherwise contaminate every exact-call-count/array assertion below
 *  — the same instrumentation `dev-warnings.test.tsx` already toggles
 *  `NODE_ENV` around for the identical reason (`isDevEnvironment()`'s own
 *  gate). Toggling it here, only around the render, isolates the ONE real
 *  call `spyPlan` sees without disabling `warnOnce`'s dev gate file-wide —
 *  the "overlapping boundaries are diagnosed" describe block below still
 *  needs that warning to fire. */
function drawWithoutGhostAudit(items: VideoItem[], frame: number) {
  const prior = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    return draw(items, frame);
  } finally {
    process.env.NODE_ENV = prior;
  }
}

const registry: TransitionRegistry = { spy: { renderer: () => ({ plan: spyPlan }) } };

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
        palette: undefined,
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
  it('hands the node the outgoing AND the incoming clip handles in ONE call', () => {
    const { queryAllByTestId } = drawWithoutGhostAudit(CUT, 30);
    expect(liveCalls()).toEqual([{ from: true, to: true, progress: 0.5 }]);
    // …and both are really on screen — mounted by `LayerShell`, not by
    // anything the node itself draws (the `plan` arm gives it handles, not
    // subtrees; see this file's own header comment).
    expect(queryAllByTestId('plate-a')).toHaveLength(1);
    expect(queryAllByTestId('plate-b')).toHaveLength(1);
  });

  it('invokes the node ONCE per boundary, not once per side', () => {
    drawWithoutGhostAudit(CUT, 30);
    expect(liveCalls()).toHaveLength(1);
  });

  it('draws each clip exactly once — never a double image at the cut', () => {
    const { queryAllByTestId } = draw(CUT, 30);
    expect(queryAllByTestId('plate-a')).toHaveLength(1);
    expect(queryAllByTestId('plate-b')).toHaveLength(1);
  });

  it('gives the outgoing clip its OWN time base inside the transition', () => {
    // Clip A's Sequence starts at composition frame 0; at frame 30 a body
    // mounted inside the transition must still read 30, not 5 (the boundary's
    // own local frame). PHASE 5 TASK 5 — this is trivially true under the
    // `plan` arm now rather than depending on a re-basing Sequence: there is
    // no separate boundary Sequence creating a second, rebased copy any more
    // (the whole `composite`-arm assembly — `ItemBody`, `rebased()`, the
    // boundary `<Sequence>` — is deleted); the clip's own single, continuous
    // Sequence covers its whole life, transition window included, so its own
    // time base was never at risk of disagreeing with the composition's.
    // Kept as a pin anyway: it is still a real property a future regression
    // could break (e.g. a `plan`-arm shell that DID introduce a rebased
    // wrapper), and it costs nothing to keep asserting.
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
          palette: undefined,
          transitions: registry,
        })}
      </>,
    );
    expect(seen).toEqual([30]);
  });
});

describe('from/to are NULLABLE — the reel edges are ordinary boundaries', () => {
  it('passes from === null at the leading edge, and the node can act on it', () => {
    // PHASE 5 TASK 5 — the old assertion also checked `getByTestId('no-from')`
    // and a `to` wrapper div the SPY rendered; a `plan` renders neither (it
    // gets a handle, not a subtree — see this file's header comment), so
    // "the node can act on it" is exactly what `liveCalls()` below records,
    // and "the real clip is still on screen" is checked directly through
    // `renderItem`'s own testid, materialised by `LayerShell`, not the node.
    const { queryAllByTestId } = drawWithoutGhostAudit([clip('solo', 0, 1000, { transitionIn: spyT() })], 5);
    expect(liveCalls()).toEqual([{ from: false, to: true, progress: 0.5 }]);
    expect(queryAllByTestId('plate-solo')).toHaveLength(1);
  });

  it('passes to === null at the trailing edge, and the node can act on it', () => {
    // A lone clip's transitionOut has no successor: window 20..30 of a 30-frame
    // clip. Before 1.3 this drew NOTHING at all — the "trailing edge fade" the
    // layout comment promised was unreachable, because the model needed a
    // successor to ENTER.
    const { queryAllByTestId } = drawWithoutGhostAudit([clip('solo', 0, 1000, { transitionOut: spyT() })], 25);
    expect(liveCalls()).toEqual([{ from: true, to: false, progress: 0.5 }]);
    expect(queryAllByTestId('plate-solo')).toHaveLength(1);
  });

});

describe('the plan receives progress across its whole window, inclusive at both ends', () => {
  // PHASE 5 TASK 5 — "the boundary owns its window, the clips do not: blanks
  // both clips for the frames the transition draws them on" DELETED. That was
  // the `composite` arm's OWN mechanism: a boundary `<Sequence>` took over
  // drawing from the items' own Sequences (`ItemBody`'s blanking), which is
  // why they had to be hidden to avoid a double image. The `plan` arm
  // INVERTS this on purpose — every item is mounted for its WHOLE life,
  // transition window included, and never blanked at all
  // (`single-mount-assembly.test.tsx`'s "the shells are mounted for the
  // item's whole life and are structurally constant" is the dedicated pin for
  // this now); "never a double image" survives as "draws each clip exactly
  // once" above. What is left here, and still genuinely a `plan`-arm
  // capability, is the progress sweep itself.
  it('runs progress 0 → 1 across the window, inclusive at both ends', () => {
    const seen: number[] = [];
    for (const frame of [25, 30, 35]) {
      draw(CUT, frame);
      seen.push(liveCalls()[0]?.progress);
    }
    expect(seen).toEqual([0, 0.5, 1]);
  });
});

// A clip shorter than its own in+out transition windows is claimed by TWO
// boundaries at once, so it is composited twice where they overlap. The real
// fix is Task 1.4's (it re-times the windows for `alignment` anyway); until
// then the failure mode is a double image with nothing to explain it, so core
// says so out loud. Diagnostic only — it must not change what renders.
describe('overlapping boundaries are diagnosed, not silently double-drawn', () => {
  const short = () => [
    // 300ms = 9 frames, with a 10-frame transition on BOTH edges: the leading
    // window is [0,10] and the trailing one [-1,9], which overlap.
    clip('tiny', 0, 300, { transitionIn: spyT(), transitionOut: spyT() }),
  ];

  beforeEach(() => resetWarnOnce());

  it('warns once, naming the item and both overlapping windows', () => {
    const warned: string[] = [];
    const spy = vi.spyOn(console, 'warn').mockImplementation((m: string) => void warned.push(m));
    try {
      draw(short(), 5);
      draw(short(), 6); // a second frame of the same render must NOT warn again
    } finally {
      spy.mockRestore();
    }
    expect(warned).toHaveLength(1);
    expect(warned[0]).toContain('"tiny"');
    expect(warned[0]).toContain('[0, 10]');
    expect(warned[0]).toContain('[-1, 9]');
  });

  it('stays quiet for a clip that comfortably fits its transitions', () => {
    const warned: string[] = [];
    const spy = vi.spyOn(console, 'warn').mockImplementation((m: string) => void warned.push(m));
    try {
      draw([clip('roomy', 0, 2000, { transitionIn: spyT(), transitionOut: spyT() })], 30);
    } finally {
      spy.mockRestore();
    }
    expect(warned).toEqual([]);
  });
});
