import { describe, expect, it } from 'vitest';
import { interpolate } from 'remotion';
import { overlayEnvelope } from './envelope';

const FPS = 30;
const at = (frame: number, opts: Parameters<typeof overlayEnvelope>[2]) =>
  overlayEnvelope(frame, FPS, opts);

describe('overlayEnvelope', () => {
  // The campaign chevron's constants: 3000ms span = 90f, 12f in, 18f out.
  const CHEVRON = { durationMs: 3000, fadeInFrames: 12, fadeOutFrames: 18 };

  it('reproduces the hand-rolled 4-point trapezoid exactly', () => {
    // Parity guard: converting an overlay to this helper must not move a pixel.
    // This is the literal expression the per-overlay implementations used.
    for (let f = 0; f <= 90; f++) {
      const legacy = interpolate(f, [0, 12, 72, 90], [0, 1, 1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      expect(at(f, CHEVRON).opacity).toBe(legacy);
    }
  });

  it('is invisible outside its span', () => {
    expect(at(-1, CHEVRON).visible).toBe(false);
    expect(at(91, CHEVRON).visible).toBe(false);
    expect(at(91, CHEVRON).phase).toBe('after');
    expect(at(0, CHEVRON).visible).toBe(true);
    expect(at(90, CHEVRON).visible).toBe(true);
  });

  it('reports the phase the caller is in', () => {
    expect(at(0, CHEVRON).phase).toBe('in');
    expect(at(11, CHEVRON).phase).toBe('in');
    expect(at(12, CHEVRON).phase).toBe('hold');
    expect(at(71, CHEVRON).phase).toBe('hold');
    expect(at(72, CHEVRON).phase).toBe('out');
  });

  it('exposes both ramp progresses for slides and scales', () => {
    expect(at(0, CHEVRON).enterProgress).toBe(0);
    expect(at(6, CHEVRON).enterProgress).toBeCloseTo(0.5);
    expect(at(12, CHEVRON).enterProgress).toBe(1);
    expect(at(50, CHEVRON).exitProgress).toBe(0);
    expect(at(81, CHEVRON).exitProgress).toBeCloseTo(0.5);
    expect(at(90, CHEVRON).exitProgress).toBe(1);
  });

  // The bug this helper exists to kill: a fixed-length envelope inside a
  // shorter Sequence is hard-cut mid-hold and never fades out.
  it('scales the ramps down rather than overrunning a short span', () => {
    const short = { durationMs: 500, fadeInFrames: 12, fadeOutFrames: 18 }; // 15f span, 30f of ramps
    const e = at(15, short);
    expect(e.visible).toBe(true);
    expect(e.opacity).toBeCloseTo(0); // the fade-out actually completes
    expect(at(0, short).opacity).toBeCloseTo(0);
    expect(at(7, short).opacity).toBeGreaterThan(0); // and it still reaches some brightness
  });

  it('does not throw when the ramps exceed the span', () => {
    // A bare 4-point interpolate would raise "inputRange must be strictly
    // monotonically increasing" here.
    expect(() => at(5, { durationMs: 200, fadeInFrames: 12, fadeOutFrames: 18 })).not.toThrow();
    expect(() => at(0, { durationMs: 33, fadeInFrames: 12, fadeOutFrames: 18 })).not.toThrow();
  });

  it('honours reveal/hide = none by switching a ramp off', () => {
    expect(at(0, { ...CHEVRON, reveal: 'none' }).opacity).toBe(1);
    expect(at(90, { ...CHEVRON, hide: 'none' }).opacity).toBe(1);
    expect(at(91, { ...CHEVRON, hide: 'none' }).visible).toBe(false);
  });

  it('treats a zero-length span as not visible', () => {
    expect(at(0, { durationMs: 0 }).visible).toBe(false);
  });

  it('offsets by appearAtMs when the caller is not Sequence-mounted', () => {
    const o = { durationMs: 3000, appearAtMs: 1000, fadeInFrames: 12, fadeOutFrames: 18 };
    expect(at(29, o).visible).toBe(false);
    expect(at(30, o).localFrame).toBe(0);
    expect(at(42, o).opacity).toBe(1);
  });
});
