import { describe, it, expect } from 'vitest';
import { computeMusicEnvelope } from '@video-toolkit/lib/reel-config-base/music-envelope';
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';

const fps = 30;
const reel = (music: Partial<LayeredReel['tracks']['music']>): LayeredReel => ({
  version: 'layered-1',
  meta: { topic: 't', totalDurationMs: 10000 },
  tracks: {
    video: [
      { id: 'c1', kind: 'clip', startMs: 0, endMs: 7000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 7000 },
      { id: 'o1', kind: 'outro', startMs: 7000, endMs: 10000 },
    ],
    audio: [],
    music: { source: 'm.mp3', baseVolumeDb: -8, ...music },
    overlays: [],
    brand: [],
  },
});
const base = Math.pow(10, -8 / 20);

describe('music envelope outro handling', () => {
  // The outro is an ordinary time-windowed item; several are legitimate. The bed
  // must follow the LAST one to end, not the first found.
  const twoOutros: LayeredReel = {
    version: 'layered-1',
    meta: { topic: 't', totalDurationMs: 12000 },
    tracks: {
      video: [
        { id: 'o1', kind: 'outro', startMs: 2000, endMs: 5000 },
        { id: 'c1', kind: 'clip', startMs: 5000, endMs: 9000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 4000 },
        { id: 'o2', kind: 'outro', startMs: 9000, endMs: 12000 },
      ],
      audio: [],
      music: { source: 'm.mp3', baseVolumeDb: -8 },
      overlays: [],
      brand: [],
    },
  };

  it('follows the last outro to end, not the first', () => {
    const { volumeAt } = computeMusicEnvelope(twoOutros, { fps });
    // The first outro ends at f=150 — the bed must still be playing there.
    expect(volumeAt(150)).toBeCloseTo(base, 5);
    expect(volumeAt(200)).toBeCloseTo(base, 5);
    // Fade leads into the LAST outro's end (f=360), silence from there.
    expect(volumeAt(345)).toBeCloseTo(base * 0.5, 5);
    expect(volumeAt(360)).toBe(0);
  });
});

describe('music envelope fades from data', () => {
  it('default fadeOut is 1000ms anchored to outro end (legacy parity)', () => {
    const { volumeAt } = computeMusicEnvelope(reel({}), { fps });
    expect(volumeAt(0)).toBeCloseTo(base, 5); // steady
    expect(volumeAt(285)).toBeCloseTo(base * (1 - 15 / 30), 5); // mid-fade (outro ends f=300)
    expect(volumeAt(300)).toBe(0);
  });

  it('explicit endMs now FADES into the trim point instead of hard-cutting', () => {
    const { volumeAt } = computeMusicEnvelope(reel({ endMs: 5000 }), { fps }); // end f=150
    expect(volumeAt(100)).toBeCloseTo(base, 5);
    expect(volumeAt(135)).toBeCloseTo(base * (1 - 15 / 30), 5);
    expect(volumeAt(150)).toBe(0);
  });

  it('fadeOutMs from data overrides the 1000ms default', () => {
    const { volumeAt } = computeMusicEnvelope(reel({ fadeOutMs: 2000 }), { fps }); // fade f=240..300
    expect(volumeAt(240)).toBeCloseTo(base, 5);
    expect(volumeAt(270)).toBeCloseTo(base * 0.5, 5);
  });

  it('fadeOutMs: 0 restores the hard cut', () => {
    const { volumeAt } = computeMusicEnvelope(reel({ endMs: 5000, fadeOutMs: 0 }), { fps });
    expect(volumeAt(149)).toBeCloseTo(base, 5);
    expect(volumeAt(150)).toBe(0);
  });

  it('fadeInMs ramps up from frame 0', () => {
    const { volumeAt } = computeMusicEnvelope(reel({ fadeInMs: 1000 }), { fps });
    expect(volumeAt(0)).toBe(0);
    expect(volumeAt(15)).toBeCloseTo(base * 0.5, 5);
    expect(volumeAt(30)).toBeCloseTo(base, 5);
  });
});
