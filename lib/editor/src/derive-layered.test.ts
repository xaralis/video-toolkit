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
      audioSource: 'a.mp4', audioStartSec: 5.75, aiGenerated: true,
      kenBurns: { fromX: 0.35, toX: 0.62 }, blendTo: 'b2.mp4', blend: { direction: 'tl-br', startPct: 10, endPct: 40 },
      transitionOut: { kind: 'dissolve', frames: 12 } },
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

// Covers the multi-clip derivation path (previously untested — the branch that
// makes real client projects like pp-05 risky to flip). A split-screen segment
// with per-source trim + zoom, a fixed durationMs, a silent audio mode, and a
// single overlay. Mirrors pp-05's real seg-001 shape (incl. `zoom` on the
// second source, which the target schema supports and must not be dropped).
const MULTI = {
  topic: 'Multi-clip test',
  segments: [
    {
      id: 'seg-mc',
      type: 'multi-clip',
      layout: 'split-h',
      sources: [
        { source: 'a.MP4', trimIn: 3, trimOut: 7.5 },
        { source: 'b.MP4', trimIn: 0, trimOut: 5.4, zoom: 3 },
      ],
      durationMs: 4100,
      audioMode: 'silent',
      overlay: { kind: 'title', text: 'Spojili jsme {lime:síly}.', appearAt: 1500, durationMs: 3000 },
    },
    { id: 'seg-z', type: 'outro' },
  ],
};

// Covers Task 2: multi-clip audio isolated onto the audio track, like broll.
const MULTI_FIRST = {
  topic: 'Multi-clip first',
  segments: [
    { id: 'seg-mf', type: 'multi-clip', layout: 'split-h', durationMs: 3000, audioMode: 'first',
      sources: [ { source: 'a.MP4', trimIn: 2, trimOut: 5 }, { source: 'b.MP4', trimIn: 0, trimOut: 3 } ] },
    { id: 'seg-z', type: 'outro' },
  ],
};
const MULTI_MIX = {
  topic: 'Multi-clip mix',
  segments: [
    { id: 'seg-mm', type: 'multi-clip', layout: 'quad', durationMs: 3000, audioMode: 'mix',
      sources: [ { source: 'a.MP4', trimIn: 1, trimOut: 4 }, { source: 'b.MP4', trimIn: 0, trimOut: 3 } ] },
    { id: 'seg-z', type: 'outro' },
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
    expect(v2.musicBoostDb).toBe(0);          // inherit-from-clip broll: narration continues → no boost
    expect(outro.musicBoostDb).toBe(10);      // outro boost
  });
  it('musicBoostDb is audioMode-aware — boost only when no narration under the segment (matches old classifyFrame)', () => {
    const r = deriveLayered(OLD, OPTS);
    const [clip, broll, outro] = r.tracks.video;
    expect(clip.musicBoostDb).toBe(0); // voice clip
    expect(broll.musicBoostDb).toBe(0); // inherit-from-clip broll → voice, no boost
    expect(outro.musicBoostDb).toBe(10);
    const e = deriveLayered(EXT, OPTS);
    const [silentClip, extBroll1, voiceClip, extBroll2] = e.tracks.video;
    expect(silentClip.musicBoostDb).toBe(6); // silent clip fills the gap → +6
    expect(voiceClip.musicBoostDb).toBe(0); // voice clip → no boost
    expect(extBroll1.musicBoostDb).toBe(6); // extend-previous broll (not inherit) → +6, matches old
    expect(extBroll2.musicBoostDb).toBe(6);
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
  it('carries kenBurns/blend as generic effects entries + audioMode passthrough', () => {
    const r = deriveLayered(OLD, OPTS);
    const v2 = r.tracks.video.find((v) => v.id === 'seg-002')!;
    const kenBurns = v2.effects?.find((e) => e.type === 'ken-burns');
    expect(kenBurns).toMatchObject({ fromX: 0.35 });
    const blend = v2.effects?.find((e) => e.type === 'blend');
    expect(blend).toMatchObject({ to: 'b2.mp4', direction: 'tl-br' });
    expect('audioMode' in v2).toBe(false); // audioMode is not part of the layered VideoItem contract
  });
  it('places overlays at absolute time = clip start + appearAt', () => {
    const r = deriveLayered(OLD, OPTS);
    const title = r.tracks.overlays.find((o) => o.content.kind === 'title');
    expect(title).toMatchObject({ startMs: 0, endMs: 3000 });
    expect(title!.anchorVideoId).toBe('seg-001');
  });
  it('emits chevron + brand layers spanning content (not the full reel) + music base', () => {
    const r = deriveLayered(OLD, OPTS);
    expect(r.tracks.overlays.some((o) => o.content.kind === 'chevron')).toBe(true);
    expect(r.tracks.brand.map((b) => b.kind).sort()).toEqual(['disclaimer', 'watermark']);
    expect(r.tracks.music).toMatchObject({ source: 'audio/bg.mp3', baseVolumeDb: -6 });
  });
  it('brand layers end at content-end (last non-outro item end minus its transitionOut overlap), excluding the outro', () => {
    const r = deriveLayered(OLD, OPTS);
    // last non-outro item is seg-002 (broll), which carries transitionOut: { frames: 12 }
    const seg002 = r.tracks.video.find((v) => v.id === 'seg-002')!;
    const expectedEndMs = seg002.endMs - Math.round((12 / OPTS.fps) * 1000); // -400
    expect(expectedEndMs).toBe(seg002.endMs - 400);
    for (const b of r.tracks.brand) {
      expect(b.startMs).toBe(0);
      expect(b.endMs).toBe(expectedEndMs);
      expect(b.endMs).toBeLessThan(r.meta.totalDurationMs); // outro excluded
    }
  });

  describe('multi-clip segments', () => {
    it('produces a schema-valid layered reel', () => {
      expect(() => LayeredReelSchema.parse(deriveLayered(MULTI, OPTS))).not.toThrow();
    });
    it('defaults a missing layout to split-h so derivation stays schema-valid (layout is required on the union)', () => {
      const noLayout = {
        topic: 'no layout',
        segments: [
          { id: 'seg-nl', type: 'multi-clip', durationMs: 2000, audioMode: 'silent',
            sources: [{ source: 'a.MP4', trimIn: 0, trimOut: 2 }] },
          { id: 'seg-z', type: 'outro' },
        ],
      };
      const r = deriveLayered(noLayout, OPTS);
      const item = r.tracks.video.find((v) => v.id === 'seg-nl')!;
      if (item.kind !== 'multi-clip') throw new Error('expected a multi-clip item');
      expect(item.layout).toBe('split-h');
      expect(() => LayeredReelSchema.parse(r)).not.toThrow();
    });
    it('derives a multi-clip video item: layout + duration-driven span', () => {
      const r = deriveLayered(MULTI, OPTS);
      const mc = r.tracks.video.find((v) => v.id === 'seg-mc')!;
      expect(mc.kind).toBe('multi-clip');
      if (mc.kind !== 'multi-clip') throw new Error('expected multi-clip');
      expect(mc.layout).toBe('split-h');
      expect(mc.startMs).toBe(0);
      // durationMs 4100 → round(4100/1000*30)=123 frames → 123/30*1000 = 4100ms
      expect(mc.endMs).toBe(4100);
    });
    it('maps every source (trim windows to ms) and carries per-source zoom', () => {
      const r = deriveLayered(MULTI, OPTS);
      const mc = r.tracks.video.find((v) => v.id === 'seg-mc')!;
      if (mc.kind !== 'multi-clip') throw new Error('expected multi-clip');
      expect(mc.sources).toHaveLength(2);
      expect(mc.sources[0]).toMatchObject({ source: 'a.MP4', sourceInMs: 3000, sourceOutMs: 7500 });
      // regression guard: pp-05's split-screen zoom on the 2nd source must survive derivation
      expect(mc.sources[1]).toMatchObject({ source: 'b.MP4', sourceInMs: 0, sourceOutMs: 5400, zoom: 3 });
    });
    it('silent multi-clip fills the music gap (+6) and emits no audio item', () => {
      const r = deriveLayered(MULTI, OPTS);
      const mc = r.tracks.video.find((v) => v.id === 'seg-mc')!;
      expect(mc.musicBoostDb).toBe(6); // silent → boost
      expect(r.tracks.audio).toHaveLength(0); // a silent multi-clip emits no audio item (first/mix do — see below)
    });
    it('attaches the single overlay at clip start + appearAt', () => {
      const r = deriveLayered(MULTI, OPTS);
      const title = r.tracks.overlays.find((o) => o.content.kind === 'title');
      expect(title).toMatchObject({ startMs: 1500, endMs: 4500 });
      expect(title!.anchorVideoId).toBe('seg-mc');
    });
    it("multi-clip 'first' → one audio item bound to the clip (sources[0])", () => {
      const r = deriveLayered(MULTI_FIRST, OPTS);
      expect(r.tracks.audio).toHaveLength(1);
      expect(r.tracks.audio[0]).toMatchObject({
        id: 'seg-mf-audio', source: 'a.MP4', sourceInMs: 2000, startMs: 0, endMs: 3000, followsVideoId: 'seg-mf',
      });
    });
    it("multi-clip 'mix' → one audio item per source, all bound to the clip", () => {
      const r = deriveLayered(MULTI_MIX, OPTS);
      expect(r.tracks.audio).toHaveLength(2);
      expect(r.tracks.audio.map((a) => a.id)).toEqual(['seg-mm-audio-0', 'seg-mm-audio-1']);
      expect(r.tracks.audio.every((a) => a.followsVideoId === 'seg-mm')).toBe(true);
      expect(r.tracks.audio[1]).toMatchObject({ source: 'b.MP4', sourceInMs: 0 });
    });
  });

  // A party-logos overlay carries its timing PER LOGO (each logo has its own
  // appearAt inside `logos[]`); the overlay container itself has no top-level
  // appearAt. It must default to segment start (offset 0), not derive NaN.
  const PARTY = {
    topic: 'Party logos',
    segments: [
      {
        id: 'seg-p',
        type: 'broll',
        source: 'br.mp4',
        trimIn: 0,
        trimOut: 5,
        audioMode: 'silent',
        overlay: {
          kind: 'party-logos',
          logos: [{ src: 'a.svg', appearAt: 0 }, { src: 'b.svg', appearAt: 1400 }],
          durationMs: 4800,
        },
      },
      { id: 'seg-z', type: 'outro' },
    ],
  };
  it('an overlay with no top-level appearAt defaults to segment start (no NaN)', () => {
    const r = deriveLayered(PARTY, OPTS);
    const logos = r.tracks.overlays.find((o) => o.content.kind === 'party-logos')!;
    expect(logos.startMs).toBe(0);
    expect(logos.endMs).toBe(4800);
    expect(Number.isNaN(logos.startMs)).toBe(false);
    expect(logos.anchorVideoId).toBe('seg-p');
  });

  // A photo segment (still image or AI i2v clip): authors `src` + durationMs,
  // is silent (no audio item, +6 music boost), Ken Burns rides on effects, and
  // its overlays[] land on the overlay track like a clip's.
  const PHOTO = {
    topic: 'Photo',
    audio: { music: 'audio/bg.mp3', musicVolumeDb: -8 },
    segments: [
      {
        id: 'seg-ph',
        type: 'photo',
        src: 'broll/sauna.mp4',
        durationMs: 4000,
        aiGenerated: true,
        kenBurns: { fromScale: 1, toScale: 1.1, fromX: 0.4, toX: 0.6 },
        overlays: [
          { kind: 'title', text: '{lime:Sauna}.', appearAt: 0, durationMs: 3000 },
          { kind: 'quote-pull', text: 'Co vy na to{teal:?}', placement: 'upper-center', appearAt: 1000, durationMs: 3000 },
        ],
        transitionOut: { kind: 'dissolve', frames: 12 },
      },
      { id: 'seg-z', type: 'outro' },
    ],
  };
  it('derives a photo item: source from src, silent (+6, no audio), ken-burns effect, overlays on track', () => {
    const r = deriveLayered(PHOTO, OPTS);
    const ph = r.tracks.video.find((v) => v.id === 'seg-ph')!;
    expect(ph.kind).toBe('photo');
    expect(ph).toMatchObject({ source: 'broll/sauna.mp4', startMs: 0, endMs: 4000, aiGenerated: true, musicBoostDb: 6 });
    expect(ph.effects?.some((e) => e.type === 'ken-burns')).toBe(true);
    expect(r.tracks.audio).toHaveLength(0); // silent — no audio item
    const anchored = r.tracks.overlays.filter((o) => o.anchorVideoId === 'seg-ph');
    expect(anchored.map((o) => o.content.kind).sort()).toEqual(['quote-pull', 'title']);
    expect(LayeredReelSchema.parse(r)).toBeTruthy();
  });
});
