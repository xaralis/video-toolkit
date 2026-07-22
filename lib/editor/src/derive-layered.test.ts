import { describe, it, expect } from 'vitest';
import { deriveLayered } from '@video-toolkit/lib/reel-config-base/derive-layered';
import { LayeredReelSchema } from '@video-toolkit/lib/reel-config-base/layered-schema';

const OLD = {
  topic: 'Lepší náměstí Republiky',
  chevron: 'NÁMĚSTÍ REPUBLIKY',
  audio: { music: 'audio/bg.mp3', musicVolumeDb: -6 },
  segments: [
    { id: 'seg-001', type: 'clip', source: 'a.mp4', trimIn: 0.4, trimOut: 5.75, audioMode: 'voice',
      overlays: [{ kind: 'title', text: 'Ještě lepší {lime:náměstí Republiky}.', appearAt: 0, durationMs: 3000 }] },
    { id: 'seg-002', type: 'broll', source: 'b.mp4', trimIn: 0, trimOut: 4, audioMode: 'inherit-from-clip',
      audioSource: 'a.mp4', audioStartSec: 5.75, aiGenerated: true },
    { id: 'seg-008', type: 'outro' },
  ],
};
const OPTS = { fps: 30, outroFrames: 180 };

describe('deriveLayered', () => {
  it('produces a schema-valid layered reel', () => {
    expect(() => LayeredReelSchema.parse(deriveLayered(OLD, OPTS))).not.toThrow();
  });
  it('lays video items sequentially with absolute ms and correct trim windows', () => {
    const r = deriveLayered(OLD, OPTS);
    const [v1, v2, outro] = r.tracks.video;
    // clip dur = round(5.75*30)-round(0.4*30)=173-12=161 frames → 161/30*1000 = 5366.67 → 5367ms
    expect(v1).toMatchObject({ id: 'seg-001', kind: 'clip', startMs: 0, sourceInMs: 400, sourceOutMs: 5750 });
    expect(v1.endMs).toBe(5367);
    expect(v2.startMs).toBe(5367);            // broll starts where clip ended
    expect(v2.musicBoostDb).toBe(6);          // broll boost
    expect(outro.musicBoostDb).toBe(10);      // outro boost
  });
  it('derives audio items: voice→own, inherit→audioSource+startSec, extend/silent handled', () => {
    const r = deriveLayered(OLD, OPTS);
    const clipAudio = r.tracks.audio.find((a) => a.id === 'seg-001-audio');
    const brollAudio = r.tracks.audio.find((a) => a.id === 'seg-002-audio');
    expect(clipAudio).toMatchObject({ source: 'a.mp4', sourceInMs: 400 });
    expect(brollAudio).toMatchObject({ source: 'a.mp4', sourceInMs: 5750 });
  });
  it('places overlays at absolute time = clip start + appearAt', () => {
    const r = deriveLayered(OLD, OPTS);
    const title = r.tracks.overlays.find((o) => o.content.kind === 'title');
    expect(title).toMatchObject({ startMs: 0, endMs: 3000 });
    expect(title.anchorVideoId).toBe('seg-001');
  });
  it('emits chevron + full-span brand layers + music base', () => {
    const r = deriveLayered(OLD, OPTS);
    expect(r.tracks.overlays.some((o) => o.content.kind === 'chevron')).toBe(true);
    expect(r.tracks.brand.map((b) => b.kind).sort()).toEqual(['disclaimer', 'watermark']);
    expect(r.tracks.brand.every((b) => b.endMs === r.meta.totalDurationMs)).toBe(true);
    expect(r.tracks.music).toMatchObject({ source: 'audio/bg.mp3', baseVolumeDb: -6 });
  });
});
