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

  // ---- media-path resolution (Phase 3 Task 6) --------------------------------
  // SegmentMedia now runs item.source through core's ONE media-path rule
  // (lib/theming/media-source.ts) before staticFile. These pin that BOTH
  // brands keep resolving to exactly the byte-identical path they did before,
  // which is the whole safety argument for adopting roost's rule.
  describe('media-path resolution', () => {
    const srcOf = (item: any) => {
      captured.video.length = 0;
      captured.img.length = 0;
      render(<SegmentMedia item={item} handles={{ inHalf: 0, outHalf: 0 }} />);
      return (captured.video[0] ?? captured.img[0]).src;
    };
    const clip = (source: string) => ({ id: 'c', kind: 'clip', startMs: 0, endMs: 1000, source, sourceInMs: 0, sourceOutMs: 1000 });

    // PP's clip/broll renderers build a SHALLOW-CLONED item whose source is
    // already prefixed (`{ ...item, source: \`recordings/${item.source}\` }`)
    // and hand THAT to SegmentMedia. The rule's idempotence is what keeps that
    // working unchanged — a second `recordings/` prefix would 404 every clip.
    it('leaves PP\'s already-prefixed shallow-cloned source alone (idempotent)', () => {
      const raw = { id: 'c', kind: 'clip', startMs: 0, endMs: 1000, source: 'seg02.MP4', sourceInMs: 0, sourceOutMs: 1000 };
      const ppShape = { ...raw, source: `recordings/${raw.source}` };
      expect(srcOf(ppShape)).toBe('recordings/seg02.MP4');
      // ... and the ORIGINAL item is untouched: loadTranscriptSync derives
      // `recordings/<source>.transcript.json` from the BARE name.
      expect(raw.source).toBe('seg02.MP4');
    });

    it("leaves roost's media/… source alone for every footage kind", () => {
      expect(srcOf(clip('media/VIDEO-2026.mp4'))).toBe('media/VIDEO-2026.mp4');
      expect(
        srcOf({ id: 'b', kind: 'broll', startMs: 0, endMs: 1000, source: 'media/VIDEO-2026.mp4', sourceInMs: 0, sourceOutMs: 1000 }),
      ).toBe('media/VIDEO-2026.mp4');
      expect(srcOf({ id: 'p', kind: 'photo', startMs: 0, endMs: 1000, source: 'media/PHOTO-2026.jpg' })).toBe(
        'media/PHOTO-2026.jpg',
      );
    });

    // The genuinely NEW capability: a BARE filename now gets the role's folder
    // instead of being handed to staticFile as-is (which resolved to a
    // nonexistent public/seg02.MP4). Mutating the resolveSrc call to pass the
    // source through unchanged turns exactly these three red.
    it('prefixes a bare filename by the item kind', () => {
      expect(srcOf(clip('seg02.MP4'))).toBe('recordings/seg02.MP4');
      expect(
        srcOf({ id: 'b', kind: 'broll', startMs: 0, endMs: 1000, source: 'street.mp4', sourceInMs: 0, sourceOutMs: 1000 }),
      ).toBe('broll/street.mp4');
      // photo has no folder in either brand — bare stays bare.
      expect(srcOf({ id: 'p', kind: 'photo', startMs: 0, endMs: 1000, source: 'skyline.jpg' })).toBe('skyline.jpg');
    });

    it('passes an http source through without staticFile', () => {
      expect(srcOf(clip('https://cdn/x.mp4'))).toBe('https://cdn/x.mp4');
    });

    it("honours a brand's wholesale resolveMediaSource override", () => {
      render(
        <SegmentMedia
          item={clip('seg02.MP4') as any}
          handles={{ inHalf: 0, outHalf: 0 }}
          resolveMediaSource={(raw, role) => `cdn/${role}/${raw}`}
        />,
      );
      expect(captured.video[0].src).toBe('cdn/clip/seg02.MP4');
    });
  });
});
