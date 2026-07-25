import { describe, expect, it } from 'vitest';
import { framesForReel } from '../host/host-duration';
import type { LayeredReel } from '../../reel-config-base/layered-schema';

const reel = (over: Partial<LayeredReel['tracks']> & { totalDurationMs?: number } = {}): LayeredReel =>
  ({
    version: 'layered-1',
    meta: { topic: 'T', totalDurationMs: over.totalDurationMs ?? 6000 },
    tracks: {
      video: over.video ?? [],
      audio: over.audio ?? [],
      music: { baseVolumeDb: 0 },
      overlays: over.overlays ?? [],
      brand: over.brand ?? [],
    },
  }) as unknown as LayeredReel;

describe('framesForReel', () => {
  it('uses meta.totalDurationMs when nothing extends past it', () => {
    expect(framesForReel(reel({ totalDurationMs: 6000 }), 30)).toBe(180);
  });

  it('extends to the last item end on ANY track', () => {
    // Absolute placement: dragging a clip past the derived total must lengthen
    // the editor timeline, or the item becomes invisible and unrecoverable.
    const r = reel({ totalDurationMs: 6000, video: [{ id: 'v', endMs: 9000 } as any] });
    expect(framesForReel(r, 30)).toBe(270);
  });

  it('considers overlays, audio and brand items too', () => {
    expect(framesForReel(reel({ totalDurationMs: 1000, overlays: [{ id: 'o', endMs: 4000 } as any] }), 30)).toBe(120);
    expect(framesForReel(reel({ totalDurationMs: 1000, audio: [{ id: 'a', endMs: 5000 } as any] }), 30)).toBe(150);
    expect(framesForReel(reel({ totalDurationMs: 1000, brand: [{ id: 'b', endMs: 3000 } as any] }), 30)).toBe(90);
  });

  it('never returns fewer than 60 frames', () => {
    expect(framesForReel(reel({ totalDurationMs: 0 }), 30)).toBe(60);
  });
});
