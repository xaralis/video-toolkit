// PHASE 5 TASK 1.2 — the single-mount assembly.
//
// PHASE 5 TASK 5 — THE `composite` ARM IS GONE. This file used to also settle
// that a `plan`-arm boundary and a `composite`-arm boundary render through
// DIFFERENT paths IN THE SAME REEL (the per-boundary seam that made Stages
// 2-4 individually shippable) — that premise is now FALSE: `video-track.tsx`'s
// whole `composite`-arm assembly (`ItemBody`, `rebased()`, the boundary
// `<Sequence>` holding `<AtCutTransition>`) is deleted, and every resolved
// boundary is driven through the `plan` arm's shells unconditionally. The
// `composite-probe` fixture and every test whose ENTIRE point was proving
// that coexistence are deleted below, with a comment at each site; tests that
// only incidentally touched the mixed fixture while actually pinning
// something about the `plan` boundary alone are kept, simplified onto a
// plan-only reel.
//
// What this file still settles: the shells core wraps every item in are
// mounted for the item's whole life and never change element type or count
// across a boundary crossing.
//
// The Remotion mock is `video-track-remount.test.tsx`'s (frame-gating +
// time-rebasing + a real `premountFor` implementation), because the assembly's
// correctness is entirely about which frames things are mounted on.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const clock = vi.hoisted(() => ({ frame: 0, preview: false }));

vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  const react = await import('react');
  const Offset = react.createContext(0);
  const Premounting = react.createContext(false);

  const Sequence: React.FC<{
    from?: number;
    durationInFrames?: number;
    premountFor?: number;
    layout?: 'none' | 'absolute-fill';
    children?: React.ReactNode;
  }> = ({ from = 0, durationInFrames = Number.POSITIVE_INFINITY, premountFor, children }) => {
    const parentOffset = react.useContext(Offset);
    const parentPremounting = react.useContext(Premounting);
    const offset = parentOffset + from;
    const local = clock.frame - offset;
    const ownPremounting = premountFor !== undefined && local < 0 && local >= -premountFor;
    const active = parentPremounting || ownPremounting;
    const inRange = local >= 0 && local < durationInFrames;
    if (!inRange && !active) return null;
    return react.createElement(
      Offset.Provider,
      { value: offset },
      react.createElement(Premounting.Provider, { value: active }, children),
    );
  };

  return {
    ...actual,
    Sequence,
    useCurrentFrame: () => clock.frame - react.useContext(Offset),
    useVideoConfig: () => ({
      width: 540, height: 960, fps: 30, durationInFrames: 300, id: 't', defaultProps: {}, props: {},
    }),
    staticFile: (s: string) => s,
    getRemotionEnvironment: () => ({
      isStudio: clock.preview,
      isPlayer: false,
      isRendering: !clock.preview,
      isClientSideRendering: false,
      isReadOnlyStudio: false,
    }),
  };
});

import { buildVideoNodes } from '@video-toolkit/lib/render/video-track';
import { resetWarnOnce } from '@video-toolkit/lib/render/warn-once';
import type { VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';
import type {
  TransitionComposite, TransitionPlanProps, TransitionRegistry,
} from '@video-toolkit/lib/theming/transitions';

const clip = (id: string, startMs: number, endMs: number, extra: Record<string, unknown> = {}): VideoItem =>
  ({ id, kind: 'clip', startMs, endMs, source: `${id}.mp4`, sourceInMs: 0, sourceOutMs: endMs - startMs, ...extra }) as VideoItem;

// The calls the plan received, so a test can assert on the props core hands it
// (handles, progress, frame) rather than only on the DOM it produced.
const seen: TransitionPlanProps[] = [];

const plan = (p: TransitionPlanProps): TransitionComposite => {
  seen.push(p);
  return {
    from: { style: { opacity: 1 - p.progress } },
    to: { style: { opacity: p.progress } },
    layers: [
      { key: 'base', z: 'under', style: { backgroundColor: 'rgb(7, 8, 9)' } },
      { key: 'sheet', z: 'between', style: { backgroundColor: 'rgb(1, 2, 3)' } },
      { key: 'lid', z: 'over', style: { backgroundColor: 'rgb(4, 5, 6)' } },
    ],
    // `opacity` is deliberately in here: `post` reads `filter`/`transform` and
    // nothing else, and that narrowness is a pinned property, not an accident.
    ...(p.progress > 0.5 ? { post: { filter: 'blur(2px)', transform: 'scale(1.02)', opacity: 0.25 } } : {}),
  };
};

// PHASE 5 TASK 5 — `composite-probe` (a test-only `{ composite }` node
// standing in for a brand registration on that arm, so the earlier "plan
// boundary and composite boundary coexist in one reel" tests were not a fake
// seam) DELETED. `TransitionNode` no longer has a `.composite` shape to build
// one out of — every node is `{ plan }` now — and `video-track.tsx`'s whole
// composite-arm assembly that would have driven it is gone too. `MIXED` below
// keeps its three-clip shape (some tests still want a THIRD clip past the one
// live boundary) but `b`'s trailing edge is now a hard cut, not a second
// transition — there is no other kind of boundary left to mix in.
const REGISTRY: TransitionRegistry = {
  planned: { renderer: () => ({ plan }) },
};

// a --planned--> b --(hard cut)--> c. 30fps, 3s each: cut at frame 90, the
// one 20-frame centre-aligned window is [80, 100].
const MIXED = (): VideoItem[] => [
  clip('a', 0, 3000, { transitionOut: { kind: 'planned', frames: 20 } }),
  clip('b', 3000, 6000),
  clip('c', 6000, 9000),
];

const tree = (items: VideoItem[] = MIXED()) => (
  <>
    {buildVideoNodes(items, {
      renderItem: (item) => <video data-testid={`vid-${item.id}`} />,
      width: 540,
      height: 960,
      fps: 30,
      palette: undefined,
      transitions: REGISTRY,
      background: '#101010',
    })}
  </>
);

const vids = (c: HTMLElement, id: string) => c.querySelectorAll(`[data-testid="vid-${id}"]`);

beforeEach(() => {
  clock.preview = false;
  seen.length = 0;
  resetWarnOnce();
});

// ---------------------------------------------------------------------------
// The seam.
// ---------------------------------------------------------------------------
describe('the plan arm mounts each clip once', () => {
  // PHASE 5 TASK 5 — "a plan boundary mounts each clip ONCE, in preview —
  // where a composite boundary still mounts two" DELETED. Its entire point
  // was the differential against a `composite`-arm boundary in the SAME reel
  // (`b`'s old `composite-probe` transitionOut, mounting `c` twice); there is
  // no composite arm left to differ from — `video-track.tsx`'s composite-arm
  // assembly (`ItemBody`, `rebased()`, the boundary `<Sequence>` +
  // `<AtCutTransition>`) is deleted, so every boundary now mounts each clip
  // once, unconditionally. That is no longer a claim this file needs a
  // dedicated test for; it is the untested-because-only-possible outcome of
  // every other test below actually passing.

  it('applies the plan to the clip that is already mounted — the shell carries the op style', () => {
    clock.frame = 85; // progress 0.25
    const { container } = render(tree());
    const shellOf = (id: string) => vids(container, id)[0].parentElement!.parentElement!;
    // a is this boundary's `from` (outer/exit shell), b its `to` (inner/enter
    // shell). The inner shell of a and the outer shell of b are inert.
    expect(shellOf('a').style.opacity).toBe('0.75');
    expect(shellOf('b').style.opacity).toBe('');
    expect(vids(container, 'b')[0].parentElement!.style.opacity).toBe('0.25');
  });

  it('hands the plan one call per frame with both sides, one progress, and the boundary-relative frame', () => {
    // Frame 83 — progress 0.15, which is deliberately NOT one of the ghost
    // audit's probe progresses, so the live call is the only call at it.
    clock.frame = 83;
    render(tree());
    const live = seen.filter((p) => p.progress === 0.15);
    expect(live.length).toBe(1);
    expect(live[0].frame).toBe(3);
    expect(live[0].durationInFrames).toBe(20);
    expect(live[0].background).toBe('#101010');
    expect(live[0].params).toMatchObject({ kind: 'planned', frames: 20 });
    // `from` expires one frame before the window does (design §1.2); `to`
    // spans the whole of it.
    expect(live[0].from).toEqual({ range: [0, 19] });
    expect(live[0].to).toEqual({ range: [0, 20] });
  });

  it('does not evaluate the plan\'s LIVE composite outside its own window', () => {
    clock.frame = 79; // one frame before the window opens
    render(tree());
    // TASK 1.4 — `buildVideoNodes` also samples the plan ONCE with the
    // out-of-range marker `frame: -1` (`wrapFor`, video-track.tsx), purely to
    // learn whether either side declares a `wrap` — necessary even here,
    // before the window has ever gone live, which is the whole point of
    // Finding 1's fix (a life-long `wrap` mount needs an answer for frames
    // the boundary is never live on). That sample is not a live evaluation of
    // the boundary's picture, so it is excluded from `live` below; this
    // test's actual claim — no REAL progress-bearing call happens before the
    // window opens — still holds.
    const live = seen.filter((p) => p.frame !== -1);
    expect(live.length).toBe(0);
    // The other half of the same fact, pinned positively: exactly the wrap
    // sample ran, not zero (which would mean `wrapFor` stopped being called
    // — the wiring this task adds) and not more than one (which would mean
    // it is being re-invoked needlessly).
    expect(seen.length).toBe(1);
  });

  it('still evaluates it on the progress-1 frame, which is a real frame something must draw', () => {
    clock.frame = 100;
    render(tree());
    expect(seen.some((p) => p.progress === 1 && p.frame === 20)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The shells.
// ---------------------------------------------------------------------------
describe('the shells are mounted for the item\'s whole life and are structurally constant', () => {
  const shellChain = (c: HTMLElement, id: string) => {
    const el = vids(c, id)[0];
    return [el.parentElement!, el.parentElement!.parentElement!, el.parentElement!.parentElement!.parentElement!];
  };

  // `a`'s own Sequence is [0, 100) and the plan window is [80, 100], so 79 is
  // its last frame outside the window and 99 its last frame at all (the
  // outgoing clip genuinely expires one frame before progress 1 — design §1.2,
  // which is exactly what its `from` handle range reports).
  const A_LIFE = [10, 79, 80, 90, 99];

  it('wraps every item in exactly two shells, before, during and after a boundary crossing', () => {
    clock.preview = true;
    for (const frame of A_LIFE) {
      clock.frame = frame;
      const { container, unmount } = render(tree());
      const [inner, mid, outer] = shellChain(container, 'a');
      // ItemBody's own preview wrapper, then enter shell, then exit shell —
      // three divs, always, never a Fragment and never a different tag.
      expect([inner.tagName, mid.tagName, outer.tagName]).toEqual(['DIV', 'DIV', 'DIV']);
      unmount();
    }
  });

  it('never remounts the OUTGOING clip as the plan window opens — the same DOM node, frame by frame', () => {
    clock.preview = true;
    clock.frame = 10;
    const { container, rerender } = render(tree());
    const first = vids(container, 'a')[0];
    const shells = shellChain(container, 'a');
    for (const frame of A_LIFE) {
      clock.frame = frame;
      rerender(tree());
      // Reference identity, element by element: `toEqual` on DOM nodes compares
      // structure, which two independently-mounted identical <video>s satisfy
      // even after a real remount.
      expect(vids(container, 'a')[0]).toBe(first);
      shellChain(container, 'a').forEach((el, i) => expect(el).toBe(shells[i]));
    }
  });

  it('never remounts the INCOMING clip as the plan window closes — including the frame after it', () => {
    clock.preview = true;
    clock.frame = 80; // b's first frame, and the window's
    const { container, rerender } = render(tree());
    const first = vids(container, 'b')[0];
    for (const frame of [85, 99, 100, 101, 140]) {
      clock.frame = frame;
      rerender(tree());
      expect(vids(container, 'b')[0]).toBe(first);
    }
  });

  // REVIEW ROUND 1, IMPORTANT 3. Both wrappers fill their parent explicitly,
  // and both were deletable green before this test. The pixel harness
  // structurally cannot catch it: every renderer this repo and both brand repos
  // ship roots its content at `AbsoluteFill`, so an unstyled `<div>` is
  // layout-neutral TODAY — which is precisely the dependency on every current
  // renderer's shape that filling it explicitly exists to remove. A future
  // renderer rooting at a static element with `height: 100%` would collapse to
  // zero height inside an unstyled wrapper, and no golden would move until that
  // renderer existed.
  it('fills its parent explicitly — both shells AND the track wrapper', () => {
    clock.preview = true;
    clock.frame = 85;
    const { container } = render(tree());
    const track = container.firstElementChild as HTMLElement;
    const [, enter, exit] = shellChain(container, 'a');
    for (const el of [track, enter, exit]) {
      expect(el.style.position).toBe('absolute');
      expect(el.style.inset).toBe('0');
    }
  });

  it('keeps the element count under an item constant across the crossing (no appearing/vanishing wrapper)', () => {
    clock.preview = true;
    const counts = new Set<number>();
    clock.frame = 10;
    const { container, rerender } = render(tree());
    // PHASE 5 TASK 5 — two ancestors up, not three. `a`'s own two shells
    // (enter, exit) are the outermost DOM this item owns; a third
    // `.parentElement` reaches the TRACK-LEVEL wrapper (`isolation: isolate`),
    // which is shared by the whole reel — it also gains the boundary's
    // plates and item `b`'s own shells the moment the window opens, which is
    // exactly what made this count non-constant at the wrong scope. That
    // wrapper's own constancy is a different, already-covered claim (`the
    // shells… fills its parent explicitly` above asserts on `track` itself);
    // this test is specifically about ONE ITEM's own shell subtree.
    const firstShell = vids(container, 'a')[0].parentElement!.parentElement!;
    for (const frame of A_LIFE) {
      clock.frame = frame;
      rerender(tree());
      counts.add(firstShell.querySelectorAll('*').length);
    }
    expect(counts.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Plates, edges, `post`, ghosts.
// ---------------------------------------------------------------------------
describe('a plan\'s media-free layers are real timeline siblings', () => {
  const platesOf = (c: HTMLElement) =>
    [...c.querySelectorAll('div')].filter((d) => d.style.backgroundColor.startsWith('rgb('));

  it('emits one div per PlateLayer, only inside the window', () => {
    clock.frame = 85;
    const { container, rerender } = render(tree());
    expect(platesOf(container).map((d) => d.style.backgroundColor))
      .toEqual(['rgb(7, 8, 9)', 'rgb(1, 2, 3)', 'rgb(4, 5, 6)']);

    clock.frame = 120;
    rerender(tree());
    expect(platesOf(container).length).toBe(0);
  });

  it('honours z: `between` sits between the two clips by tree order, `over` and `under` by z-index', () => {
    clock.frame = 85;
    const { container } = render(tree());
    const [under, between, over] = platesOf(container);
    // All THREE classes, because `under` and `over` are axis-symmetric twins
    // and pinning one of a symmetric pair is how C1 shipped.
    expect(under.style.zIndex).toBe('-1');
    expect(between.style.zIndex).toBe('');
    expect(over.style.zIndex).toBe('1');
    // Tree order is the mechanism for `between`: after a, before b.
    const order = [...container.querySelectorAll('[data-testid], div')];
    expect(order.indexOf(vids(container, 'a')[0])).toBeLessThan(order.indexOf(between));
    expect(order.indexOf(between)).toBeLessThan(order.indexOf(vids(container, 'b')[0]));
  });
});

// BOTH EDGES, and the pairing is the point. Review round 1 CRITICAL 1: the
// TRAILING plate (`if (b.toIndex === null) nodes.push(edge(b, 'to'))`) shipped
// one-line-deletable with the whole suite green, because every fixture here was
// a LEADING edge — the axis-symmetric twin of the case that was pinned. Any
// test in this file that covers one end of a leading/trailing, from/to,
// enter/exit or first/last axis must cover the other.
describe('the reel edge is materialised as a timeline sibling and takes the node\'s op', () => {
  // A solo clip whose `transitionIn` is the plan: fromIndex === null.
  const LEADING = (): VideoItem[] => [
    clip('solo', 0, 3000, { transitionIn: { kind: 'planned', frames: 20 } }),
  ];
  // A solo clip whose `transitionOut` is the plan: toIndex === null. Note the
  // window is [70, 90], NOT [80, 100]: the last item lends no out handle to a
  // neighbour it does not have, so the window ends where the clip does. Getting
  // this wrong is how the first draft of this test "passed" against the wrong
  // progress.
  const TRAILING = (): VideoItem[] => [
    clip('solo', 0, 3000, { transitionOut: { kind: 'planned', frames: 20 } }),
  ];
  const plateIn = (c: HTMLElement) =>
    [...c.querySelectorAll('div')].find((d) => d.style.backgroundColor === 'rgb(16, 16, 16)');

  it('LEADING: mounts an EdgePlate of the composition background BELOW the incoming clip, styled by the `from` op', () => {
    clock.frame = 5; // window is [0, 20]; progress 0.25
    const { container } = render(tree(LEADING()));
    const plate = plateIn(container);
    expect(plate).toBeTruthy();
    expect(plate!.parentElement!.style.opacity).toBe('0.75');
    // Below: the plate is emitted BEFORE the clip, and tree order is what
    // stacks them (see THE STACKING RULE).
    const order = [...container.querySelectorAll('div, video')];
    expect(order.indexOf(plate!)).toBeLessThan(order.indexOf(vids(container, 'solo')[0]));
  });

  it('TRAILING: mounts one ABOVE the outgoing clip, styled by the `to` op', () => {
    clock.frame = 75; // window is [70, 90]; progress 0.25
    const { container } = render(tree(TRAILING()));
    const plate = plateIn(container);
    expect(plate).toBeTruthy();
    // The `to` op — the missing side's, at this end — carries `opacity:
    // progress`, so this is 0.25 and not the 0.75 the `from` op would give.
    // That difference is what makes this a test of the TRAILING wiring rather
    // than a copy of the leading one.
    expect(plate!.parentElement!.style.opacity).toBe('0.25');
    const order = [...container.querySelectorAll('div, video')];
    expect(order.indexOf(plate!)).toBeGreaterThan(order.indexOf(vids(container, 'solo')[0]));
  });

  it('tells the node which side is missing — `from === null` leading, `to === null` trailing', () => {
    clock.frame = 5;
    const { rerender } = render(tree(LEADING()));
    const leading = seen.filter((p) => p.progress === 0.25);
    expect(leading[0].from).toBeNull();
    expect(leading[0].to).toEqual({ range: [0, 20] });

    seen.length = 0;
    clock.frame = 75;
    rerender(tree(TRAILING()));
    const trailing = seen.filter((p) => p.progress === 0.25);
    expect(trailing[0].to).toBeNull();
    // The outgoing clip's own Sequence ends at frame 89, one before the window
    // does — `[0, 19]`, not `[0, 20]`.
    expect(trailing[0].from).toEqual({ range: [0, 19] });
  });
});

describe('`post` applies to the whole video track, narrowly', () => {
  const wrapper = (c: HTMLElement) => c.firstElementChild as HTMLElement;

  it('carries the live boundary\'s filter AND transform, and nothing else', () => {
    clock.frame = 95; // progress 0.75 — the plan sets post above 0.5
    const { container } = render(tree());
    expect(wrapper(container).style.filter).toBe('blur(2px)');
    expect(wrapper(container).style.transform).toBe('scale(1.02)');
    // Not carried: `opacity` on the whole track is a reel-level change no
    // boundary is entitled to make.
    expect(wrapper(container).style.opacity).toBe('');
  });

  it('carries nothing when no boundary is live', () => {
    clock.frame = 85; // progress 0.25 — no post
    const { container, rerender } = render(tree());
    expect(wrapper(container).style.filter).toBe('');
    clock.frame = 130; // no window at all
    rerender(tree());
    expect(wrapper(container).style.filter).toBe('');
  });

  it('isolates the track only when the reel actually contains a plan boundary', () => {
    clock.frame = 85;
    const { container, rerender } = render(tree());
    expect(wrapper(container).style.isolation).toBe('isolate');

    // PHASE 5 TASK 5 — the "no plan boundary" case used to be a reel whose
    // only transition was `composite-probe`, back when a `composite`-arm
    // boundary was a real, distinct thing a reel could contain instead of a
    // plan one. It no longer is (every resolved boundary IS a plan boundary
    // now), so "isolate: false" can only mean "no plan boundary resolved for
    // this reel at all" — a plain hard cut, no transitionOut authored.
    rerender(tree([
      clip('x', 0, 3000),
      clip('y', 3000, 6000),
    ]));
    expect(wrapper(container).style.isolation).toBe('');
  });
});

describe('ghosts are extra mounts, appended after the real child', () => {
  const ghostPlan = (p: TransitionPlanProps): TransitionComposite => ({
    to: { style: { opacity: p.progress }, ghosts: [{ opacity: 0.5 }, { opacity: 0.25 }] },
  });
  const GHOST_REGISTRY: TransitionRegistry = { ghosted: { renderer: () => ({ plan: ghostPlan }) } };

  it('renders one extra copy of the clip per ghost, after it', () => {
    clock.frame = 85;
    const { container } = render(
      <>
        {buildVideoNodes(
          [clip('a', 0, 3000, { transitionOut: { kind: 'ghosted', frames: 20 } }), clip('b', 3000, 6000)],
          {
            renderItem: (item) => <video data-testid={`vid-${item.id}`} />,
            width: 540, height: 960, fps: 30, palette: undefined,
            transitions: GHOST_REGISTRY, background: '#101010',
          },
        )}
      </>,
    );
    const bs = vids(container, 'b');
    expect(bs.length).toBe(3);
    expect((bs[1].parentElement as HTMLElement).style.opacity).toBe('0.5');
    expect((bs[2].parentElement as HTMLElement).style.opacity).toBe('0.25');
  });
});

describe('`z` and `config` — the two per-op deliveries a style assertion alone would miss', () => {
  const zPlan = (p: TransitionPlanProps): TransitionComposite => ({
    // The outgoing clip ON TOP — the one thing tree order cannot express, and
    // therefore the only reason `LayerOp.z` exists.
    from: { z: 9 },
    to: { style: { opacity: p.progress }, ...(p.config === 'brand-config' ? { z: 4 } : {}) },
  });
  const Z_REGISTRY: TransitionRegistry = {
    zed: { renderer: () => ({ plan: zPlan }), config: 'brand-config' },
  };

  it('puts the op\'s `z` on that side\'s shell, and hands the node the brand registration\'s `config`', () => {
    clock.frame = 85;
    const { container } = render(
      <>
        {buildVideoNodes(
          [clip('a', 0, 3000, { transitionOut: { kind: 'zed', frames: 20 } }), clip('b', 3000, 6000)],
          {
            renderItem: (item) => <video data-testid={`vid-${item.id}`} />,
            width: 540, height: 960, fps: 30, palette: undefined,
            transitions: Z_REGISTRY, background: '#101010',
          },
        )}
      </>,
    );
    expect(vids(container, 'a')[0].parentElement!.parentElement!.style.zIndex).toBe('9');
    // 4 only if `config` reached the plan — the registration's own value, which
    // no other input to the plan could supply.
    expect(vids(container, 'b')[0].parentElement!.style.zIndex).toBe('4');
  });
});

describe('`wrap` — the component form, for a shell no style can express', () => {
  const Masked: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <svg data-testid="wrap"><foreignObject>{children}</foreignObject></svg>
  );
  const wrapPlan = (p: TransitionPlanProps): TransitionComposite => ({
    to: { style: { opacity: p.progress }, wrap: Masked },
  });
  const WRAP_REGISTRY: TransitionRegistry = { wrapped: { renderer: () => ({ plan: wrapPlan }) } };

  it('mounts the wrap between the shell and the clip, rendering the clip exactly once', () => {
    clock.frame = 85;
    const { container } = render(
      <>
        {buildVideoNodes(
          [clip('a', 0, 3000, { transitionOut: { kind: 'wrapped', frames: 20 } }), clip('b', 3000, 6000)],
          {
            renderItem: (item) => <video data-testid={`vid-${item.id}`} />,
            width: 540, height: 960, fps: 30, palette: undefined,
            transitions: WRAP_REGISTRY, background: '#101010',
          },
        )}
      </>,
    );
    expect(container.querySelectorAll('[data-testid="wrap"]').length).toBe(1);
    expect(vids(container, 'b').length).toBe(1);
    expect(container.querySelector('[data-testid="wrap"]')!.contains(vids(container, 'b')[0])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// THE TWO DERIVED PINS (review round 2).
//
// Round 1 replaced a capability LIST with an axis LIST and found five more
// holes — and still shipped six, two of them inside an axis that round had
// declared complete ("the fill axis has four members, not two"). The lesson is
// not "enumerate harder": an axis list is a list, so it inherits exactly the
// failure mode it was meant to cure, one level up. This repo's own law applies —
// PREFER THE RULE THAT GENERATES A SET OVER A LIST OF TODAY'S MEMBERS — so the
// two places a rule is available get a derived test, and a member added in a
// later stage is covered the day it is added rather than the day someone
// remembers a list.
// ---------------------------------------------------------------------------

// The kitchen-sink fixture: ONE tree containing every species of element the
// assembly mounts — track host, both item shells, ItemBody's preview wrapper,
// a materialised edge plate, a ghost wrapper on each side, and a plate with
// `content`. The derived tests below quantify over it, so a new species is
// covered as soon as it appears in a fixture that renders it.
const sinkPlan = (p: TransitionPlanProps): TransitionComposite => ({
  from: { style: { opacity: 1 - p.progress }, ghosts: [{ opacity: 0.5 }] },
  to: { style: { opacity: p.progress }, ghosts: [{ opacity: 0.3 }] },
  layers: [{
    key: 'k',
    z: 'over',
    style: { backgroundColor: 'rgb(2, 2, 2)' },
    content: <svg data-testid="plate-content" />,
  }],
});
const SINK_REGISTRY: TransitionRegistry = { sink: { renderer: () => ({ plan: sinkPlan }) } };
const sinkTree = () => (
  <>
    {buildVideoNodes(
      [clip('solo', 0, 3000, { transitionIn: { kind: 'sink', frames: 20 } })],
      {
        renderItem: (item) => <video data-testid={`vid-${item.id}`} />,
        width: 540, height: 960, fps: 30, palette: undefined,
        transitions: SINK_REGISTRY, background: '#101010',
      },
    )}
  </>
);

describe('DERIVED — every element the assembly mounts fills its parent', () => {
  // The rule, rather than a list of wrapper names: the assembly mounts only
  // `<div>`s of its own (the test's `renderItem` returns a bare `<video>` and a
  // plate's `content` is an `<svg>`), so "every div in the tree" IS the set of
  // wrappers core is responsible for. Two acceptable spellings of "fills its
  // parent" — `inset: 0` (the shells, the ghost and plate wrappers, the host)
  // and the four longhand offsets (Remotion's own `AbsoluteFill`, which is what
  // `EdgePlate` renders) — because the property being pinned is the RESULT, not
  // the CSS shorthand used to get it.
  const fills = (el: HTMLElement) =>
    el.style.position === 'absolute' &&
    (el.style.inset === '0' ||
      (el.style.top === '0px' && el.style.left === '0px' &&
       el.style.right === '0px' && el.style.bottom === '0px'));

  it('holds for every div, with every species of wrapper present at once', () => {
    clock.preview = true;
    clock.frame = 5; // window [0, 20]; leading edge, so the edge plate is live
    const { container } = render(sinkTree());
    const divs = [...container.querySelectorAll('div')];
    // VACUITY GUARD, and the reason this test cannot pass by rendering
    // nothing: every species must actually be here. Named by what they carry,
    // not by component name, so a refactor that renames a component does not
    // silently drop one.
    expect(container.querySelectorAll('[data-testid="plate-content"]').length).toBe(1); // a plate
    expect(divs.some((d) => d.style.opacity === '0.5')).toBe(true); // a from-side ghost
    expect(divs.some((d) => d.style.opacity === '0.3')).toBe(true); // a to-side ghost
    expect(divs.some((d) => d.style.backgroundColor === 'rgb(16, 16, 16)')).toBe(true); // the edge plate
    expect(divs.length).toBeGreaterThanOrEqual(8);

    const offenders = divs.filter((d) => !fills(d)).map((d) => d.getAttribute('style'));
    expect(offenders).toEqual([]);
  });
});

describe('DERIVED — every member of TransitionPlanProps is delivered', () => {
  // `Record<keyof TransitionPlanProps, …>` is the generating rule: the COMPILER
  // demands an entry for every member of the type, so a field added to the
  // contract in a later stage fails to compile here until it has a probe — the
  // same mechanism `CORE_TRANSITIONS` uses to force a renderer per catalog kind.
  // An enumerated list of `expect`s would have gone stale silently instead,
  // which is how `palette` and `dims` reached review round 2 unpinned.
  //
  // Each probe is attributable to ONE key: a value no other member of the bag
  // could have supplied. The dims are 541x961 (not the 540x960 every other
  // fixture uses), the palette slot and the authored param carry unique
  // strings, and the three numbers (progress 0.15, frame 3, durationInFrames
  // 20) are pairwise distinct at the frame chosen.
  const DELIVERED: Record<keyof TransitionPlanProps, (p: TransitionPlanProps) => boolean> = {
    from: (p) => p.from === null, // leading edge — the only side that can be null here
    to: (p) => p.to?.range[0] === 0 && p.to.range[1] === 20,
    progress: (p) => p.progress === 0.15,
    frame: (p) => p.frame === 3,
    durationInFrames: (p) => p.durationInFrames === 20,
    params: (p) => (p.params as { probe?: string }).probe === 'authored-param-probe',
    config: (p) => p.config === 'registration-config-probe',
    dims: (p) => p.dims.width === 541 && p.dims.height === 961 && p.dims.fps === 30,
    palette: (p) => p.palette.length === 1 && p.palette[0].key === 'palette-probe',
    background: (p) => p.background === '#0b0b0b',
  };

  it('delivers each one with a value only that member could have supplied', () => {
    clock.frame = 3; // window [0, 20]; progress 0.15, not a ghost-audit probe
    render(
      <>
        {buildVideoNodes(
          [clip('solo', 0, 3000, {
            transitionIn: { kind: 'probed', frames: 20, probe: 'authored-param-probe' },
          })],
          {
            renderItem: () => null,
            width: 541,
            height: 961,
            fps: 30,
            palette: [{ key: 'palette-probe', label: 'Probe', color: '#123456' }],
            transitions: {
              probed: { renderer: () => ({ plan }), config: 'registration-config-probe' },
            },
            background: '#0b0b0b',
          },
        )}
      </>,
    );
    const live = seen.filter((p) => p.progress === 0.15);
    expect(live.length).toBe(1);
    const missing = Object.entries(DELIVERED)
      .filter(([, check]) => !check(live[0]))
      .map(([key]) => key);
    expect(missing).toEqual([]);
  });
});

describe('a plate\'s `content` and the window\'s progress-1 frame', () => {
  it('renders PlateLayer.content inside its plate — the slot Stage 2 puts an SVG mask in', () => {
    clock.frame = 5;
    const { container } = render(sinkTree());
    const content = container.querySelector('[data-testid="plate-content"]')!;
    expect(content).toBeTruthy();
    // Inside the plate div, not a sibling of it: a `<defs>`/mask has to be in
    // the element the style applies to.
    expect((content.parentElement as HTMLElement).style.backgroundColor).toBe('rgb(2, 2, 2)');
  });

  it('keeps the plates AND the edge plate mounted on the progress-1 frame', () => {
    // The audit and the renderer must not diverge by a frame: `VideoTrackHost`
    // still EVALUATES the plan at progress 1 (pinned separately), so the
    // elements that plan describes have to still be MOUNTED there. The window
    // is [0, 20] and 20 is a real frame something must draw — which is what
    // `+ BOUNDARY_TAIL` on the plan Sequences buys, exactly as it does on the
    // composite arm's boundary Sequence.
    clock.frame = 20;
    const { container } = render(sinkTree());
    expect(container.querySelectorAll('[data-testid="plate-content"]').length).toBe(1);
    expect([...container.querySelectorAll('div')]
      .some((d) => d.style.backgroundColor === 'rgb(16, 16, 16)')).toBe(true);
  });

  it('drops both the frame after the window closes', () => {
    clock.frame = 21;
    const { container } = render(sinkTree());
    expect(container.querySelectorAll('[data-testid="plate-content"]').length).toBe(0);
    expect([...container.querySelectorAll('div')]
      .some((d) => d.style.backgroundColor === 'rgb(16, 16, 16)')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PHASE 5 TASK 2.1 — a REAL catalog kind through the REAL pipeline, no test
// registry.
//
// Every other test in this file builds its `plan` node out of a test-only
// brand registry — the right way to test the SEAM (a boundary either takes
// the plan route or the composite one), but none of them prove core's OWN
// `fromRemotionPresentation` → `wrap` lift (this task's actual deliverable,
// `wrapRemotionPresentation` in at-cut-transitions.tsx) is wired end to end:
// `VideoTrackHost` computing live progress → `LayerShell` publishing it
// through `ActiveTransitionProgressContext`, scoped to just its own `Wrap`
// instance → the migrated kind's own `Wrap` reading it and driving
// `TransitionLayer`. `fade` is core's own catalog kind, resolved with NO
// registry at all — the ordinary path every brand repo already exercises.
// ---------------------------------------------------------------------------
describe('a REAL catalog kind (`fade`) reaches the shells through the real pipeline (Task 2.1)', () => {
  // a: 0-3000ms with a 20-frame fade out. b: 3000-6000ms. 30fps -> cut at
  // frame 90, `fade`'s default (center) alignment gives a window of [80, 100]
  // — both items' own Sequences already span it (design §1.2), so neither
  // clip is duplicated or blanked; the shells just style the one mount.
  const FADE_REEL = (): VideoItem[] => [
    clip('a', 0, 3000, { transitionOut: { kind: 'fade', frames: 20 } }),
    clip('b', 3000, 6000),
  ];
  const fadeTree = () => (
    <>
      {buildVideoNodes(FADE_REEL(), {
        renderItem: (item) => <video data-testid={`vid-${item.id}`} />,
        width: 540, height: 960, fps: 30, palette: undefined,
      })}
    </>
  );
  // The opacity-carrying element is `FadePresentation`'s own `AbsoluteFill`,
  // reached through `TransitionLayer` inside whichever of the item's two
  // shells declares the live `wrap` — the OUTER (exit) shell for `a`, the
  // INNER (enter) shell for `b`, since a `wrap` styles everything BELOW it
  // and the two items' active sides sit at different nesting depths. Walking
  // up to the first ancestor with a non-empty `opacity` style finds it either
  // way, rather than hard-coding a level count that only holds for one side.
  const opacityAncestor = (el: Element): HTMLElement => {
    for (let cur = el.parentElement; cur; cur = cur.parentElement) {
      if (cur.style.opacity !== '') return cur;
    }
    throw new Error('no ancestor with an opacity style');
  };
  const shellOf = (container: HTMLElement, id: string) =>
    opacityAncestor(container.querySelector(`[data-testid="vid-${id}"]`)!);

  // `fade`'s EXITING branch is the identity function (opacity 1 at ANY
  // progress — `@remotion/transitions/fade` never sets
  // `shouldFadeOutExitingScene`), so `a` (the outgoing side) is expected to
  // stay opacity 1 throughout; `b` (the incoming side) is the one whose
  // opacity is a live function of progress. This is the exact asymmetry
  // `edge-plate.tsx`'s module docblock names as the historic defect
  // (`fade` "did nothing as a transitionOut") that the reel-edge background
  // now answers — unaffected by this task, still visible here as a property
  // of the presentation itself, not of the lift.
  it('the incoming clip fades in at the LIVE progress the assembly computed, not a stale or default one', () => {
    clock.frame = 85; // local 5 of 20 -> progress 0.25
    const { container, rerender } = render(fadeTree());
    expect(shellOf(container, 'a').style.opacity).toBe('1');
    expect(shellOf(container, 'b').style.opacity).toBe('0.25');

    clock.frame = 95; // local 15 of 20 -> progress 0.75
    rerender(fadeTree());
    expect(shellOf(container, 'a').style.opacity).toBe('1');
    expect(shellOf(container, 'b').style.opacity).toBe('0.75');
  });

  // `b`'s own Sequence starts exactly at the window's own start (design
  // §1.2's "`b.start === entry.seqFrom` for the `to` side by construction"),
  // so it has no PRE-window life to sample here — only POST. `a` has the
  // opposite shape (full pre-window life, no life after its own Sequence
  // ends), which is why each side is sampled on the edge it actually has.
  it('outside the window the shell is neutral (opacity 1 — no visible effect), not absent or stuck at a stale progress', () => {
    clock.frame = 50; // long before `a`'s exit window opens; `a` is on screen
    const { container, rerender } = render(fadeTree());
    expect(shellOf(container, 'a').style.opacity).toBe('1');

    clock.frame = 150; // well after the window has closed; `b` is on screen
    rerender(fadeTree());
    expect(shellOf(container, 'b').style.opacity).toBe('1');
  });

  it('does not remount the incoming clip’s DOM node as progress advances', () => {
    clock.frame = 85;
    const { container, rerender } = render(fadeTree());
    const first = container.querySelector('[data-testid="vid-b"]');
    clock.frame = 95;
    rerender(fadeTree());
    expect(container.querySelector('[data-testid="vid-b"]')).toBe(first);
  });
});

// ---------------------------------------------------------------------------
// The signature 12 brand call sites depend on.
// ---------------------------------------------------------------------------
describe('buildVideoNodes still returns React.ReactNode[]', () => {
  it('returns a single-element array, spreadable into JSX exactly as before', () => {
    const nodes = buildVideoNodes(MIXED(), {
      renderItem: () => null,
      width: 540, height: 960, fps: 30, palette: undefined, transitions: REGISTRY,
    });
    expect(Array.isArray(nodes)).toBe(true);
    expect(nodes.length).toBe(1);
    clock.frame = 85;
    // The brand call sites' shape: `{videoNodes}` inside a parent element.
    const { container } = render(<div>{nodes}</div>);
    expect(container.querySelectorAll('div').length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// PHASE 5 TASK 4, FIX ROUND 1 (opus review, Critical 1) — `checkerboard`'s
// `'scale'`/`'flip'` carve-out through the REAL `buildVideoNodes`/`LayerShell`
// path, not `checkerboard-single-mount.test.tsx`'s hand-rolled mirror.
//
// THE GAP THIS CLOSES. Every existing carve-out assertion either counted
// elements (`b: 17`, `cells: 16`) or read a SINGLE element's own `style`
// (`toShell.style.opacity === '0'`) — neither notices that CSS `opacity` is a
// GROUP property: `LayerShell` puts the ghosts INSIDE the very div carrying
// `op.style`, so `to: { style: { opacity: 0 }, ghosts }` makes `opacity: 0`
// apply to the ghosts too, multiplicatively, not just to the real hidden
// mount. A single-element read of either div's own `style.opacity` cannot see
// this — it has to walk the ancestor chain and multiply. That is what
// `effectiveOpacity` below does, and it is run through the REAL tree (no
// hand-rolled `LayerShell` mirror), because a faithful-looking mirror is
// exactly what let this ship unnoticed the first time.
import { buildVideoNodes as buildVideoNodesForCheckerboard } from '@video-toolkit/lib/render/video-track';

describe("checkerboard's `'scale'`/`'flip'` carve-out through the REAL tree — effective opacity", () => {
  /** The product of every `style.opacity` from `el` up to (and including) the
   *  document root, treating an absent/empty value as `1` (CSS's own
   *  identity for group opacity). `0` anywhere in the chain makes the whole
   *  subtree unpaintable — this is what a single element's own `style.opacity`
   *  reading can never see. */
  const effectiveOpacity = (el: Element): number => {
    let opacity = 1;
    for (let cur: Element | null = el; cur; cur = cur.parentElement) {
      const raw = (cur as HTMLElement).style?.opacity;
      if (raw !== undefined && raw !== '') {
        const n = Number(raw);
        if (!Number.isNaN(n)) opacity *= n;
      }
    }
    return opacity;
  };

  const CHECKERBOARD_REEL = (squareAnimation: 'scale' | 'flip'): VideoItem[] => [
    { id: 'a', kind: 'clip', startMs: 0, endMs: 3000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 3000,
      transitionOut: { kind: 'checkerboard', frames: 20, gridSize: 4, squareAnimation } } as VideoItem,
    { id: 'b', kind: 'clip', startMs: 3000, endMs: 6000, source: 'b.mp4', sourceInMs: 0, sourceOutMs: 3000 } as VideoItem,
  ];

  it.each(['scale', 'flip'] as const)(
    '%s: a ghost cell is actually PAINTABLE mid-window (effective opacity > 0) — not multiplied out by the shell',
    (squareAnimation) => {
      clock.preview = false;
      clock.frame = 90; // mid-window of the centred 20-frame boundary at frame 90
      const { container } = render(
        <>
          {buildVideoNodesForCheckerboard(CHECKERBOARD_REEL(squareAnimation), {
            renderItem: (item) => <video data-testid={`vid-${item.id}`} />,
            width: 540, height: 960, fps: 30, palette: undefined,
          })}
        </>,
      );
      const ghostCells = [...container.querySelectorAll('div')].filter((d) => d.style.clipPath !== '');
      expect(ghostCells.length).toBeGreaterThan(0);
      // At least one ghost cell must be genuinely paintable — a checkerboard
      // whose every cell is multiplied to 0 draws NOTHING of the incoming
      // clip for the whole window, the exact regression this pins.
      expect(ghostCells.some((c) => effectiveOpacity(c) > 0)).toBe(true);
    },
  );

  // PHASE 5 TASK 4, FIX ROUND 2 (opus review, Important A) — THE OTHER HALF
  // of the fix for Critical 1. `HideRealWhileActive` (`checkerboard.tsx`)
  // hides the real mount ONLY while `active` — `opacity: active ? 0 : 1` —
  // but nothing asserted the `active === false` branch specifically. A
  // reviewer's mutation (`active ? 0 : 1` → a bare `0`) passed EVERY existing
  // test in this file, `checkerboard-single-mount.test.tsx`,
  // `at-cut-transitions.test.tsx` and `video-track-remount.test.tsx` — 424
  // green, 0 red — because `b`'s own Sequence runs frames 90-179 and every
  // prior test samples ONLY inside or right at the 20-frame [80,100] window,
  // where `active` is `true` either way. The real consequence: `b` (the
  // incoming clip) would be INVISIBLE for its entire POST-CUT life (frames
  // 100-179), not just hidden during the transition — the `wrap` contract's
  // own "must be inert (render `children` unchanged) when `active` is false"
  // clause (`LayerOp.wrap`'s doc comment, `lib/theming/transitions.ts`),
  // unasserted for this wrap.
  //
  // NOT generalised into a DERIVED pin over every wrap-carrying `plan` kind,
  // on purpose, and the reason is structural rather than a shortcut: every
  // OTHER wrap-carrying kind is already exercised at ITS OWN catalog default
  // by `plan-neutral-progress.test.tsx`'s `describe.each(PLAN_KINDS)` block,
  // because a lifted `@remotion/transitions` presentation's `wrap` IS what
  // that kind always uses. `checkerboard` is the one exception: its `wrap`
  // (`HideRealWhileActive`) only exists on the `'scale'`/`'flip'` SUB-OPTION,
  // which is NOT the catalog default (`'fade'` is) — so the existing derived
  // sweep, which parameterises by KIND only, structurally cannot reach it.
  // Generalising that sweep to parameterise by kind AND sub-option would be a
  // real architecture change to `plan-neutral-progress.test.tsx` (every kind,
  // not just this one), is unrelated to fixing this specific defect, and
  // risks conflating an architecture change with a fix-round mutation test.
  // A kind-specific real-tree test is the narrower, correct-sized fix here;
  // if a FUTURE kind ships a second wrap gated on a non-default sub-option,
  // it will need the identical kind-specific treatment, which is a fair cost
  // for not touching the shared sweep's shape in a fix round.
  it.each(['scale', 'flip'] as const)(
    '%s: the real mount is VISIBLE (effective opacity 1) once the window has closed — the wrap is inert when inactive',
    (squareAnimation) => {
      clock.preview = false;
      clock.frame = 150; // b's Sequence is frames 90-179; well past the window's close at 100
      const { container } = render(
        <>
          {buildVideoNodesForCheckerboard(CHECKERBOARD_REEL(squareAnimation), {
            renderItem: (item) => <video data-testid={`vid-${item.id}`} />,
            width: 540, height: 960, fps: 30, palette: undefined,
          })}
        </>,
      );
      const bVideo = container.querySelector('[data-testid="vid-b"]');
      expect(bVideo).not.toBeNull();
      expect(effectiveOpacity(bVideo!)).toBe(1);
    },
  );
});
