import { describe, it, expect } from 'vitest';
import { contentEndMs, withDerivedBrandSpan } from '@video-toolkit/lib/reel-config-base/content-end';
import type { LayeredReel, VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

const clip = (id: string, startMs: number, endMs: number, extra: Partial<VideoItem> = {}): VideoItem =>
  ({ id, kind: 'clip', startMs, endMs, source: `${id}.mp4`, sourceInMs: 0, sourceOutMs: endMs - startMs, ...extra }) as VideoItem;

describe('contentEndMs', () => {
  it('is the last item end when there is no outro', () => {
    expect(contentEndMs([clip('v1', 0, 5000), clip('v2', 5000, 12000)], 30)).toBe(12000);
  });

  it('ignores a trailing outro', () => {
    const outro = { id: 'o', kind: 'outro', startMs: 12000, endMs: 15000 } as unknown as VideoItem;
    expect(contentEndMs([clip('v1', 0, 12000), outro], 30)).toBe(12000);
  });

  it('subtracts the last content item transitionOut overlap', () => {
    const v = clip('v1', 0, 12000, { transitionOut: { kind: 'fade', frames: 15 } } as Partial<VideoItem>);
    const outro = { id: 'o', kind: 'outro', startMs: 12000, endMs: 15000 } as unknown as VideoItem;
    // 15 frames @ 30fps = 500ms
    expect(contentEndMs([v, outro], 30)).toBe(11500);
  });

  it('returns undefined when every item is an outro', () => {
    const outro = { id: 'o', kind: 'outro', startMs: 0, endMs: 3000 } as unknown as VideoItem;
    expect(contentEndMs([outro], 30)).toBeUndefined();
  });

  it('returns undefined for an empty track', () => {
    expect(contentEndMs([], 30)).toBeUndefined();
  });

  it('rounds a non-integral frames->ms conversion (pins Math.round)', () => {
    // 10 frames @ 30fps = 333.333...ms -> rounds to 333
    const v = clip('v1', 0, 12000, { transitionOut: { kind: 'fade', frames: 10 } } as Partial<VideoItem>);
    const outro = { id: 'o', kind: 'outro', startMs: 12000, endMs: 15000 } as unknown as VideoItem;
    expect(contentEndMs([v, outro], 30)).toBe(11667);
  });

  it('rounds a non-integral frames->ms conversion the other way too (pins against Math.floor)', () => {
    // 20 frames @ 30fps = 666.666...ms -> rounds to 667; Math.floor would give 666,
    // yielding 11334 instead of the correct 11333.
    const v = clip('v1', 0, 12000, { transitionOut: { kind: 'fade', frames: 20 } } as Partial<VideoItem>);
    const outro = { id: 'o', kind: 'outro', startMs: 12000, endMs: 15000 } as unknown as VideoItem;
    expect(contentEndMs([v, outro], 30)).toBe(11333);
  });

  it('scans backwards and returns the LAST non-outro item, not the first', () => {
    const outro = { id: 'o', kind: 'outro', startMs: 5000, endMs: 8000 } as unknown as VideoItem;
    expect(contentEndMs([clip('v1', 0, 5000), outro, clip('v2', 8000, 12000)], 30)).toBe(12000);
  });
});

function reel(tracks: Partial<LayeredReel['tracks']> = {}, totalMs = 15000): LayeredReel {
  return {
    version: 'layered-1',
    meta: { topic: 'T', totalDurationMs: totalMs },
    tracks: {
      video: [
        clip('v1', 0, 12000),
        { id: 'o', kind: 'outro', startMs: 12000, endMs: 15000 } as unknown as VideoItem,
      ],
      audio: [],
      music: { baseVolumeDb: -8 },
      overlays: [],
      brand: [
        { id: 'brand-watermark', kind: 'watermark', startMs: 0, endMs: 12000 },
        { id: 'brand-disclaimer', kind: 'disclaimer', startMs: 0, endMs: 12000 },
      ],
      ...tracks,
    },
  };
}

describe('withDerivedBrandSpan', () => {
  it('returns the same object when the brand span is already correct', () => {
    const r = reel();
    expect(withDerivedBrandSpan(r, 30)).toBe(r);
  });

  it('re-pins a stale brand end to the content end', () => {
    const r = reel({
      brand: [
        { id: 'brand-watermark', kind: 'watermark', startMs: 0, endMs: 34000 },
        { id: 'brand-disclaimer', kind: 'disclaimer', startMs: 0, endMs: 41667 },
      ],
    });
    const next = withDerivedBrandSpan(r, 30);
    expect(next.tracks.brand.map((b) => b.endMs)).toEqual([12000, 12000]);
  });

  it('overrides a deliberately shorter brand span — the lane is derived, not authored', () => {
    const r = reel({ brand: [{ id: 'brand-watermark', kind: 'watermark', startMs: 0, endMs: 3000 }] });
    expect(withDerivedBrandSpan(r, 30).tracks.brand[0].endMs).toBe(12000);
  });

  it('forces a non-zero brand start back to 0', () => {
    const r = reel({ brand: [{ id: 'brand-watermark', kind: 'watermark', startMs: 2000, endMs: 12000 }] });
    const b = withDerivedBrandSpan(r, 30).tracks.brand[0];
    expect([b.startMs, b.endMs]).toEqual([0, 12000]);
  });

  it('shrinks the brand span when the last content clip is trimmed', () => {
    const r = reel({
      video: [
        clip('v1', 0, 9000),
        { id: 'o', kind: 'outro', startMs: 9000, endMs: 12000 } as unknown as VideoItem,
      ],
    });
    expect(withDerivedBrandSpan(r, 30).tracks.brand[0].endMs).toBe(9000);
  });

  it('falls back to the computed total when the reel is all outro', () => {
    const r = reel({
      video: [{ id: 'o', kind: 'outro', startMs: 0, endMs: 3000 } as unknown as VideoItem],
      brand: [{ id: 'brand-watermark', kind: 'watermark', startMs: 0, endMs: 99000 }],
    });
    expect(withDerivedBrandSpan(r, 30).tracks.brand[0].endMs).toBe(3000);
  });

  it('threads the caller-supplied fps into the transitionOut overlap, not a hard-coded 30', () => {
    // 15 frames @ 25fps = 600ms (at 30fps it would be 500ms) -> content end 11400,
    // strictly short of the raw clip end (12000). A hard-coded 30 would give 11500.
    const r = reel({
      video: [
        clip('v1', 0, 12000, { transitionOut: { kind: 'fade', frames: 15 } } as Partial<VideoItem>),
        { id: 'o', kind: 'outro', startMs: 12000, endMs: 15000 } as unknown as VideoItem,
      ],
    });
    const next = withDerivedBrandSpan(r, 25);
    expect(next.tracks.brand[0].endMs).toBe(11400);
    expect(next.tracks.brand[0].endMs).toBeLessThan(12000);
  });

  it('preserves every other field on the brand item', () => {
    const r = reel({ brand: [{ id: 'brand-watermark', kind: 'watermark', startMs: 0, endMs: 1, props: { displayMode: 'corner' } }] });
    expect(withDerivedBrandSpan(r, 30).tracks.brand[0].props).toEqual({ displayMode: 'corner' });
  });
});
