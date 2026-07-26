import { describe, it, expect } from 'vitest';
import {
  resolveVideoRenderer,
  SegmentMedia,
  GenericOutro,
  GenericMultiClip,
  GenericCard,
} from '@video-toolkit/lib/theming';
import type { CompositionTheme, VideoRenderer, VideoKind } from '@video-toolkit/lib/theming';

const Dummy: VideoRenderer = () => null;

const ALL_KINDS: VideoKind[] = ['clip', 'broll', 'photo', 'multi-clip', 'card', 'outro'];

describe('widened video kinds', () => {
  // THE capability Phase 3 Task 3 adds. Before it, these three resolved to
  // undefined and renderVideoItemNode's `if (!Renderer) return null` dropped
  // them from the render unless the brand registered its own — the copy-paste
  // channel. Deleting an entry from GENERIC_VIDEO_RENDERERS turns this red.
  it('EVERY video kind resolves to a core generic with no brand registration', () => {
    const bare: CompositionTheme = { accentSlots: [], background: '#000' };
    expect(ALL_KINDS.every((k) => resolveVideoRenderer(bare, k) !== undefined)).toBe(true);
    expect(resolveVideoRenderer(bare, 'outro')).toBe(GenericOutro);
    expect(resolveVideoRenderer(bare, 'card')).toBe(GenericCard);
    expect(resolveVideoRenderer(bare, 'multi-clip')).toBe(GenericMultiClip);
    expect(resolveVideoRenderer(bare, 'clip')).toBe(SegmentMedia);
    expect(resolveVideoRenderer(bare, 'broll')).toBe(SegmentMedia);
    expect(resolveVideoRenderer(bare, 'photo')).toBe(SegmentMedia);
  });

  it('a kind NEITHER side knows still resolves to undefined', () => {
    expect(resolveVideoRenderer({ accentSlots: [] }, 'sizzle-wall' as VideoKind)).toBeUndefined();
  });

  it('registered outro renderer wins', () => {
    const theme: CompositionTheme = { accentSlots: [], background: '#000', video: { outro: { renderer: Dummy } } };
    expect(resolveVideoRenderer(theme, 'outro')).toBe(Dummy);
  });

  // A registration with NO renderer contributes config/params only — it must
  // NOT mask the core generic. Same rule as the overlay and effect axes.
  it('a config-only registration does not mask the generic', () => {
    const theme: CompositionTheme = { accentSlots: [], background: '#000', video: { card: { config: { a: 1 } } } };
    expect(resolveVideoRenderer(theme, 'card')).toBe(GenericCard);
  });
});

// PARITY: registering the three generics changes behaviour ONLY for a kind the
// brand left unregistered. Both real brand repos are pinned here by shape, so a
// future edit to GENERIC_VIDEO_RENDERERS that would steal a kind back from a
// brand turns this red instead of silently changing a brand's render.
describe('brand parity over the new generics', () => {
  const PPClip: VideoRenderer = () => null;
  const PPBroll: VideoRenderer = () => null;
  const PPPhoto: VideoRenderer = () => null;
  const PPMultiClip: VideoRenderer = () => null;
  const PPCard: VideoRenderer = () => null;
  const PPOutro: VideoRenderer = () => null;

  // campaign-reels registers ALL SIX kinds, so nothing about its render changes.
  const ppTheme: CompositionTheme = {
    accentSlots: [],
    background: '#0a0a0a',
    video: {
      clip: { renderer: PPClip },
      broll: { renderer: PPBroll },
      photo: { renderer: PPPhoto },
      'multi-clip': { renderer: PPMultiClip },
      card: { renderer: PPCard },
      outro: { renderer: PPOutro },
    },
  };

  it('campaign-reels: every kind still resolves to the BRAND renderer, none to a generic', () => {
    const resolved = ALL_KINDS.map((k) => resolveVideoRenderer(ppTheme, k));
    expect(resolved).toEqual([PPClip, PPBroll, PPPhoto, PPMultiClip, PPCard, PPOutro]);
    expect(resolved).not.toContain(GenericOutro);
    expect(resolved).not.toContain(GenericCard);
    expect(resolved).not.toContain(GenericMultiClip);
  });

  // roost-reels registers clip/photo/broll (its vintage RoostSegment) plus its
  // PROCEDURAL outro. Its outro must still win — a procedural outro is exactly
  // the case core's ASSET generic cannot cover, which is why it is an override.
  const RoostSegment: VideoRenderer = () => null;
  const RoostOutro: VideoRenderer = () => null;
  const roostTheme: CompositionTheme = {
    accentSlots: [],
    background: '#f2ede4',
    video: {
      clip: { renderer: RoostSegment },
      photo: { renderer: RoostSegment },
      broll: { renderer: RoostSegment },
      outro: { renderer: RoostOutro },
    },
  };

  it("roost-reels: its procedural outro still wins over core's asset generic", () => {
    expect(resolveVideoRenderer(roostTheme, 'outro')).toBe(RoostOutro);
    expect(resolveVideoRenderer(roostTheme, 'clip')).toBe(RoostSegment);
    expect(resolveVideoRenderer(roostTheme, 'photo')).toBe(RoostSegment);
    expect(resolveVideoRenderer(roostTheme, 'broll')).toBe(RoostSegment);
  });

  it('roost-reels: merely GAINS generics for the two kinds it never registered or used', () => {
    expect(resolveVideoRenderer(roostTheme, 'card')).toBe(GenericCard);
    expect(resolveVideoRenderer(roostTheme, 'multi-clip')).toBe(GenericMultiClip);
  });
});
