// THE THREAD, END TO END (Phase 4 Task 2.2).
//
// `at-cut-transitions.test.tsx` pins what a NODE does with a null input. This
// file pins the other half: that the colour it resolves to actually comes from
// `CompositionTheme.background` and travels the whole way —
//
//   theme.background → LayeredReelComposition → buildVideoNodes (nodeDims)
//     → AtCutTransition → TransitionNodeProps.background → the edge plate
//
// — rather than being a literal in the render path. A hardcoded `#000` would
// satisfy every node-level assertion in the other file and would be exactly the
// brand-leak class this programme exists to remove, so the pin here is
// DIFFERENTIAL: render the same reel under two themes and require the plate to
// follow the theme.
//
// jsdom, so this says nothing about pixels — `examples/layered-minimal`'s pixel
// harness covers those. `Sequence` is a passthrough here (the same stub
// overlay-registry.test.tsx uses) because the placement of the boundary window
// is settled by video-track-layout.test.ts, not here; what matters is that the
// boundary mounts at all and what it hands the node.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  return {
    ...actual,
    useCurrentFrame: () => 10,
    useVideoConfig: () => ({
      width: 1080, height: 1920, fps: 30, durationInFrames: 300, id: 'test', defaultProps: {}, props: {},
    }),
    staticFile: (s: string) => s,
    Sequence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    Audio: () => null,
  };
});

import { LayeredReelComposition } from '@video-toolkit/lib/render/layered-composition';
import type { CompositionTheme, VideoRenderProps } from '@video-toolkit/lib/theming';
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';

/** A flat plate with a colour nothing else in this file uses, so "the clip" and
 *  "the edge background" can never be confused for one another. */
const Plate: React.FC<VideoRenderProps> = () => <div data-testid="clip" style={{ backgroundColor: '#00ff00' }} />;

const themeWith = (background: string): CompositionTheme => ({
  accentSlots: [],
  background,
  video: { card: { renderer: Plate } },
});

/** ONE clip carrying a `transitionOut` — which, being the last item, is the
 *  reel's TRAILING edge: a boundary with `to === null`. */
const reel: LayeredReel = {
  version: 'layered-1',
  meta: { topic: 'trailing edge', totalDurationMs: 2000 },
  tracks: {
    video: [
      {
        id: 'only',
        kind: 'card',
        startMs: 0,
        endMs: 2000,
        cardKind: 'plate',
        transitionOut: { kind: 'fade', frames: 20 },
      },
    ] as unknown as LayeredReel['tracks']['video'],
    audio: [],
    music: { baseVolumeDb: 0 },
    overlays: [],
    brand: [],
  },
};

/** The edge plate is the only element the transition itself paints, and it sits
 *  INSIDE the fade's opacity layer — which is what distinguishes it from the
 *  composition's own root AbsoluteFill, painted with the same colour. */
const edgePlatesOf = (container: HTMLElement, rgb: string) =>
  [...container.querySelectorAll('div')].filter(
    (d) => d.style.backgroundColor === rgb && d.parentElement?.style.opacity !== '',
  );

describe('the reel’s trailing edge fades to the THEME background', () => {
  it('paints the edge with theme.background', () => {
    const { container } = render(<LayeredReelComposition reel={reel} theme={themeWith('#123456')} />);
    expect(edgePlatesOf(container, 'rgb(18, 52, 86)')).toHaveLength(1);
  });

  // THE ANTI-HARDCODE PIN. Same reel, different theme: the plate must move with
  // it. A literal colour in the render path passes the test above and fails
  // this one.
  it('follows the theme when the brand changes its background', () => {
    const { container } = render(<LayeredReelComposition reel={reel} theme={themeWith('#654321')} />);
    expect({
      followed: edgePlatesOf(container, 'rgb(101, 67, 33)').length,
      stale: edgePlatesOf(container, 'rgb(18, 52, 86)').length,
      black: edgePlatesOf(container, 'rgb(0, 0, 0)').length,
    }).toEqual({ followed: 1, stale: 0, black: 0 });
  });
});
