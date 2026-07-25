import { describe, it, expect } from 'vitest';
import { deriveMontageLayered } from '@video-toolkit/lib/reel-config-base/derive-montage';
import { LayeredReelSchema } from '@video-toolkit/lib/reel-config-base/layered-schema';
import { computeVideoLayout } from '@video-toolkit/lib/render/video-track-layout';

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
    // Ownership rule (lib/render/video-track-layout.ts:44-56): only the FIRST
    // item reads its own transitionIn; every other item's "enter" fade is read
    // from its PREDECESSOR's transitionOut instead. `b` is segment index 1 (not
    // first), so its `transition: 'fade'` must land on the photo segment's
    // (index 0) transitionOut, not on `b`'s own transitionIn.
    expect((b as { transitionIn?: unknown }).transitionIn).toBeUndefined();
    expect((p as { transitionOut?: { kind?: string; frames?: number } }).transitionOut).toEqual({
      kind: 'fade', frames: 6,
    });
    expect(b.effects?.some((e) => e.type === 'vintage')).toBe(true);
    expect(reel.tracks.audio).toHaveLength(0);

    // teaser is derived as a QUOTE-PULL overlay (multi-line text = lines joined by '\n')
    const teaser = reel.tracks.overlays.find((o) => o.content.kind === 'text')!;
    expect(teaser.content).toMatchObject({ kind: 'text', text: 'A\nB', reveal: 'line', fontSize: 96 });

    // outro item + props; reel length = last item end
    const outro = reel.tracks.video.find((v) => v.kind === 'outro')!;
    expect((outro as { props?: { style?: string } }).props?.style).toBe('organic');
    // The outro no longer carries its own enter-transition: the boundary is
    // now the PREVIOUS clip's transitionOut, rendered at the cut by the
    // shared at-cut engine. `transition`/`transitionFrames` are gone from
    // the outro's props.
    expect((outro as { props?: { transition?: string } }).props?.transition).toBeUndefined();
    expect((outro as { props?: { transitionFrames?: number } }).props?.transitionFrames).toBeUndefined();
    // outro starts exactly at the cut boundary (the last content clip's end),
    // not shifted earlier by the transition length.
    expect(outro.startMs).toBe(beatMs(6));
    expect(outro.endMs).toBe(reel.meta.totalDurationMs);

    // the last content clip (the broll, beatStart=3..6) carries the real
    // at-cut transitionOut into the outro — the burn/dissolve now renders as
    // a normal cross-clip transition, not an outro-internal enter effect.
    expect((b as { transitionOut?: { kind?: string; frames?: number } }).transitionOut).toEqual({
      kind: 'dissolve', frames: 15,
    });

    // reel length = outroEnter (last clip's end, beatMs(6) = 144 frames)
    // + logoDelay(15) + reveal(48) + hold(60) = 267 frames → 8900ms
    const expectedTotalF = 6 * fpb + Math.round(0.5 * 30) + 48 + 60;
    expect(reel.meta.totalDurationMs).toBe(Math.round((expectedTotalF * 1000) / 30));

    // watermark hides before the transition into the outro starts (the last
    // clip's transitionOut window), not at the outro's (now later) startMs.
    const wm = reel.tracks.brand.find((x) => x.kind === 'watermark')!;
    expect(wm.startMs).toBe(0);
    expect(wm.endMs).toBe(beatMs(6) - 15 * (1000 / 30));
    expect(wm.endMs).toBeLessThan(outro.startMs);

    // outro heartbeat animation needs integer frames
    const kf = (outro as { props?: { kickFrames?: number[] } }).props?.kickFrames!;
    expect(kf).toEqual([14, 42, 59]);
    expect(kf.every(Number.isInteger)).toBe(true);

    // guides = the BEAT GRID (every fpb=24 frames → 800ms), matching where the
    // montage cuts clips — NOT the irregular kick onsets. fpb = round(30·60/76.015)
    // = 24; totalF = 267 (outro now starts at the cut boundary + logo delay +
    // reveal + hold, not shifted earlier by the transition) → k·24 frames for
    // k=0..11 → k·800 ms.
    expect(reel.meta.guidesMs).toEqual([0, 800, 1600, 2400, 3200, 4000, 4800, 5600, 6400, 7200, 8000, 8800]);
    // kick onsets are NOT the guides; they drive the outro heartbeat instead.
    expect((outro as { props?: { kickFrames?: number[] } }).props?.kickFrames).toEqual([14, 42, 59]);
  });

  it('omits vintage effects when cfg.vintage is null', () => {
    const reel = deriveMontageLayered({ ...CFG, vintage: null });
    const footage = reel.tracks.video.filter((v) => v.kind === 'photo' || v.kind === 'broll');
    expect(footage.every((v) => !v.effects?.some((e) => e.type === 'vintage'))).toBe(true);
  });

  it('guides are the beat grid regardless of kicks, and never mark past the reel end', () => {
    const reel = deriveMontageLayered({ ...CFG, kicks: '' });
    const guides = reel.meta.guidesMs!;
    const withKicks = deriveMontageLayered(CFG).meta.guidesMs!;
    expect(guides).toEqual(withKicks); // kicks don't change the guide grid
    expect(guides[0]).toBe(0);
    expect(guides.every((ms, i) => i === 0 || ms - guides[i - 1] === 800)).toBe(true); // even beat spacing
    expect(guides.every((ms) => ms <= reel.meta.totalDurationMs)).toBe(true);
  });

  it('a mid-montage fade boundary (not touching the first or last segment) survives into computeVideoLayout as a real outRecord', () => {
    // Three content segments before the outro: seg0 --cut--> seg1 --fade--> seg2.
    // The `fade` is declared on seg2 (i=2, neither first nor last video item once
    // the outro is appended), so under the ownership rule the derivation must
    // land it on seg1's (i=1) transitionOut — not on seg2's transitionIn, which
    // computeVideoLayout would silently ignore since seg2 isn't item 0.
    const reel = deriveMontageLayered({
      ...CFG,
      segments: [
        { src: 'media/p1.jpg', type: 'photo', displayMode: 'full-bleed',
          beatStart: 0, beatCount: 3, transition: 'cut' },
        { src: 'media/p2.jpg', type: 'photo', displayMode: 'full-bleed',
          beatStart: 3, beatCount: 3, transition: 'cut' },
        { src: 'media/v1.mp4', type: 'video', displayMode: 'paper-frame',
          beatStart: 6, beatCount: 3, transition: 'fade', inPointSec: 0 },
      ],
      outro: { ...CFG.outro, beatStart: 9 },
    });

    const contentItems = reel.tracks.video.filter((v) => v.kind !== 'outro');
    expect(contentItems).toHaveLength(3);

    const layout = computeVideoLayout(
      reel.tracks.video.map((v) => ({
        startMs: v.startMs, endMs: v.endMs,
        transitionIn: (v as { transitionIn?: unknown }).transitionIn,
        transitionOut: (v as { transitionOut?: unknown }).transitionOut,
      })),
      CFG.fps,
    );

    // seg1 (index 1) is the predecessor at the mid-montage boundary: its
    // outRecord must be the fade the derivation moved onto it.
    expect(layout[1].outRecord).toBeDefined();
    expect(layout[1].outRecord?.kind).toBe('fade');
    // seg2 (index 2) reads that same boundary as its inRecord.
    expect(layout[2].inRecord).toBeDefined();
    expect(layout[2].inRecord?.kind).toBe('fade');
  });
});
