// PHASE 5 TASK 1.2 — the single-mount assembly, and the seam between the two
// arms.
//
// What this file settles, and what it deliberately does not:
//
//   IT DOES settle that a `plan`-arm boundary and a `composite`-arm boundary
//   render through DIFFERENT paths IN THE SAME REEL — the per-boundary seam
//   that makes Stages 2-4 individually shippable — and that the shells core
//   now wraps every item in are mounted for the item's whole life and never
//   change element type or count across a boundary crossing.
//
//   IT DOES NOT migrate a kind. Every kind in the catalog still resolves to
//   `composite`; the plan node below is built HERE, in the test, out of the
//   brand transition registry — which is also the exact route a brand would
//   use, so this is not a fake seam.
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

const REGISTRY: TransitionRegistry = { planned: { renderer: () => ({ plan }) } };

// a --planned--> b --fade--> c. 30fps, 3s each: cuts at frames 90 and 180,
// both transitions 20 frames and centre-aligned, so the windows are [80, 100]
// (plan) and [170, 190] (composite).
const MIXED = (): VideoItem[] => [
  clip('a', 0, 3000, { transitionOut: { kind: 'planned', frames: 20 } }),
  clip('b', 3000, 6000, { transitionOut: { kind: 'fade', frames: 20 } }),
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
describe('the plan arm and the composite arm coexist, per boundary, in one reel', () => {
  it('a plan boundary mounts each clip ONCE, in preview — where a composite boundary still mounts two', () => {
    clock.preview = true;

    clock.frame = 90; // mid plan window
    const { container, rerender } = render(tree());
    // The whole point: no re-based copy, no blanking. One `a`, one `b`.
    expect(vids(container, 'a').length).toBe(1);
    expect(vids(container, 'b').length).toBe(1);

    clock.frame = 180; // mid composite (fade) window
    rerender(tree());
    // Untouched Task R1/R2 behaviour: `c` (the incoming clip) has its own
    // hidden-but-warm copy AND the boundary's re-based one; `b` (outgoing) has
    // only the boundary's.
    expect(vids(container, 'c').length).toBe(2);
    expect(vids(container, 'b').length).toBe(1);
  });

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
    expect(live[0].from).toEqual({ source: 'clip', range: [0, 19] });
    expect(live[0].to).toEqual({ source: 'clip', range: [0, 20] });
  });

  it('does not evaluate the plan outside its own window', () => {
    clock.frame = 79; // one frame before the window opens
    render(tree());
    expect(seen.length).toBe(0);
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
    const firstShell = vids(container, 'a')[0].parentElement!.parentElement!.parentElement!;
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
    expect(leading[0].to).toEqual({ source: 'clip', range: [0, 20] });

    seen.length = 0;
    clock.frame = 75;
    rerender(tree(TRAILING()));
    const trailing = seen.filter((p) => p.progress === 0.25);
    expect(trailing[0].to).toBeNull();
    // The outgoing clip's own Sequence ends at frame 89, one before the window
    // does — `[0, 19]`, not `[0, 20]`.
    expect(trailing[0].from).toEqual({ source: 'clip', range: [0, 19] });
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

    // A composite-only reel is byte-identical to before this task: no
    // stacking context, so nothing about blending changes.
    rerender(tree([
      clip('x', 0, 3000, { transitionOut: { kind: 'fade', frames: 20 } }),
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
