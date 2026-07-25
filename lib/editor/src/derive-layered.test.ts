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

// Covers the extend-previous and silent audio branches the OLD fixture above
// doesn't exercise: seg-a is a silent clip (no audio item), seg-b is an
// extend-previous broll with NO prior audio item (silent fallback, no
// crash), seg-c is a voice clip (produces an audio item), seg-d is an
// extend-previous broll that DOES have a prior item and mutates its endMs.
const EXT = {
  topic: 'Ext test',
  segments: [
    { id: 'seg-a', type: 'clip', source: 'x.mp4', trimIn: 0, trimOut: 2, audioMode: 'silent' },
    { id: 'seg-b', type: 'broll', source: 'y.mp4', trimIn: 0, trimOut: 2, audioMode: 'extend-previous' },
    { id: 'seg-c', type: 'clip', source: 'z.mp4', trimIn: 0, trimOut: 2, audioMode: 'voice' },
    { id: 'seg-d', type: 'broll', source: 'w.mp4', trimIn: 0, trimOut: 2, audioMode: 'extend-previous' },
  ],
};

// Covers FIX 3: audio source resolves to absent/empty → no phantom audio
// item with source: ''.
const NOSRC = {
  topic: 'No source test',
  segments: [
    { id: 'seg-e', type: 'clip', trimIn: 0, trimOut: 2, audioMode: 'voice' },
    { id: 'seg-f', type: 'broll', trimIn: 0, trimOut: 2, audioMode: 'inherit-from-clip' },
  ],
};

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
  it('derives audio items: voice→own audio item with followsVideoId', () => {
    const r = deriveLayered(OLD, OPTS);
    const clipAudio = r.tracks.audio.find((a) => a.id === 'seg-001-audio');
    expect(clipAudio).toMatchObject({ source: 'a.mp4', sourceInMs: 400, followsVideoId: 'seg-001' });
  });
  it('derives audio items: inherit-from-clip→audioSource+startSec with followsVideoId', () => {
    const r = deriveLayered(OLD, OPTS);
    const brollAudio = r.tracks.audio.find((a) => a.id === 'seg-002-audio');
    expect(brollAudio).toMatchObject({ source: 'a.mp4', sourceInMs: 5750, followsVideoId: 'seg-002' });
  });
  it('extend-previous: no new item is added; the previous audio item is extended to cover its span', () => {
    const r = deriveLayered(EXT, OPTS);
    // seg-a silent, seg-b extend-previous with no prior item (no-op, no crash),
    // seg-c voice → one audio item, seg-d extend-previous mutates it.
    expect(r.tracks.audio).toHaveLength(1);
    const [videoA, videoB, videoC, videoD] = r.tracks.video;
    const audio = r.tracks.audio[0];
    expect(audio.id).toBe('seg-c-audio');
    expect(audio.startMs).toBe(videoC.startMs);
    // extended by seg-d (extend-previous) to seg-d's own endMs
    expect(audio.endMs).toBe(videoD.endMs);
    expect(audio.endMs).not.toBe(videoC.endMs);
    // sanity on the segments that must NOT emit audio items
    expect(r.tracks.audio.some((a) => a.id === 'seg-a-audio')).toBe(false);
    expect(r.tracks.audio.some((a) => a.id === 'seg-b-audio')).toBe(false);
    expect(r.tracks.audio.some((a) => a.id === 'seg-d-audio')).toBe(false);
    // referenced to keep video items from being flagged unused, and to
    // document that seg-a/seg-b produce video items despite no audio.
    expect(videoA.id).toBe('seg-a');
    expect(videoB.id).toBe('seg-b');
  });
  it('silent clip audioMode emits no audio item', () => {
    const r = deriveLayered(EXT, OPTS);
    expect(r.tracks.audio.some((a) => a.id === 'seg-a-audio')).toBe(false);
  });
  it('empty/absent audio source (voice with no source, inherit with no audioSource) emits no phantom audio item', () => {
    const r = deriveLayered(NOSRC, OPTS);
    expect(r.tracks.audio).toHaveLength(0);
  });
  it('places overlays at absolute time = clip start + appearAt', () => {
    const r = deriveLayered(OLD, OPTS);
    const title = r.tracks.overlays.find((o) => o.content.kind === 'title');
    expect(title).toMatchObject({ startMs: 0, endMs: 3000 });
    expect(title!.anchorVideoId).toBe('seg-001');
  });
  it('emits chevron + full-span brand layers + music base', () => {
    const r = deriveLayered(OLD, OPTS);
    expect(r.tracks.overlays.some((o) => o.content.kind === 'chevron')).toBe(true);
    expect(r.tracks.brand.map((b) => b.kind).sort()).toEqual(['disclaimer', 'watermark']);
    expect(r.tracks.brand.every((b) => b.endMs === r.meta.totalDurationMs)).toBe(true);
    expect(r.tracks.music).toMatchObject({ source: 'audio/bg.mp3', baseVolumeDb: -6 });
  });
});
