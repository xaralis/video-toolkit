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

  // ---- speed (derived playbackRate) ------------------------------------------
  // SegmentMedia derives speed from the item's own two spans (see speed.ts)
  // and passes it to OffthreadVideo as `playbackRate` — no schema field.
  describe('speed', () => {
    it('omits playbackRate when the two spans match (1x) — the existing merge baseline stays undisturbed', () => {
      render(
        <SegmentMedia
          item={{
            id: 'c1', kind: 'clip', startMs: 0, endMs: 5000, source: 'recordings/a.mp4',
            sourceInMs: 2000, sourceOutMs: 7000,
          }}
          handles={{ inHalf: 0, outHalf: 0 }}
        />,
      );
      expect(captured.video[0].playbackRate).toBeUndefined();
      // At 1x, `endAt` keeps its ORIGINAL formula byte-for-byte (see the
      // comment in SegmentMedia.tsx): round(7000/1000*30) = 210.
      expect(captured.video[0].endAt).toBe(210);
    });

    it('passes the derived rate when the spans disagree, and widens endAt to the full on-screen span', () => {
      render(
        <SegmentMedia
          item={{
            // Timeline span 2000ms, source span 4000ms → speed 2x.
            id: 'c1', kind: 'clip', startMs: 0, endMs: 2000, source: 'recordings/a.mp4',
            sourceInMs: 0, sourceOutMs: 4000,
          }}
          handles={{ inHalf: 0, outHalf: 0 }}
        />,
      );
      expect(captured.video[0].playbackRate).toBe(2);
      // startFrom = round(0/1000*30) - 0 = 0; durationInFrames = round(2000/1000*30) = 60.
      // endAt = startFrom + durationInFrames = 60 (NOT round(4000/1000*30) = 120 — that
      // would keep the Sequence mounted 60 frames PAST the timeline slot's end).
      expect(captured.video[0].startFrom).toBe(0);
      expect(captured.video[0].endAt).toBe(60);
    });

    it('passes a rate < 1 for slow motion (timeline span bigger than the source span)', () => {
      render(
        <SegmentMedia
          item={{
            // Timeline span 4000ms, source span 2000ms → 0.5x.
            id: 'c1', kind: 'broll', startMs: 0, endMs: 4000, source: 'broll/a.mp4',
            sourceInMs: 0, sourceOutMs: 2000,
          }}
          handles={{ inHalf: 0, outHalf: 0 }}
        />,
      );
      expect(captured.video[0].playbackRate).toBe(0.5);
    });

    it('applies to broll and clip identically (both are OffthreadVideo-rendered)', () => {
      render(
        <SegmentMedia
          item={{
            id: 'b1', kind: 'broll', startMs: 0, endMs: 4000, source: 'broll/a.mp4',
            sourceInMs: 0, sourceOutMs: 2000,
          }}
          handles={{ inHalf: 0, outHalf: 0 }}
        />,
      );
      expect(captured.video[0].playbackRate).toBe(0.5);
    });

    // ---- the handle is a TIMELINE quantity, `startFrom` a SOURCE one --------
    // `handles.inHalf` counts TIMELINE frames (video-track-layout.ts: `seqFrom =
    // itemStartF - inHalf`, `seqDuration = normalDuration + inHalf + outHalf` —
    // all timeline). `startFrom` is a SOURCE frame position: measured against
    // Remotion 4.0.425 with a frame-numbered ramp video, the media frame shown
    // at outer offset k is `startFrom + k * playbackRate`, so `startFrom` is
    // NOT scaled by the rate. Subtracting the raw handle therefore only lands
    // right at 1x; every case below has a speed, a real `sourceInMs` AND a real
    // handle, which is the combination the rest of this file never exercises.
    //
    // The invariant each case pins: at the item's NOMINAL in-point (outer
    // offset k = inHalf) the media must show exactly `sourceInMs`.
    describe('borrowed handles at a speed other than 1x', () => {
      it('converts the in-handle to source frames on a slowed clip', () => {
        render(
          <SegmentMedia
            item={{
              // Timeline span 4000ms, source span 2000ms → 0.5x.
              id: 'b1', kind: 'broll', startMs: 0, endMs: 4000, source: 'broll/a.mp4',
              sourceInMs: 2000, sourceOutMs: 4000,
            }}
            handles={{ inHalf: 30, outHalf: 12 }}
          />,
        );
        expect(captured.video[0].playbackRate).toBe(0.5);
        // sourceInF = 60; the 30 borrowed TIMELINE frames consume 30 * 0.5 = 15
        // SOURCE frames, so the element starts 15 source frames early, not 30.
        expect(captured.video[0].startFrom).toBe(45);
        // 45 + 30 * 0.5 === 60 === sourceInF at the nominal cut.
        // durationInFrames = 120 + 30 + 12 = 162 outer frames mounted.
        expect(captured.video[0].endAt).toBe(45 + 162);
      });

      it('converts the in-handle to source frames on a sped-up clip', () => {
        render(
          <SegmentMedia
            item={{
              // Timeline span 2000ms, source span 4000ms → 2x.
              id: 'c1', kind: 'clip', startMs: 1000, endMs: 3000, source: 'recordings/a.mp4',
              sourceInMs: 3000, sourceOutMs: 7000,
            }}
            handles={{ inHalf: 6, outHalf: 4 }}
          />,
        );
        expect(captured.video[0].playbackRate).toBe(2);
        // sourceInF = 90; 6 borrowed timeline frames = 12 source frames.
        expect(captured.video[0].startFrom).toBe(78);
        // 78 + 6 * 2 === 90 at the nominal cut, and 78 + 66 * 2 === 210 ===
        // sourceOutF at the nominal out-point. durationInFrames = 60 + 6 + 4.
        expect(captured.video[0].endAt).toBe(78 + 70);
      });

      it('spends only what the borrow costs instead of underflowing to the file start', () => {
        render(
          <SegmentMedia
            item={{
              // 0.5x again, but with only 700ms of material before the in-point.
              id: 'b1', kind: 'broll', startMs: 0, endMs: 4000, source: 'broll/a.mp4',
              sourceInMs: 700, sourceOutMs: 2700,
            }}
            handles={{ inHalf: 30, outHalf: 0 }}
          />,
        );
        // sourceInF = 21, and the borrow costs 15 source frames — affordable.
        // Subtracting the raw 30 would go negative and clamp to 0, silently
        // shortening the borrow and leaving the media 700ms early for the whole
        // clip. `handleRoomFrames` already reports this head in TIMELINE frames
        // (700 / 0.5 = 1400ms = 42), which is exactly what 30 is measured
        // against — the budget was already right; only the spending was not.
        expect(captured.video[0].startFrom).toBe(6);
      });
    });

    it('never applies to a photo — no source span exists to ratio against', () => {
      render(
        <SegmentMedia
          item={{ id: 'p1', kind: 'photo', startMs: 0, endMs: 3000, source: 'photos/a.jpg' }}
          handles={{ inHalf: 0, outHalf: 0 }}
        />,
      );
      expect(captured.img[0].src).toBe('photos/a.jpg');
      expect(captured.video).toHaveLength(0);
    });
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
