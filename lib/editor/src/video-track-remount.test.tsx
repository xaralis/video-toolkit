// TASK R1 — the DOM-IDENTITY probe, promoted to a kept test.
//
// Diagnosed in
// .superpowers/sdd/2026-07-26-phase4-node-contract/editor-transition-regression.md:
// Phase 4 Task 1.3 (`8ed0c13`) renders an item's content at a DIFFERENT
// POSITION in the React tree for the frames a boundary owns (once under the
// item's own Sequence, once re-based inside the boundary's compositor).
// React reconciles by position, so a footage `<video>` is destroyed and
// recreated TWICE per boundary — once on the OPENING edge (the boundary's
// re-based copies mount cold) and once on the CLOSING edge (the item's own
// copy was unmounted for the whole window and has to mount fresh the instant
// the window closes). In the editor's `<Player>` that is a real re-fetch +
// re-seek: a background-colour flash and a stall. At render time frames are
// extracted independently of any DOM, so it is invisible there — which is why
// the fixes below are PREVIEW-GATED (`isPreviewEnvironment`,
// lib/render/preview-environment.ts) rather than universal.
//
// GEOMETRY, straight from the diagnosis: two 3s clips, a 20-frame `fade` on
// the cut, 30fps — boundary window is composition frames 80-100 inclusive
// (BOUNDARY_TAIL makes it `frames + 1` = 21 long).
//
// The Sequence mock below is `transition-alignment-render.test.tsx`'s
// frame-gating + time-rebasing mock, EXTENDED to actually implement
// `premountFor` (mount early, hidden, inheriting into nested Sequences via a
// Premounting context) — real Remotion propagates premounting to children
// exactly this way (see `Sequence.js`'s `premounting = parentSequence
// premounting || …`), so this is not a stand-in shape, it is the same
// mechanism at the one property these tests read.
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
    // Controllable stand-in for the real `getRemotionEnvironment` — the same
    // function `isPreviewEnvironment` calls. `isPlayer`/`isStudio` are what
    // gate Fixes 1-2; jsdom has neither `window.remotion_isPlayer` nor
    // `window.remotion_isStudio`, so the real function would always read
    // "not preview" here regardless — this mock is what lets the test choose.
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
import type { VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

const clip = (id: string, startMs: number, endMs: number, extra: Record<string, unknown> = {}): VideoItem =>
  ({ id, kind: 'clip', startMs, endMs, source: `${id}.mp4`, sourceInMs: 0, sourceOutMs: endMs - startMs, ...extra }) as VideoItem;

// a: 0-3000ms with a 20-frame fade out. b: 3000-6000ms. 30fps -> cut at frame
// 90, `fade`'s default (center) alignment gives a window of [80, 100].
const reel = (): VideoItem[] => [
  clip('a', 0, 3000, { transitionOut: { kind: 'fade', frames: 20 } }),
  clip('b', 3000, 6000),
];

const tree = () => (
  <>
    {buildVideoNodes(reel(), {
      renderItem: (item) => <video data-testid={`vid-${item.id}`} />,
      width: 540,
      height: 960,
      fps: 30,
      palette: undefined,
    })}
  </>
);

beforeEach(() => {
  clock.preview = false;
});

describe('closing edge — item b keeps its own DOM identity across the boundary (Fix 1)', () => {
  it('does not remount b when the boundary hands its frames back at frame 101', () => {
    clock.preview = true;
    clock.frame = 80;
    const { container, rerender } = render(tree());
    const atOpen = container.querySelectorAll('[data-testid="vid-b"]');
    // With Fix 1, b's own Sequence keeps its child mounted (hidden) through
    // the whole window, alongside the boundary's own visible copy: TWO nodes
    // exist simultaneously. The FIRST in document order is b's own — item
    // Sequences are pushed into buildVideoNodes' array before the boundary
    // that owns them (see video-track.tsx, `items.forEach`).
    expect(atOpen.length).toBe(2);
    const ownAtOpen = atOpen[0];

    clock.frame = 100;
    rerender(tree());
    const ownAtWindowEnd = container.querySelectorAll('[data-testid="vid-b"]')[0];
    expect(ownAtWindowEnd).toBe(ownAtOpen);

    clock.frame = 101;
    rerender(tree());
    const afterWindow = container.querySelectorAll('[data-testid="vid-b"]');
    // The boundary has closed: only b's own copy remains.
    expect(afterWindow.length).toBe(1);
    expect(afterWindow[0]).toBe(ownAtOpen);
  });
});

describe('opening edge — the boundary premounts before its window opens (Fix 2)', () => {
  it('mounts the boundary (and its re-based copies) before frame 80, and keeps that identity once the window opens', () => {
    clock.preview = true;
    clock.frame = 65; // 15 frames before the window opens
    const { container, rerender } = render(tree());
    const premounted = container.querySelectorAll('[data-testid="vid-b"]');
    expect(premounted.length).toBe(1); // the boundary's premounted, hidden copy
    const premountedNode = premounted[0];

    clock.frame = 80;
    rerender(tree());
    const atOpen = container.querySelectorAll('[data-testid="vid-b"]');
    // Fix 1 also applies here (preview), so b's own hidden copy joins in —
    // the boundary's copy (now visible) is what must have SURVIVED from the
    // premount frame with no new mount.
    expect(atOpen).toContain(premountedNode);
  });
});

describe('preview gate — the render path takes neither fix (parity statement)', () => {
  it('Fix 1: ItemBody still unmounts on blanked frames outside preview', () => {
    clock.preview = false;
    clock.frame = 85; // inside the window
    const { container } = render(tree());
    // No hidden own-copy of b coexisting with the boundary's copy — exactly
    // one node, the boundary's, as before Task R1.
    expect(container.querySelectorAll('[data-testid="vid-b"]').length).toBe(1);
  });

  it('Fix 2: the boundary does not premount outside preview', () => {
    clock.preview = false;
    clock.frame = 65; // 15 frames before the window opens
    const { container } = render(tree());
    expect(container.querySelectorAll('[data-testid="vid-b"]').length).toBe(0);
  });
});

// TASK R2 — THE RESIDUAL COST, PINNED. R1 removed every remount of a SHOWN
// media element, but left up to FOUR alive around one cut in preview (item a's
// own copy, item b's own copy, and the boundary's two re-based copies), two of
// them decoding the same frames of the same file at the same time. Nothing
// asserted that count, so nothing could tell an improvement from a regression.
//
// Three is the FLOOR under Task 1.3's contract, and the argument is structural,
// not empirical: a node RENDERS its two inputs as children, so an input that
// outlives the boundary window has to exist inside the node AND in its own
// Sequence. The one copy that is neither of those — the OUTGOING clip's own
// copy, hidden for a window that runs to the end of its Sequence and therefore
// never shown again — is what Task R2 releases.
describe('media elements alive around a footage cut (Task R2)', () => {
  it('preview: exactly three — the incoming clip keeps its own copy, the outgoing clip does not', () => {
    clock.preview = true;
    clock.frame = 85; // mid-window
    const { container } = render(tree());
    // a: only the boundary's re-based copy. Its own copy is blanked from frame
    // 80 to the end of its Sequence (frame 99), so it can never be shown again.
    expect(container.querySelectorAll('[data-testid="vid-a"]').length).toBe(1);
    // b: its own copy (hidden, warm, and it IS shown again at frame 101) plus
    // the boundary's re-based copy.
    expect(container.querySelectorAll('[data-testid="vid-b"]').length).toBe(2);
    expect(container.querySelectorAll('video').length).toBe(3);
  });

  it('render path: exactly two — the boundary\'s own two copies, unchanged since Task 1.3', () => {
    clock.preview = false;
    clock.frame = 85;
    const { container } = render(tree());
    expect(container.querySelectorAll('[data-testid="vid-a"]').length).toBe(1);
    expect(container.querySelectorAll('[data-testid="vid-b"]').length).toBe(1);
    expect(container.querySelectorAll('video').length).toBe(2);
  });

  it('releases the outgoing clip\'s own copy on the FIRST frame the boundary claims, not one before it', () => {
    clock.preview = true;
    clock.frame = 79; // a's last unclaimed frame — it is still DRAWN here
    const { container, rerender } = render(tree());
    // a's own (visible) copy + the boundary's premounted re-based one.
    expect(container.querySelectorAll('[data-testid="vid-a"]').length).toBe(2);

    clock.frame = 80; // the boundary's first frame
    rerender(tree());
    expect(container.querySelectorAll('[data-testid="vid-a"]').length).toBe(1);
  });
});

describe('the amplifier — a boundary keeps its node identity across an unrelated re-render (Fix 3)', () => {
  it('does not remount the boundary contents when buildVideoNodes is called again with unchanged config', () => {
    clock.frame = 85; // inside the window, independent of the preview gate
    const { container, rerender } = render(tree());
    const first = Array.from(container.querySelectorAll('[data-testid="vid-a"], [data-testid="vid-b"]'));
    expect(first.length).toBeGreaterThan(0);

    // Simulates what happens to LayeredReelComposition on every inspector
    // edit: a fresh render, i.e. a fresh call to buildVideoNodes(), with the
    // reel's authored config UNCHANGED.
    rerender(tree());
    const second = Array.from(container.querySelectorAll('[data-testid="vid-a"], [data-testid="vid-b"]'));
    // `toEqual` on DOM nodes compares STRUCTURE (tag + attributes), which two
    // independently-mounted-but-identical <video> elements would satisfy even
    // after a real remount — exactly the false-positive this test exists to
    // rule out. Reference identity, element by element, is the only check
    // that actually pins "no remount happened".
    expect(second.length).toBe(first.length);
    second.forEach((el, i) => expect(el).toBe(first[i]));
  });
});
