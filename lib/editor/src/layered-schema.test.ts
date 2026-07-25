import { describe, it, expect } from 'vitest';
import { LayeredReelSchema } from '@video-toolkit/lib/reel-config-base/layered-schema';

describe('LayeredReelSchema', () => {
  it('accepts a minimal valid layered reel', () => {
    const reel = {
      version: 'layered-1',
      meta: { topic: 'X', totalDurationMs: 5000 },
      tracks: {
        video: [{ id: 'v1', kind: 'clip', startMs: 0, endMs: 3000, source: 'a.mp4', sourceInMs: 400, sourceOutMs: 3400 }],
        audio: [{ id: 'a1', startMs: 0, endMs: 3000, source: 'a.mp4', sourceInMs: 400 }],
        music: { source: 'audio/bg.mp3', baseVolumeDb: -6 },
        overlays: [{ id: 'o1', startMs: 0, endMs: 3000, content: { kind: 'title', text: 'Hi' } }],
        brand: [{ id: 'b1', kind: 'watermark', startMs: 0, endMs: 5000 }],
      },
    };
    expect(LayeredReelSchema.parse(reel)).toBeTruthy();
  });

  it('rejects a negative startMs', () => {
    expect(() => LayeredReelSchema.parse({
      version: 'layered-1', meta: { topic: 'X', totalDurationMs: 1 },
      tracks: { video: [{ id: 'v', kind: 'clip', startMs: -1, endMs: 1 }], audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [] },
    })).toThrow();
  });
});
