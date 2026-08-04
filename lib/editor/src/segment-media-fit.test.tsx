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

  it('renders a blurred cover backdrop behind a contained foreground under contain + blur pad', () => {
    render(
      <SegmentMedia item={broll({ fit: 'contain', pad: 'blur' })} handles={{ inHalf: 0, outHalf: 0 }} />,
    );

    expect(captured.video).toHaveLength(2);
    const [backdrop, foreground] = captured.video;

    expect(backdrop.src).toBe('broll/portrait.mp4');
    expect(backdrop.style.objectFit).toBe('cover');
    expect(backdrop.style.filter).toContain('blur(32px)');

    expect(foreground.src).toBe('broll/portrait.mp4');
    expect(foreground.style.objectFit).toBe('contain');
  });

  it('centres the foreground by default', () => {
    render(
      <SegmentMedia item={broll({ fit: 'contain', pad: 'blur' })} handles={{ inHalf: 0, outHalf: 0 }} />,
    );

    expect(captured.video[1].style.objectPosition).toBe('50% 50%');
  });

  it('places the foreground wherever placeX/placeY say, matching what the legacy hard-pin used to look like', () => {
    render(
      <SegmentMedia
        item={broll({ fit: 'contain', pad: 'blur', placeX: 1, placeY: 0.5 })}
        handles={{ inHalf: 0, outHalf: 0 }}
      />,
    );

    expect(captured.video[1].style.objectPosition).toBe('100% 50%');
  });

  it('reaches the foreground only — placement never touches the backdrop', () => {
    render(
      <SegmentMedia
        item={broll({ fit: 'contain', pad: 'blur', placeX: 0.1, placeY: 0.9 })}
        handles={{ inHalf: 0, outHalf: 0 }}
      />,
    );

    const [backdrop, foreground] = captured.video;
    expect(backdrop.style.objectPosition).toBeUndefined();
    expect(foreground.style.objectPosition).toBe('10% 90%');
  });

  it('inverts backdropDim into brightness exactly once', () => {
    render(
      <SegmentMedia
        item={broll({ fit: 'contain', pad: 'blur', backdropDim: 0.45 })}
        handles={{ inHalf: 0, outHalf: 0 }}
      />,
    );

    expect(captured.video[0].style.filter).toContain('brightness(0.55)');
  });

  it('carries an authored backdropBlur through to the backdrop', () => {
    render(
      <SegmentMedia
        item={broll({ fit: 'contain', pad: 'blur', backdropBlur: 8 })}
        handles={{ inHalf: 0, outHalf: 0 }}
      />,
    );

    expect(captured.video[0].style.filter).toContain('blur(8px)');
  });

  it('keeps the backdrop dumb — grade and crop reach the foreground only', () => {
    render(
      <SegmentMedia
        item={broll({
          fit: 'contain',
          pad: 'blur',
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
        item={{
          id: 'p1',
          kind: 'photo',
          startMs: 0,
          endMs: 3000,
          source: 'photos/tall.jpg',
          fit: 'contain',
          pad: 'blur',
        }}
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
        item={broll({ fit: 'contain', pad: 'blur', sourceInMs: 1000, sourceOutMs: 4000 })}
        handles={{ inHalf: 0, outHalf: 0 }}
      />,
    );

    const [backdrop, foreground] = captured.video;
    expect(backdrop.startFrom).toBe(foreground.startFrom);
    expect(backdrop.endAt).toBe(foreground.endAt);
  });

  it('a legacy fit: "blur-pad" item renders exactly like fit: "contain", pad: "blur"', () => {
    render(<SegmentMedia item={broll({ fit: 'blur-pad' })} handles={{ inHalf: 0, outHalf: 0 }} />);
    const legacy = captured.video.map((v) => ({ src: v.src, style: v.style }));

    captured.video.length = 0;
    render(
      <SegmentMedia item={broll({ fit: 'contain', pad: 'blur' })} handles={{ inHalf: 0, outHalf: 0 }} />,
    );
    const explicit = captured.video.map((v) => ({ src: v.src, style: v.style }));

    expect(legacy).toEqual(explicit);
  });

  describe('pad kinds', () => {
    it('pad: "blur" renders two media elements (backdrop + foreground)', () => {
      render(
        <SegmentMedia item={broll({ fit: 'contain', pad: 'blur' })} handles={{ inHalf: 0, outHalf: 0 }} />,
      );
      expect(captured.video).toHaveLength(2);
    });

    it('pad: "color" with a padColor renders one media element plus one fill, no backdrop media copy', () => {
      const { container } = render(
        <SegmentMedia
          item={broll({ fit: 'contain', pad: 'color', padColor: '#ff0000' })}
          handles={{ inHalf: 0, outHalf: 0 }}
        />,
      );
      expect(captured.video).toHaveLength(1);
      const fill = Array.from(container.querySelectorAll('div')).find(
        (el) => (el as HTMLElement).style.backgroundColor === 'rgb(255, 0, 0)',
      );
      expect(fill).toBeTruthy();
    });

    it('pad: "color" with no padColor renders one media element only — no backdrop node at all', () => {
      render(
        <SegmentMedia item={broll({ fit: 'contain', pad: 'color' })} handles={{ inHalf: 0, outHalf: 0 }} />,
      );
      expect(captured.video).toHaveLength(1);
    });

    it('pad: "none" renders one media element only — no backdrop node at all', () => {
      render(
        <SegmentMedia item={broll({ fit: 'contain', pad: 'none' })} handles={{ inHalf: 0, outHalf: 0 }} />,
      );
      expect(captured.video).toHaveLength(1);
    });
  });

  it('under contain, zoom still anchors on the pan: transformOrigin comes from crop, objectPosition from placement, and they can differ', () => {
    render(
      <SegmentMedia
        item={broll({
          fit: 'contain',
          pad: 'blur',
          placeX: 0.2,
          placeY: 0.8,
          crop: { width: 0.5, x: 0.9, y: 0.1 },
        })}
        handles={{ inHalf: 0, outHalf: 0 }}
      />,
    );

    const foreground = captured.video[1];
    expect(foreground.style.objectPosition).toBe('20% 80%');
    expect(foreground.style.transformOrigin).toBe('90% 10%');
    expect(foreground.style.objectPosition).not.toBe(foreground.style.transformOrigin);
  });

  it('under contain, a ken-burns objectPosition ramp is discarded (placement owns it) while its scale ramp still runs — a decision, not a bug', () => {
    render(
      <SegmentMedia
        item={broll({
          fit: 'contain',
          pad: 'blur',
          placeX: 0.2,
          placeY: 0.8,
          effects: [{ type: 'ken-burns', fromX: 0.1, toX: 0.9, fromY: 0.1, toY: 0.9, fromScale: 1, toScale: 1.5 }],
        })}
        handles={{ inHalf: 0, outHalf: 0 }}
      />,
    );

    const foreground = captured.video[1];
    // Placement wins over whatever objectPosition the ken-burns ramp wanted.
    expect(foreground.style.objectPosition).toBe('20% 80%');
    // The scale ramp still ran — frame 0 sits at fromScale.
    expect(foreground.style.transform).toContain('scale(1)');
  });
});
