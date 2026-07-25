import { describe, it, expect } from 'vitest';
import { VideoItemSchema } from '@video-toolkit/lib/reel-config-base/layered-schema';

// `transitionIn`/`transitionOut` used to be `z.record(z.string(), z.unknown())`
// — anything with any shape parsed, so a typo'd kind or a missing required
// field survived all the way to the renderer, where it silently degraded to a
// hard cut. They now carry TransitionSchema itself.
describe('layered video item transitions are schema-typed', () => {
  const clip = { id: 'seg-001', kind: 'clip', startMs: 0, endMs: 2000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 2000 };

  it('accepts a plain frame-bearing transition on both edges', () => {
    const r = VideoItemSchema.parse({
      ...clip,
      transitionIn: { kind: 'fade', frames: 15 },
      transitionOut: { kind: 'dissolve', frames: 8 },
    });
    expect(r.transitionIn).toEqual({ kind: 'fade', frames: 15 });
    expect(r.transitionOut).toEqual({ kind: 'dissolve', frames: 8 });
  });

  it('accepts a bare cut (the "no transition here" marker)', () => {
    expect(VideoItemSchema.parse({ ...clip, transitionOut: { kind: 'cut' } }).transitionOut).toEqual({ kind: 'cut' });
  });

  it('accepts burn with its full optional look bag (roost-reel-01’s shape)', () => {
    const burn = { kind: 'burn', frames: 20, mask: 'clouds.png', glowColor: '#ff7a1a', edgeContrast: 14, glowBand: 0.1 };
    expect(VideoItemSchema.parse({ ...clip, transitionOut: burn }).transitionOut).toEqual(burn);
  });

  it('accepts gradient-wipe with its optional direction/softness', () => {
    const gw = { kind: 'gradient-wipe', frames: 15, direction: 'tl-br', softness: 40 };
    expect(VideoItemSchema.parse({ ...clip, transitionOut: gw }).transitionOut).toEqual(gw);
  });

  it('omits the fields entirely when absent', () => {
    const r = VideoItemSchema.parse(clip);
    expect(r.transitionIn).toBeUndefined();
    expect(r.transitionOut).toBeUndefined();
  });

  it('rejects an unknown kind', () => {
    expect(VideoItemSchema.safeParse({ ...clip, transitionOut: { kind: 'swoosh', frames: 15 } }).success).toBe(false);
  });

  it('rejects a frame-bearing kind with no frames', () => {
    expect(VideoItemSchema.safeParse({ ...clip, transitionOut: { kind: 'fade' } }).success).toBe(false);
  });

  it('rejects an out-of-range frame count', () => {
    expect(VideoItemSchema.safeParse({ ...clip, transitionOut: { kind: 'fade', frames: 0 } }).success).toBe(false);
    expect(VideoItemSchema.safeParse({ ...clip, transitionOut: { kind: 'fade', frames: 61 } }).success).toBe(false);
  });

  it('rejects a bad enum value on a sub-option', () => {
    expect(
      VideoItemSchema.safeParse({ ...clip, transitionOut: { kind: 'slide', frames: 15, direction: 'sideways' } }).success,
    ).toBe(false);
  });

  // wipe's `color` is free-form (any brand accent-slot key), but it is still a
  // STRING field — not truly untyped. This is wipe-specific, unlike the enum
  // check above: it fails on `color`'s type, not on `direction`.
  it('rejects a non-string value for wipe’s color', () => {
    expect(
      VideoItemSchema.safeParse({ ...clip, transitionOut: { kind: 'wipe', frames: 15, color: 42, direction: 'left' } }).success,
    ).toBe(false);
  });

  // wipe's `color` is a BRAND accent-slot key, so the schema can't enumerate
  // it — the brand owns the vocabulary, and core validating against one brand's
  // slot names is exactly the coupling this field was changed to remove. It is
  // also optional: unset means "the presentation's own neutral sweep".
  it('accepts any brand accent key — or none — for wipe’s colour', () => {
    for (const color of ['gold', 'rust', 'ochre']) {
      expect(
        VideoItemSchema.safeParse({ ...clip, transitionOut: { kind: 'wipe', frames: 15, color, direction: 'left' } }).success,
      ).toBe(true);
    }
    expect(
      VideoItemSchema.safeParse({ ...clip, transitionOut: { kind: 'wipe', frames: 15, direction: 'left' } }).success,
    ).toBe(true);
  });

  it('rejects a direction-bearing kind missing its direction', () => {
    expect(VideoItemSchema.safeParse({ ...clip, transitionOut: { kind: 'slide', frames: 15 } }).success).toBe(false);
  });
});
