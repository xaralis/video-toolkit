import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

// Same Remotion mock as segment-media.test.tsx: the real hooks/elements need a
// composition. `captured.video` collects every OffthreadVideo's props in mount
// order, which is what lets a two-element render (backdrop + foreground) be
// asserted positionally.
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

const broll = (extra: Record<string, unknown> = {}) => ({
  id: 'b1',
  kind: 'broll' as const,
  startMs: 0,
  endMs: 4000,
  source: 'broll/portrait.mp4',
  sourceInMs: 0,
  sourceOutMs: 4000,
  ...extra,
});

describe('SegmentMedia — fit', () => {
  it('renders one cover-fitted element when fit is omitted', () => {
    render(<SegmentMedia item={broll()} handles={{ inHalf: 0, outHalf: 0 }} />);

    expect(captured.video).toHaveLength(1);
    expect(captured.video[0].style.objectFit).toBe('cover');
  });

  it('renders a blurred cover backdrop behind a contained foreground under blur-pad', () => {
    render(<SegmentMedia item={broll({ fit: 'blur-pad' })} handles={{ inHalf: 0, outHalf: 0 }} />);

    expect(captured.video).toHaveLength(2);
    const [backdrop, foreground] = captured.video;

    expect(backdrop.src).toBe('broll/portrait.mp4');
    expect(backdrop.style.objectFit).toBe('cover');
    expect(backdrop.style.filter).toContain('blur(32px)');

    expect(foreground.src).toBe('broll/portrait.mp4');
    expect(foreground.style.objectFit).toBe('contain');
  });

  it('right-aligns the foreground so it lands where the speaker sits', () => {
    render(<SegmentMedia item={broll({ fit: 'blur-pad' })} handles={{ inHalf: 0, outHalf: 0 }} />);

    expect(captured.video[1].style.objectPosition).toBe('100% 50%');
  });

  it('inverts backdropDim into brightness exactly once', () => {
    render(
      <SegmentMedia
        item={broll({ fit: 'blur-pad', backdropDim: 0.45 })}
        handles={{ inHalf: 0, outHalf: 0 }}
      />,
    );

    expect(captured.video[0].style.filter).toContain('brightness(0.55)');
  });

  it('carries an authored backdropBlur through to the backdrop', () => {
    render(
      <SegmentMedia
        item={broll({ fit: 'blur-pad', backdropBlur: 8 })}
        handles={{ inHalf: 0, outHalf: 0 }}
      />,
    );

    expect(captured.video[0].style.filter).toContain('blur(8px)');
  });

  it('keeps the backdrop dumb — grade and crop reach the foreground only', () => {
    render(
      <SegmentMedia
        item={broll({
          fit: 'blur-pad',
          grade: { saturation: 0 },
          crop: { width: 0.5 },
        })}
        handles={{ inHalf: 0, outHalf: 0 }}
      />,
    );

    const [backdrop, foreground] = captured.video;
    expect(backdrop.style.filter).not.toContain('saturate');
    expect(backdrop.style.transform).toBeUndefined();
    expect(foreground.style.filter).toContain('saturate');
    expect(foreground.style.transform).toContain('scale(');
  });

  it('blur-pads a photo too — the field is on the shared base, so it cannot be silently ignored', () => {
    render(
      <SegmentMedia
        item={{ id: 'p1', kind: 'photo', startMs: 0, endMs: 3000, source: 'photos/tall.jpg', fit: 'blur-pad' }}
        handles={{ inHalf: 0, outHalf: 0 }}
      />,
    );

    expect(captured.img).toHaveLength(2);
    expect(captured.img[0].style.objectFit).toBe('cover');
    expect(captured.img[0].style.filter).toContain('blur(32px)');
    expect(captured.img[1].style.objectFit).toBe('contain');
  });

  it('plays both copies from the same source trim', () => {
    render(
      <SegmentMedia
        item={broll({ fit: 'blur-pad', sourceInMs: 1000, sourceOutMs: 4000 })}
        handles={{ inHalf: 0, outHalf: 0 }}
      />,
    );

    const [backdrop, foreground] = captured.video;
    expect(backdrop.startFrom).toBe(foreground.startFrom);
    expect(backdrop.endAt).toBe(foreground.endAt);
  });
});
