import { describe, it, expect } from 'vitest';
import { SPEED_DEFAULTS, SPEED_MIN, SPEED_MAX, clampSpeed, deriveSpeed, hasSpeedChanges } from './speed';

describe('clampSpeed', () => {
  it('leaves an in-range value untouched', () => {
    expect(clampSpeed(2)).toBe(2);
  });

  it('clamps above SPEED_MAX', () => {
    expect(clampSpeed(50)).toBe(SPEED_MAX);
  });

  it('clamps below SPEED_MIN', () => {
    expect(clampSpeed(0.01)).toBe(SPEED_MIN);
  });

  it('reads a non-finite value as 1x rather than propagating NaN/Infinity', () => {
    expect(clampSpeed(NaN)).toBe(SPEED_DEFAULTS.speed);
    expect(clampSpeed(Infinity)).toBe(SPEED_DEFAULTS.speed);
  });

  it('reads a zero or negative value as 1x rather than an inverted/stalled rate', () => {
    expect(clampSpeed(0)).toBe(SPEED_DEFAULTS.speed);
    expect(clampSpeed(-2)).toBe(SPEED_DEFAULTS.speed);
  });
});

describe('deriveSpeed', () => {
  it('is 1x when the timeline span and source span agree — the only case that existed before this feature', () => {
    expect(deriveSpeed({ startMs: 0, endMs: 5000, sourceInMs: 2000, sourceOutMs: 7000 })).toBe(1);
  });

  it('is 2x when the source span is twice the timeline span (playing through footage twice as fast)', () => {
    expect(deriveSpeed({ startMs: 0, endMs: 2000, sourceInMs: 0, sourceOutMs: 4000 })).toBe(2);
  });

  it('is 0.5x when the source span is half the timeline span (slow motion)', () => {
    expect(deriveSpeed({ startMs: 0, endMs: 4000, sourceInMs: 0, sourceOutMs: 2000 })).toBe(0.5);
  });

  it('reads a zero-length timeline span as 1x, not a division by zero', () => {
    expect(deriveSpeed({ startMs: 1000, endMs: 1000, sourceInMs: 0, sourceOutMs: 5000 })).toBe(1);
  });

  it('reads a negative timeline span (malformed) as 1x, the same guard', () => {
    expect(deriveSpeed({ startMs: 2000, endMs: 1000, sourceInMs: 0, sourceOutMs: 5000 })).toBe(1);
  });

  it('clamps an extreme ratio at both ends', () => {
    expect(deriveSpeed({ startMs: 0, endMs: 1000, sourceInMs: 0, sourceOutMs: 100000 })).toBe(SPEED_MAX);
    expect(deriveSpeed({ startMs: 0, endMs: 100000, sourceInMs: 0, sourceOutMs: 1000 })).toBe(SPEED_MIN);
  });
});

describe('hasSpeedChanges', () => {
  it('is false for an item at 1x', () => {
    expect(hasSpeedChanges({ kind: 'clip', startMs: 0, endMs: 3000, sourceInMs: 0, sourceOutMs: 3000 })).toBe(false);
  });

  it('is true for an item whose spans disagree', () => {
    expect(hasSpeedChanges({ kind: 'broll', startMs: 0, endMs: 6000, sourceInMs: 0, sourceOutMs: 3000 })).toBe(true);
  });

  it('is false for a photo — no source span to ratio against', () => {
    expect(hasSpeedChanges({ kind: 'photo', startMs: 0, endMs: 3000 })).toBe(false);
  });

  it('is false for a non-clip/broll item even with mismatched numeric spans (multi-clip/card/outro have no single trim)', () => {
    expect(hasSpeedChanges({ kind: 'card', startMs: 0, endMs: 6000, sourceInMs: 0, sourceOutMs: 3000 })).toBe(false);
  });

  it('is false for malformed input rather than throwing', () => {
    expect(hasSpeedChanges(undefined)).toBe(false);
    expect(hasSpeedChanges(null)).toBe(false);
    expect(hasSpeedChanges('nope')).toBe(false);
    expect(hasSpeedChanges({ kind: 'clip', startMs: 0, endMs: 'x', sourceInMs: 0, sourceOutMs: 3000 })).toBe(false);
  });
});
