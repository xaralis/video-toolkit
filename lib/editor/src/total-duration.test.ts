import { describe, it, expect } from 'vitest';
import { computeTotalDurationMs, withTotalDuration } from '@video-toolkit/lib/reel-config-base/total-duration';
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';

function reelWith(overrides: Partial<LayeredReel['tracks']> = {}, totalMs = 10000): LayeredReel {
  return {
    version: 'layered-1',
    meta: { topic: 'T', totalDurationMs: totalMs },
    tracks: {
      video: [
        { id: 'v1', kind: 'clip', startMs: 0, endMs: 5000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 5000 },
        { id: 'v2', kind: 'clip', startMs: 5000, endMs: 10000, source: 'b.mp4', sourceInMs: 0, sourceOutMs: 5000 },
      ],
      audio: [],
      music: { source: 'audio/bg.mp3', baseVolumeDb: -8 },
      overlays: [],
      brand: [{ id: 'wm', kind: 'watermark', startMs: 0, endMs: 10000 }],
      ...overrides,
    },
  };
}

describe('computeTotalDurationMs', () => {
  it('is the max end across video, overlays and audio', () => {
    const reel = reelWith({
      overlays: [{ id: 'o1', startMs: 8000, endMs: 12000, content: { kind: 'text' } }],
      audio: [{ id: 'a1', startMs: 0, endMs: 11000, source: 'a.mp4', sourceInMs: 0 }],
    });
    expect(computeTotalDurationMs(reel)).toBe(12000);
  });

  it('counts the music end only when explicitly set', () => {
    expect(computeTotalDurationMs(reelWith())).toBe(10000);
    expect(computeTotalDurationMs(reelWith({ music: { source: 'audio/bg.mp3', baseVolumeDb: -8, endMs: 14000 } }))).toBe(14000);
    // a trimmed music bed SHORTER than content does not shrink the total below content
    expect(computeTotalDurationMs(reelWith({ music: { source: 'audio/bg.mp3', baseVolumeDb: -8, endMs: 4000 } }))).toBe(10000);
  });

  it('ignores music.endMs without a source, and excludes brand items', () => {
    const reel = reelWith({ music: { baseVolumeDb: -8, endMs: 20000 }, brand: [{ id: 'wm', kind: 'watermark', startMs: 0, endMs: 99000 }] });
    expect(computeTotalDurationMs(reel)).toBe(10000);
  });
});

describe('withTotalDuration', () => {
  it('returns the same object when the total is unchanged', () => {
    const reel = reelWith();
    expect(withTotalDuration(reel)).toBe(reel);
  });

  it('updates meta and leaves brand items alone (their span is derived elsewhere)', () => {
    const reel = reelWith({
      video: [{ id: 'v1', kind: 'clip', startMs: 0, endMs: 8000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 8000 }],
    });
    const next = withTotalDuration(reel);
    expect(next.meta.totalDurationMs).toBe(8000);
    expect(next.tracks.brand[0].endMs).toBe(10000);
    // Only the total moved — tracks itself must be the SAME object, not a copy.
    expect(next.tracks).toBe(reel.tracks);
  });

  it('extends the total when a music bed reaches past the content', () => {
    const reel = reelWith({ music: { source: 'audio/bg.mp3', baseVolumeDb: -8, endMs: 13000 } });
    const next = withTotalDuration(reel);
    expect(next.meta.totalDurationMs).toBe(13000);
    expect(next.tracks.brand[0].endMs).toBe(10000);
  });
});
