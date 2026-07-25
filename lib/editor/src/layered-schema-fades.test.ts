import { describe, it, expect } from 'vitest';
import { AudioItemSchema, MusicLayerSchema } from '@video-toolkit/lib/reel-config-base/layered-schema';

describe('fade fields', () => {
  const baseAudio = { id: 'a1', startMs: 0, endMs: 2000, source: 'x.mp4', sourceInMs: 0 };

  it('audio item accepts fadeInMs/fadeOutMs', () => {
    const r = AudioItemSchema.parse({ ...baseAudio, fadeInMs: 250, fadeOutMs: 500 });
    expect(r.fadeInMs).toBe(250);
    expect(r.fadeOutMs).toBe(500);
  });

  it('audio item fades are optional', () => {
    const r = AudioItemSchema.parse(baseAudio);
    expect(r.fadeInMs).toBeUndefined();
  });

  it('rejects negative fades', () => {
    expect(() => AudioItemSchema.parse({ ...baseAudio, fadeOutMs: -1 })).toThrow();
  });

  it('music layer accepts fades', () => {
    const r = MusicLayerSchema.parse({ source: 'm.mp3', fadeInMs: 0, fadeOutMs: 1500 });
    expect(r.fadeOutMs).toBe(1500);
  });
});
