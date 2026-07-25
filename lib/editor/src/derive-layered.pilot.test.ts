// Integration smoke test: run deriveLayered over the REAL pp-namesti-republiky
// pilot project config. Fixture is a verbatim copy of the `defaultProps`
// object from video-toolkit/projects/pp-namesti-republiky/src/Root.tsx
// (lines 20-136) — `as const` suffixes dropped since this is a plain TS
// fixture, but every field/value is identical.
import { describe, it, expect } from 'vitest';
import { deriveLayered } from '@video-toolkit/lib/reel-config-base/derive-layered';
import { LayeredReelSchema } from '@video-toolkit/lib/reel-config-base/layered-schema';

const PP_NAMESTI_DEFAULT_PROPS = {
  topic: 'Lepší náměstí Republiky',
  chevron: 'NÁMĚSTÍ REPUBLIKY',
  audio: { music: 'audio/bg.mp3', musicVolumeDb: -6 },
  segments: [
    {
      id: 'seg-001',
      type: 'clip',
      source: '20260629_130655.mp4',
      trimIn: 0.4,
      trimOut: 5.75,
      overlays: [
        {
          kind: 'title',
          text: 'Ještě lepší {lime:náměstí Republiky}.',
          appearAt: 0,
          durationMs: 3000,
        },
      ],
    },
    {
      id: 'seg-002',
      type: 'broll',
      source: 'br_vizualizace_celek_divadlo.mp4',
      trimIn: 0,
      trimOut: 10.3,
      audioMode: 'inherit-from-clip',
      audioSource: '20260629_130655.mp4',
      audioStartSec: 5.75,
      aiGenerated: true,
      kenBurns: { fromX: 0.35, toX: 0.62, fromScale: 1.05, toScale: 1.12 },
      overlay: {
        kind: 'quote-pull',
        text: 'Bezpečné a {lime:průchozí}.',
        placement: 'upper-left',
        appearAt: 600,
        durationMs: 3200,
      },
    },
    {
      id: 'seg-003',
      type: 'clip',
      source: '20260629_131846.mp4',
      trimIn: 1.1,
      trimOut: 5.6,
      overlays: [],
    },
    {
      id: 'seg-004',
      type: 'broll',
      source: 'br_vizualizace_zelen_kasna.mp4',
      blendTo: 'br_vizualizace_zelen_vic.mp4',
      blend: { direction: 'tl-br', startPct: 14, endPct: 38, softness: 45 },
      trimIn: 0,
      trimOut: 5.0,
      audioMode: 'inherit-from-clip',
      audioSource: '20260629_131846.mp4',
      audioStartSec: 5.6,
      aiGenerated: true,
      kenBurns: { fromX: 0.42, toX: 0.6, fromScale: 1, toScale: 1.08 },
      overlay: {
        kind: 'update-badge',
        text: 'Prosadili jsme',
        eyebrow: 'UPDATE',
        appearAt: 2000,
        durationMs: 3000,
      },
    },
    {
      id: 'seg-005',
      type: 'clip',
      source: '20260629_131949.mp4',
      trimIn: 1.1,
      trimOut: 5.55,
      overlays: [],
    },
    {
      id: 'seg-006',
      type: 'broll',
      source: 'br_vizualizace_voda.mp4',
      blendTo: 'br_vizualizace_voda_interaktivni.mp4',
      blend: { direction: 'bl-tr', startPct: 14, endPct: 40, softness: 45 },
      trimIn: 0,
      trimOut: 5.0,
      audioMode: 'inherit-from-clip',
      audioSource: '20260629_131949.mp4',
      audioStartSec: 5.6,
      aiGenerated: true,
      kenBurns: { fromX: 0.4, toX: 0.6, fromScale: 1, toScale: 1.06 },
      overlay: {
        kind: 'update-badge',
        text: 'Prosadili jsme',
        eyebrow: 'UPDATE',
        appearAt: 2000,
        durationMs: 3000,
      },
    },
    {
      id: 'seg-007',
      type: 'clip',
      source: '20260629_130903.mp4',
      trimIn: 0.2,
      trimOut: 5.85,
      overlays: [
        {
          kind: 'quote-pull',
          text: 'Náměstí Republiky {lime:pro lidi}.',
          placement: 'lower-left',
          appearAt: 3483,
          durationMs: 3581,
        },
      ],
      transitionOut: { kind: 'dissolve' as const, frames: 12 },
    },
    { id: 'seg-008', type: 'outro' },
  ],
};

describe('deriveLayered — pilot smoke (pp-namesti-republiky)', () => {
  it('derives the real pp-namesti-republiky config without throwing and covers every segment', () => {
    const layered = deriveLayered(PP_NAMESTI_DEFAULT_PROPS, { fps: 30, outroFrames: 180 });
    expect(() => LayeredReelSchema.parse(layered)).not.toThrow();
    expect(layered.tracks.video).toHaveLength(PP_NAMESTI_DEFAULT_PROPS.segments.length);
    // total = sum of item spans (sequential) equals meta.totalDurationMs
    const last = layered.tracks.video[layered.tracks.video.length - 1];
    expect(last.endMs).toBe(layered.meta.totalDurationMs);
    // Overlays are independent, absolute-timed items (per the layered-model
    // spec) — the anchorVideoId only seeds the overlay's START alignment at
    // /cut time; an overlay is free to extend past its anchor clip's own
    // span (e.g. bleeding into a transitionOut/outro). seg-007's quote-pull
    // here legitimately runs ~1.4s past its 5667ms anchor clip. So the END
    // is bounded by the whole reel, not the anchor clip — clip-bounding the
    // end would encode the OLD segment-bounded premise the redesign discards.
    for (const ov of layered.tracks.overlays) {
      if (ov.content.kind === 'chevron') continue;
      const v = layered.tracks.video.find((x) => x.id === ov.anchorVideoId)!;
      expect(ov.startMs).toBeGreaterThanOrEqual(v.startMs); // overlay starts at/after its anchor
      expect(ov.startMs).toBeLessThanOrEqual(v.endMs); // overlay BEGINS during its anchor clip
      expect(ov.endMs).toBeLessThanOrEqual(layered.meta.totalDurationMs); // stays within the reel
    }
  });

  it('hides brand watermark/disclaimer during the outro (they end at content-end, not reel-end)', () => {
    const layered = deriveLayered(PP_NAMESTI_DEFAULT_PROPS, { fps: 30, outroFrames: 180 });
    for (const b of layered.tracks.brand) {
      expect(b.endMs).toBeGreaterThan(0);
      expect(b.endMs).toBeLessThan(layered.meta.totalDurationMs);
    }
  });

  it('preserves motion as generic clip effects: broll ken-burns + broll-to-broll blend', () => {
    const layered = deriveLayered(PP_NAMESTI_DEFAULT_PROPS, { fps: 30, outroFrames: 180 });
    const seg002 = layered.tracks.video.find((v) => v.id === 'seg-002')!;
    expect(seg002.effects?.some((e) => e.type === 'ken-burns')).toBe(true);
    const seg004 = layered.tracks.video.find((v) => v.id === 'seg-004')!;
    const blend = seg004.effects?.find((e) => e.type === 'blend');
    expect(blend).toMatchObject({ to: 'br_vizualizace_zelen_vic.mp4' });
  });
});
