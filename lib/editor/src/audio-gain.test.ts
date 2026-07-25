import { describe, it, expect } from 'vitest';
import { audioGainAt } from '@video-toolkit/lib/render/audio-gain';
import type { AudioItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

const fps = 30;
const item = (over: Partial<AudioItem> = {}): AudioItem => ({
  id: 'a1', startMs: 1000, endMs: 4000, source: 'x.mp4', sourceInMs: 0, ...over,
});

describe('audioGainAt', () => {
  it('defaults to unity gain (volumeDb 0)', () => {
    expect(audioGainAt(item(), 10, fps)).toBeCloseTo(1, 5);
  });
  it('applies volumeDb', () => {
    expect(audioGainAt(item({ volumeDb: -6 }), 10, fps)).toBeCloseTo(Math.pow(10, -6 / 20), 5);
  });
  it('mute wins', () => {
    expect(audioGainAt(item({ mute: true, volumeDb: 6 }), 10, fps)).toBe(0);
  });
  it('fadeIn ramps from local frame 0', () => {
    const a = item({ fadeInMs: 500 }); // 15 frames
    expect(audioGainAt(a, 0, fps)).toBe(0);
    expect(audioGainAt(a, 7.5, fps)).toBeCloseTo(0.5, 5);
    expect(audioGainAt(a, 15, fps)).toBeCloseTo(1, 5);
  });
  it('fadeOut ramps into the item end (span 3000ms = 90 frames)', () => {
    const a = item({ fadeOutMs: 1000 }); // fade frames 60..90
    expect(audioGainAt(a, 60, fps)).toBeCloseTo(1, 5);
    expect(audioGainAt(a, 75, fps)).toBeCloseTo(0.5, 5);
    expect(audioGainAt(a, 90, fps)).toBe(0);
  });
  it('overlapping fades multiply', () => {
    const a = item({ endMs: 2000, fadeInMs: 1000, fadeOutMs: 1000 }); // 30-frame span
    expect(audioGainAt(a, 15, fps)).toBeCloseTo(0.5 * 0.5, 5);
  });
});
