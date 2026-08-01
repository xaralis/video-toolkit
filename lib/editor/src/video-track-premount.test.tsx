// An item's media must be MOUNTED BEFORE its first visible frame.
//
// THE DEFECT. Every item's Sequence was emitted with no `premountFor`, so a
// clip's `<OffthreadVideo>` first existed on the very frame it had to paint.
// In the editor's `<Player>` that element then has to fetch its media-fragment
// URL and seek before it can show anything — the composition background shows
// through in the meantime. Reported on `pp-program-bydleni` as a black flash at
// a broll → clip cut, and structurally present at EVERY cut; how visible it is
// just depends on whether that byte range is still warm in the browser.
//
// This is the mount-LIFECYCLE class the pixel harness cannot see in either
// direction: it renders 300 independent stills, so "the element existed one
// second earlier" is not a property any of them can hold. Frame-stepped DOM
// identity is, which is what this file does — the same instrument
// `video-track-remount.test.tsx` uses, pointed at the frames BEFORE an item
// rather than the frames around a transition.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const clock = vi.hoisted(() => ({ frame: 0 }));

// Frame-gating + `premountFor` only — the two halves this file measures. Kept
// deliberately smaller than `video-track-remount.test.tsx`'s mock (no
// Premounting context, no time rebasing): nothing here nests Sequences.
vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  const react = await import('react');
  const Sequence: React.FC<{
    from?: number;
    durationInFrames?: number;
    premountFor?: number;
    children?: React.ReactNode;
  }> = ({ from = 0, durationInFrames = Number.POSITIVE_INFINITY, premountFor = 0, children }) => {
    const local = clock.frame - from;
    const premounting = local < 0 && local >= -premountFor;
    if (!premounting && (local < 0 || local >= durationInFrames)) return null;
    return react.createElement(react.Fragment, null, children);
  };
  return {
    ...actual,
    Sequence,
    useCurrentFrame: () => clock.frame,
    useVideoConfig: () => ({ fps: 30, width: 540, height: 960, durationInFrames: 300, id: 'test', defaultProps: {}, props: {} }),
  };
});

import { buildVideoNodes } from '@video-toolkit/lib/render/video-track';
import type { VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

// Two hard-cut items — the bydleni shape exactly: no transitions anywhere, so
// nothing but the item Sequences themselves decides when media mounts.
const items = (): VideoItem[] => [
  { id: 'a', kind: 'clip', startMs: 0, endMs: 3000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 3000 } as VideoItem,
  { id: 'b', kind: 'clip', startMs: 3000, endMs: 6000, source: 'b.mp4', sourceInMs: 0, sourceOutMs: 3000 } as VideoItem,
];

const tree = () => (
  <>
    {buildVideoNodes(items(), {
      renderItem: (item) => <video data-testid={`vid-${item.id}`} />,
      width: 540,
      height: 960,
      fps: 30,
      palette: undefined,
      transitions: {},
    })}
  </>
);

// b starts at 3000ms → frame 90 at 30fps.
const B_START = 90;

beforeEach(() => {
  clock.frame = 0;
});

describe('an item premounts its media before its first visible frame', () => {
  it('mounts the incoming clip while the outgoing one is still on screen', () => {
    clock.frame = B_START - 5;
    const { container } = render(tree());
    expect(container.querySelector('[data-testid="vid-b"]')).not.toBeNull();
  });

  it('keeps that same element — the cut is not a remount', () => {
    clock.frame = B_START - 5;
    const { container, rerender } = render(tree());
    const before = container.querySelector('[data-testid="vid-b"]');
    clock.frame = B_START;
    rerender(tree());
    // Reference identity, not structural equality: two independently mounted
    // <video> elements would satisfy `toEqual` and hide the very remount this
    // asserts against.
    expect(container.querySelector('[data-testid="vid-b"]')).toBe(before);
  });

  it('does not premount an item that is still far away', () => {
    clock.frame = 10;
    const { container } = render(tree());
    expect(container.querySelector('[data-testid="vid-b"]')).toBeNull();
  });

  it('still renders the outgoing item during the premount window', () => {
    clock.frame = B_START - 5;
    const { container } = render(tree());
    expect(container.querySelector('[data-testid="vid-a"]')).not.toBeNull();
  });
});
