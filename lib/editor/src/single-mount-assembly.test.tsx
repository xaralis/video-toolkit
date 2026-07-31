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
      { key: 'sheet', z: 'between', style: { backgroundColor: 'rgb(1, 2, 3)' } },
      { key: 'lid', z: 'over', style: { backgroundColor: 'rgb(4, 5, 6)' } },
    ],
    // `opacity` is deliberately in here: `post` reads `filter`/`transform` and
    // nothing else, and that narrowness is a pinned property, not an accident.
    ...(p.progress > 0.5 ? { post: { filter: 'blur(2px)', opacity: 0.25 } } : {}),
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
      .toEqual(['rgb(1, 2, 3)', 'rgb(4, 5, 6)']);

    clock.frame = 120;
    rerender(tree());
    expect(platesOf(container).length).toBe(0);
  });

  it('honours z: `between` sits between the two clips by tree order, `over` and `under` by z-index', () => {
    clock.frame = 85;
    const { container } = render(tree());
    const [between, over] = platesOf(container);
    expect(between.style.zIndex).toBe('');
    expect(over.style.zIndex).toBe('1');
    // Tree order is the mechanism for `between`: after a, before b.
    const order = [...container.querySelectorAll('[data-testid], div')];
    expect(order.indexOf(vids(container, 'a')[0])).toBeLessThan(order.indexOf(between));
    expect(order.indexOf(between)).toBeLessThan(order.indexOf(vids(container, 'b')[0]));
  });
});

describe('the reel edge is materialised as a timeline sibling and takes the node\'s op', () => {
  const EDGE = (): VideoItem[] => [
    clip('solo', 0, 3000, { transitionIn: { kind: 'planned', frames: 20 } }),
  ];

  it('mounts an EdgePlate of the composition background for the missing side, styled by the op', () => {
    clock.frame = 5; // window is [0, 20]; progress 0.25
    const { container } = render(tree(EDGE()));
    const plate = [...container.querySelectorAll('div')].find(
      (d) => d.style.backgroundColor === 'rgb(16, 16, 16)',
    );
    expect(plate).toBeTruthy();
    // The `from` op — the missing side's — is applied to it.
    expect(plate!.parentElement!.style.opacity).toBe('0.75');
  });

  it('tells the node the side is missing with `from === null`, exactly as Task 2.2 made it mean', () => {
    clock.frame = 5;
    render(tree(EDGE()));
    const live = seen.filter((p) => p.progress === 0.25);
    expect(live[0].from).toBeNull();
    expect(live[0].to).toEqual({ source: 'clip', range: [0, 20] });
  });
});

describe('`post` applies to the whole video track, narrowly', () => {
  const wrapper = (c: HTMLElement) => c.firstElementChild as HTMLElement;

  it('carries the live boundary\'s filter, and nothing but filter/transform', () => {
    clock.frame = 95; // progress 0.75 — the plan sets post above 0.5
    const { container } = render(tree());
    expect(wrapper(container).style.filter).toBe('blur(2px)');
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
