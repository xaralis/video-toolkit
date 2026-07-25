import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

// SegmentMedia calls useCurrentFrame/useVideoConfig (Remotion hooks) and
// renders Img/OffthreadVideo — none of which work outside a real Remotion
// composition. Mock the hooks + elements, but keep the REAL interpolate/Easing
// (via importActual) since SegmentMedia's Ken Burns math depends on them.
const frameState = vi.hoisted(() => ({ frame: 0 }));
const captured = vi.hoisted(() => ({ img: [] as any[], video: [] as any[] }));

vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  return {
    ...actual,
    useCurrentFrame: () => frameState.frame,
    useVideoConfig: () => ({ fps: 30 }),
    staticFile: (s: string) => s,
    Img: (props: any) => {
      captured.img.push(props);
      return null;
    },
    OffthreadVideo: (props: any) => {
      captured.video.push(props);
      return null;
    },
  };
});

import { SegmentMedia } from '@video-toolkit/lib/theming/segment/SegmentMedia';

beforeEach(() => {
  frameState.frame = 0;
  captured.img.length = 0;
  captured.video.length = 0;
});

describe('SegmentMedia', () => {
  it('renders a photo with Ken Burns (direction shorthand) as Img with a scaling transform', () => {
    frameState.frame = 10;
    render(
      <SegmentMedia
        item={{
          id: 'p1',
          kind: 'photo',
          startMs: 0,
          endMs: 3000,
          source: 'photos/a.jpg',
          effects: [{ type: 'ken-burns', direction: 'in' }],
        }}
        handles={{ inHalf: 0, outHalf: 0 }}
      />,
    );

    expect(captured.video).toHaveLength(0);
    expect(captured.img).toHaveLength(1);
    const { src, style } = captured.img[0];
    expect(src).toBe('photos/a.jpg');
    expect(style.objectFit).toBe('cover');
    expect(style.transform).toContain('scale(');
  });

  it('trims a clip by sourceInMs minus the borrowed in-handle', () => {
    render(
      <SegmentMedia
        item={{
          id: 'c1',
          kind: 'clip',
          startMs: 0,
          endMs: 5000,
          source: 'recordings/a.mp4',
          sourceInMs: 2000,
          sourceOutMs: 7000,
        }}
        handles={{ inHalf: 6, outHalf: 0 }}
      />,
    );

    expect(captured.img).toHaveLength(0);
    expect(captured.video).toHaveLength(1);
    const { src, muted, startFrom } = captured.video[0];
    expect(src).toBe('recordings/a.mp4');
    expect(muted).toBe(true);
    // round(2000/1000*30) - 6 = 60 - 6 = 54
    expect(startFrom).toBe(54);
  });

  it('applies cropCoverStyle to a broll item with a crop', () => {
    render(
      <SegmentMedia
        item={{
          id: 'b1',
          kind: 'broll',
          startMs: 0,
          endMs: 4000,
          source: 'broll/b.mp4',
          sourceInMs: 0,
          sourceOutMs: 4000,
          crop: { width: 0.5, x: 0.3, y: 0.7 },
        }}
        handles={{ inHalf: 0, outHalf: 0 }}
      />,
    );

    expect(captured.video).toHaveLength(1);
    const { style } = captured.video[0];
    // cropCoverStyle({width:0.5,x:0.3,y:0.7}) -> objectPosition "30% 70%", scale(1/0.5)=2
    expect(style.objectPosition).toBe('30% 70%');
    expect(style.transform).toBe('scale(2)');
    expect(style.transformOrigin).toBe('30% 70%');
  });
});
