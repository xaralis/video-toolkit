import { describe, it, expect } from 'vitest';
import { deriveMontageLayered } from '@video-toolkit/lib/reel-config-base/derive-montage';
import { LayeredReelSchema } from '@video-toolkit/lib/reel-config-base/layered-schema';

const CFG = {
  fps: 30, bpm: 76.015, track: 'audio/boj.wav', vintage: 'film' as const,
  kicks: '0.4587,1.3973,1.952',
  segments: [
    { src: 'media/p1.jpg', type: 'photo' as const, displayMode: 'full-bleed' as const,
      beatStart: 0, beatCount: 3, transition: 'cut' as const, kenBurns: { direction: 'in' as const } },
    { src: 'media/v1.mp4', type: 'video' as const, displayMode: 'paper-frame' as const,
      beatStart: 3, beatCount: 3, transition: 'fade' as const, inPointSec: 2 },
  ],
  teaser: { lines: ['A', 'B'], appearAtSec: 0, reveal: 'line' as const, fontSize: 96 },
  outro: { style: 'organic' as const, variant: 'sand-brown' as const, transition: 'dissolve' as const,
           logoDelaySec: 0.5, beatStart: 6 },
  watermark: { asset: 'brand/mark.png', corner: 'top-right' as const, variant: 'black' as const },
};

describe('deriveMontageLayered', () => {
  it('derives a valid LayeredReel with beat→ms items, per-clip vintage, teaser, outro, watermark, guides', () => {
    const reel = deriveMontageLayered(CFG);
    expect(() => LayeredReelSchema.parse(reel)).not.toThrow();

    const fpb = Math.round((30 * 60) / 76.015); // 24
    const beatMs = (b: number) => Math.round((b * fpb * 1000) / 30);

    // photo item
    const p = reel.tracks.video.find((v) => v.kind === 'photo')!;
    expect(p).toMatchObject({ source: 'media/p1.jpg', startMs: beatMs(0), endMs: beatMs(3) });
    expect((p as { props?: { displayMode?: string } }).props?.displayMode).toBe('full-bleed');
    expect(p.effects?.some((e) => e.type === 'ken-burns' && (e as { direction?: string }).direction === 'in')).toBe(true);
    expect(p.effects?.some((e) => e.type === 'vintage' && (e as { mode?: string }).mode === 'film')).toBe(true);

    // video item → broll, muted convention (no audio track items at all)
    const b = reel.tracks.video.find((v) => v.kind === 'broll')!;
    expect(b).toMatchObject({ source: 'media/v1.mp4', startMs: beatMs(3), endMs: beatMs(6), sourceInMs: 2000 });
    expect(b.sourceOutMs).toBe(2000 + (beatMs(6) - beatMs(3)));
    expect((b as { transitionIn?: { kind?: string } }).transitionIn?.kind).toBe('fade');
    expect(b.effects?.some((e) => e.type === 'vintage')).toBe(true);
    expect(reel.tracks.audio).toHaveLength(0);

    // teaser overlay
    const teaser = reel.tracks.overlays.find((o) => o.content.kind === 'teaser')!;
    expect(teaser.content).toMatchObject({ kind: 'teaser', lines: ['A', 'B'], reveal: 'line', fontSize: 96 });

    // outro item + props; reel length = last item end
    const outro = reel.tracks.video.find((v) => v.kind === 'outro')!;
    expect((outro as { props?: { style?: string } }).props?.style).toBe('organic');
    // enter-transition length preserved for the renderer (montage ends at the
    // outro beat, not at the very front → the real TRANSITION_FRAMES, not 0).
    expect((outro as { props?: { transitionFrames?: number } }).props?.transitionFrames).toBe(15);
    expect(outro.endMs).toBe(reel.meta.totalDurationMs);

    // watermark hides before the outro
    const wm = reel.tracks.brand.find((x) => x.kind === 'watermark')!;
    expect(wm.startMs).toBe(0);
    expect(wm.endMs).toBe(outro.startMs);

    // outro heartbeat animation needs integer frames
    const kf = (outro as { props?: { kickFrames?: number[] } }).props?.kickFrames!;
    expect(kf).toEqual([14, 42, 59]);
    expect(kf.every(Number.isInteger)).toBe(true);

    // guides from kicks (seconds → ms, precise positions)
    expect(reel.meta.guidesMs).toEqual([459, 1397, 1952]);
  });

  it('omits vintage effects when cfg.vintage is null', () => {
    const reel = deriveMontageLayered({ ...CFG, vintage: null });
    const footage = reel.tracks.video.filter((v) => v.kind === 'photo' || v.kind === 'broll');
    expect(footage.every((v) => !v.effects?.some((e) => e.type === 'vintage'))).toBe(true);
  });

  it('falls back to the uniform beat grid for guides when kicks is empty (no mark past the reel end)', () => {
    const reel = deriveMontageLayered({ ...CFG, kicks: '' });
    const guides = reel.meta.guidesMs!;
    expect(guides.length).toBeGreaterThan(0);
    expect(guides[0]).toBe(0);
    expect(guides.every((ms) => ms <= reel.meta.totalDurationMs)).toBe(true);
  });
});
