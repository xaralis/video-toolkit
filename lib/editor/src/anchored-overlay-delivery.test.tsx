// Phase 4 Task 4.1 — `anchoredOverlays` actually render.
//
// Before this task, `routing: 'anchored'` routed an overlay item off the
// track (lib/render/overlay-routing.ts) and DELIVERED it to the owning video
// item's `anchoredOverlays` prop (lib/render/layered-composition.tsx) — but
// NOTHING consumed that prop. No error, no warning, no type change: the
// overlay was silently deleted.
//
// This file exercises the REAL composition path — `LayeredReelComposition` →
// `renderVideoItemNode` → the core `SegmentMedia`/`GenericMultiClip`/
// `GenericCard`/`GenericOutro` generics — rather than calling a generic
// directly with a hand-rolled `renderAnchoredOverlay`, precisely so this test
// cannot be satisfied by a change that never reaches the real delivery seam
// (see CONSTRAINTS.md's "mutation discipline": a capability pinned only
// against a mock render path has been the recurring hole in this programme).
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  return {
    ...actual,
    useCurrentFrame: () => 0,
    useVideoConfig: () => ({
      width: 1080,
      height: 1920,
      fps: 30,
      durationInFrames: 300,
      id: 'test',
      defaultProps: {},
      props: {},
    }),
    staticFile: (s: string) => s,
    // Passthrough: <Sequence> needs the timeline context a real composition
    // supplies — its own `from`/`durationInFrames` values are pinned in
    // overlay-anchor.test.ts, not here.
    Sequence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    Audio: () => null,
    Img: () => null,
    OffthreadVideo: () => null,
  };
});

import { LayeredReelComposition } from '@video-toolkit/lib/render/layered-composition';
import type { CompositionTheme } from '@video-toolkit/lib/theming';
import type { LayeredReel, OverlayItem, VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

const clip: VideoItem = {
  id: 'seg-1',
  kind: 'clip',
  startMs: 0,
  endMs: 5000,
  source: 'recordings/a.mp4',
  sourceInMs: 0,
  sourceOutMs: 5000,
};

const multiClip: VideoItem = {
  id: 'mc-1',
  kind: 'multi-clip',
  startMs: 0,
  endMs: 5000,
  layout: 'split-h',
  sources: [
    { source: 'recordings/a.mp4', sourceInMs: 0, sourceOutMs: 2000 },
    { source: 'recordings/b.mp4', sourceInMs: 0, sourceOutMs: 2000 },
  ],
};

const card: VideoItem = {
  id: 'card-1',
  kind: 'card',
  startMs: 0,
  endMs: 5000,
  cardKind: 'unimplemented-plate',
};

const outro: VideoItem = {
  id: 'outro-1',
  kind: 'outro',
  startMs: 0,
  endMs: 5000,
};

const anchoredOverlay = (id: string, anchorVideoId: string): OverlayItem => ({
  id,
  startMs: 500,
  endMs: 4500,
  anchorVideoId,
  content: { kind: 'anchor-marker' },
});

const reelWith = (video: VideoItem[], overlays: OverlayItem[]): LayeredReel => ({
  version: 'layered-1',
  meta: { topic: 'anchored-delivery', totalDurationMs: 5000 },
  tracks: { video, audio: [], music: { baseVolumeDb: -8 }, overlays, brand: [] },
});

const themeWith = (): CompositionTheme => ({
  accentSlots: [],
  background: '#000',
  overlayItems: {
    'anchor-marker': {
      routing: 'anchored',
      render: (item) => <div data-testid={`anchored-${item.id}`}>{item.id}</div>,
    },
  },
});

describe('anchoredOverlays actually render (Task 4.1 delivery)', () => {
  it('draws an overlay routed anchored onto a clip item (SegmentMedia)', () => {
    const overlay = anchoredOverlay('a1', 'seg-1');
    const { queryByTestId } = render(<LayeredReelComposition reel={reelWith([clip], [overlay])} theme={themeWith()} />);
    // Before this task: silently dropped. Now: delivered and drawn.
    expect(queryByTestId('anchored-a1')).not.toBeNull();
  });

  it('draws an overlay routed anchored onto a multi-clip item (GenericMultiClip)', () => {
    const overlay = anchoredOverlay('a2', 'mc-1');
    const { queryByTestId } = render(<LayeredReelComposition reel={reelWith([multiClip], [overlay])} theme={themeWith()} />);
    expect(queryByTestId('anchored-a2')).not.toBeNull();
  });

  it('draws an overlay routed anchored onto a card item (GenericCard)', () => {
    const overlay = anchoredOverlay('a3', 'card-1');
    const { queryByTestId } = render(<LayeredReelComposition reel={reelWith([card], [overlay])} theme={themeWith()} />);
    expect(queryByTestId('anchored-a3')).not.toBeNull();
  });

  it('draws an overlay routed anchored onto an outro item (GenericOutro)', () => {
    const overlay = anchoredOverlay('a4', 'outro-1');
    const { queryByTestId } = render(<LayeredReelComposition reel={reelWith([outro], [overlay])} theme={themeWith()} />);
    expect(queryByTestId('anchored-a4')).not.toBeNull();
  });

  it('never mounts the overlay off the track (only inside its anchor item)', () => {
    const overlay = anchoredOverlay('a5', 'seg-1');
    const { getAllByTestId } = render(<LayeredReelComposition reel={reelWith([clip], [overlay])} theme={themeWith()} />);
    // Exactly one mount — not double-delivered on the track AND anchored.
    expect(getAllByTestId('anchored-a5')).toHaveLength(1);
  });

  it('track-routed and anchored-routed overlays of the SAME kind render identically (one dispatch, makeOverlayRenderer)', () => {
    const track: OverlayItem = { id: 't1', startMs: 500, endMs: 4500, content: { kind: 'anchor-marker' } };
    const anchored = anchoredOverlay('a6', 'seg-1');
    const theme: CompositionTheme = {
      accentSlots: [],
      background: '#000',
      overlayItems: {
        'anchor-marker': {
          // routing decided PER ITEM by anchorVideoId presence — 'track' here
          // means "only route anchored when anchorVideoId is set", per
          // overlay-routing.ts.
          routing: 'anchored',
          render: (item) => <div data-testid="marker">{item.id}</div>,
        },
      },
    };
    const { getAllByTestId } = render(<LayeredReelComposition reel={reelWith([clip], [track, anchored])} theme={theme} />);
    const ids = getAllByTestId('marker').map((el) => el.textContent);
    expect(ids.sort()).toEqual(['a6', 't1']);
  });
});
