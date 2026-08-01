// Phase 4 Task 4.1 — SegmentMedia's own anchored-overlay wiring, at the unit
// level (the composition-level delivery pin lives in
// anchored-overlay-delivery.test.tsx). Two things this file pins that the
// composition-level test cannot see directly:
//  1. the zero-overlay case renders an IDENTICAL tree to before this
//     capability existed (mutation 3 — the AbsoluteFill wrap must be
//     CONDITIONAL on a non-empty overlay list);
//  2. anchoredOverlays are rebased through the real `anchorTiming` (not a
//     stub), landing at the frame overlay-anchor.test.ts pins.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  return {
    ...actual,
    useCurrentFrame: () => 0,
    useVideoConfig: () => ({ fps: 30 }),
    staticFile: (s: string) => s,
    // Real markers instead of a captured-props mock, so this file can assert
    // on the DOM TREE SHAPE (is there a wrapper div or not) rather than only
    // on which props a mocked element received.
    Img: (props: { src: string }) => <img data-testid="media" src={props.src} alt="" />,
    OffthreadVideo: (props: { src: string }) => <video data-testid="media" src={props.src} />,
    Sequence: ({ children, from, durationInFrames, name }: any) => (
      <div data-testid="sequence" data-from={from} data-duration={durationInFrames} data-name={name}>
        {children}
      </div>
    ),
  };
});

import { SegmentMedia } from '@video-toolkit/lib/theming/segment/SegmentMedia';
import type { VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';
import type { OverlayItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

const photo: VideoItem = {
  id: 'p1',
  kind: 'photo',
  startMs: 2000,
  endMs: 7000,
  source: 'photos/a.jpg',
};

describe('SegmentMedia anchoredOverlays (Task 4.1)', () => {
  it('renders the bare media element with NO wrapper when there are no anchored overlays (mutation 3 — parity)', () => {
    const { container } = render(<SegmentMedia item={photo} handles={{ inHalf: 0, outHalf: 0 }} />);
    // No overlays at all: root is the Img itself, not wrapped in an
    // AbsoluteFill div. An unconditional wrapper would insert a <div> here
    // for every clip/broll/photo in every brand repo — the parity break this
    // task must not cause.
    expect(container.firstElementChild?.tagName).toBe('IMG');
  });

  it('still renders the bare media element with NO wrapper when anchoredOverlays is an empty array', () => {
    const { container } = render(
      <SegmentMedia item={photo} handles={{ inHalf: 0, outHalf: 0 }} anchoredOverlays={[]} renderAnchoredOverlay={() => <div />} />,
    );
    expect(container.firstElementChild?.tagName).toBe('IMG');
  });

  it('wraps in an AbsoluteFill and draws the overlay, rebased through the real per-endpoint frame math, when an overlay IS anchored here', () => {
    const overlay: OverlayItem = { id: 'o1', startMs: 2500, endMs: 3500, content: { kind: 'marker' } };
    const renderAnchoredOverlay = vi.fn((item: OverlayItem) => <div data-testid={`anchored-${item.id}`}>{item.id}</div>);

    const { container, getByTestId } = render(
      <SegmentMedia
        item={photo}
        handles={{ inHalf: 4, outHalf: 0 }}
        anchoredOverlays={[overlay]}
        renderAnchoredOverlay={renderAnchoredOverlay}
      />,
    );

    // Wrapped now — root is a DIV (AbsoluteFill), containing the media AND
    // the overlay's Sequence.
    expect(container.firstElementChild?.tagName).toBe('DIV');
    expect(getByTestId('media')).not.toBeNull();
    expect(getByTestId('anchored-o1').textContent).toBe('o1');
    expect(renderAnchoredOverlay).toHaveBeenCalledWith(overlay);

    // Frame math: item.startMs=2000, overlay.startMs=2500, fps=30, inHalf=4.
    // from = round(2500/1000*30) - round(2000/1000*30) + 4 = 75 - 60 + 4 = 19
    // durationInFrames = round(3500/1000*30) - round(2500/1000*30) = 105-75=30
    const seq = getByTestId('sequence');
    expect(seq.dataset.from).toBe('19');
    expect(seq.dataset.duration).toBe('30');
  });

  it('skips an anchored overlay whose rebased window is non-positive', () => {
    const degenerate: OverlayItem = { id: 'o2', startMs: 2500, endMs: 2500, content: { kind: 'marker' } };
    const renderAnchoredOverlay = vi.fn(() => <div data-testid="anchored-o2" />);
    const { queryByTestId } = render(
      <SegmentMedia
        item={photo}
        handles={{ inHalf: 0, outHalf: 0 }}
        anchoredOverlays={[degenerate]}
        renderAnchoredOverlay={renderAnchoredOverlay}
      />,
    );
    expect(queryByTestId('anchored-o2')).toBeNull();
  });
});
