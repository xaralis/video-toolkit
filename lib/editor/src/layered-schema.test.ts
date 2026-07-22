import { describe, it, expect } from 'vitest';
import { LayeredReelSchema, MusicLayerSchema, VideoItemSchema, AudioItemSchema, EffectSchema } from '@video-toolkit/lib/reel-config-base/layered-schema';

describe('LayeredReelSchema', () => {
  it('accepts a minimal valid layered reel', () => {
    const reel = {
      version: 'layered-1',
      meta: { topic: 'X', totalDurationMs: 5000 },
      tracks: {
        video: [{
          id: 'v1', kind: 'clip', startMs: 0, endMs: 3000, source: 'a.mp4', sourceInMs: 400, sourceOutMs: 3400,
          effects: [
            { type: 'ken-burns', fromX: 0.35, toX: 0.62, fromScale: 1.05, toScale: 1.12 },
            { type: 'blend', to: 'b2.mp4', direction: 'tl-br', startPct: 14, endPct: 38, softness: 45 },
          ],
          audioMode: 'inherit-from-clip',
        }],
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

  it('applies the MusicLayerSchema baseVolumeDb default of -8 when omitted', () => {
    const parsed = MusicLayerSchema.parse({});
    expect(parsed.baseVolumeDb).toBe(-8);
  });

  it('rejects a video item with an invalid kind', () => {
    expect(() =>
      VideoItemSchema.parse({ id: 'v', kind: 'bogus', startMs: 0, endMs: 1 }),
    ).toThrow();
  });

  it('rejects an audio item missing the required source field', () => {
    expect(() =>
      AudioItemSchema.parse({ id: 'a', startMs: 0, endMs: 1, sourceInMs: 0 }),
    ).toThrow();
  });

  it('rejects an effect without a type', () => {
    expect(() => EffectSchema.parse({ fromX: 0.5 })).toThrow();
  });
});

describe('VideoItemSchema — container contract', () => {
  const base = { id: 'x', startMs: 0, endMs: 1000 };
  it('parses each kind', () => {
    expect(() => VideoItemSchema.parse({ ...base, kind: 'clip', source: 'a.mp4', sourceInMs: 0, sourceOutMs: 1000 })).not.toThrow();
    expect(() => VideoItemSchema.parse({ ...base, kind: 'broll', source: 'b.mp4', sourceInMs: 0, sourceOutMs: 1000, aiGenerated: true })).not.toThrow();
    expect(() => VideoItemSchema.parse({ ...base, kind: 'multi-clip', layout: 'split-h', sources: [{ source: 'a', sourceInMs: 0, sourceOutMs: 100, zoom: 3 }] })).not.toThrow();
    expect(() => VideoItemSchema.parse({ ...base, kind: 'card', cardKind: 'claim-plate' })).not.toThrow();
    expect(() => VideoItemSchema.parse({ ...base, kind: 'outro' })).not.toThrow();
  });
  it('strips/rejects audioMode — it is not part of the contract', () => {
    const parsed = VideoItemSchema.parse({ ...base, kind: 'clip', source: 'a', sourceInMs: 0, sourceOutMs: 1, audioMode: 'voice' });
    expect('audioMode' in parsed).toBe(false); // unknown key stripped by zod
  });
  it('a clip cannot carry multi-clip-only fields (contract is per-kind)', () => {
    const parsed = VideoItemSchema.parse({ ...base, kind: 'clip', source: 'a', sourceInMs: 0, sourceOutMs: 1, layout: 'split-h' } as never);
    expect('layout' in parsed).toBe(false);
  });
});
