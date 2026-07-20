import { describe, it, expect } from 'vitest';
import { applyTrim, type Segment } from './trim';

const fps = 30;

describe('applyTrim', () => {
  it('clamps a broll end-trim to the 3.0s minimum duration when dragged shorter', () => {
    const seg: Segment = { id: 'b1', type: 'broll', trimIn: 0, trimOut: 5 };
    const result = applyTrim(seg, 'end', -300, { fps }); // -10s
    expect(result.trimOut).toBe(3);
    expect(result.trimIn).toBe(0);
  });

  it('raises clip trimIn on a start-trim, shrinking duration, but stops at the 0.5s minimum', () => {
    const seg: Segment = { id: 'c1', type: 'clip', trimIn: 0, trimOut: 2 };

    const small = applyTrim(seg, 'start', 15, { fps }); // +0.5s, not clamped
    expect(small.trimIn).toBeCloseTo(0.5);

    const large = applyTrim(seg, 'start', 90, { fps }); // +3s, would cross the floor
    expect(large.trimIn).toBeCloseTo(1.5); // trimOut(2) - floor(0.5)
  });

  it('never lets trimIn go below 0', () => {
    const seg: Segment = { id: 'c2', type: 'clip', trimIn: 0.2, trimOut: 5 };
    const result = applyTrim(seg, 'start', -60, { fps }); // -2s
    expect(result.trimIn).toBe(0);
  });

  it('adjusts multi-clip durationMs on an end-trim, clamped to the 1000ms minimum', () => {
    const seg: Segment = { id: 'm1', type: 'multi-clip', durationMs: 2000 };

    const shrunk = applyTrim(seg, 'end', -15, { fps }); // -0.5s
    expect(shrunk.durationMs).toBe(1500);

    const clamped = applyTrim(seg, 'end', -90, { fps }); // -3s, below the floor
    expect(clamped.durationMs).toBe(1000);
  });

  it('treats a multi-clip/card start-trim as a no-op', () => {
    const seg: Segment = { id: 'm2', type: 'multi-clip', durationMs: 2000 };
    const result = applyTrim(seg, 'start', 90, { fps });
    expect(result.durationMs).toBe(2000);

    const card: Segment = { id: 'card1', type: 'card', durationMs: 1500 };
    const cardResult = applyTrim(card, 'start', -90, { fps });
    expect(cardResult.durationMs).toBe(1500);
  });

  it('leaves outro segments unchanged', () => {
    const seg: Segment = { id: 'o1', type: 'outro' };
    const result = applyTrim(seg, 'end', 30, { fps });
    expect(result).toEqual(seg);
  });

  it('leaves segments of an unknown/unhandled type unchanged', () => {
    const seg: Segment = { id: 'x1', type: 'title-card' };
    const result = applyTrim(seg, 'start', 30, { fps });
    expect(result).toEqual(seg);
  });

  it('converts deltaFrames to seconds via fps for both positive and negative deltas', () => {
    const seg: Segment = { id: 'c3', type: 'clip', trimIn: 0, trimOut: 2 };

    const extended = applyTrim(seg, 'end', 30, { fps }); // +1s
    expect(extended.trimOut).toBeCloseTo(3);

    const shortened = applyTrim(seg, 'end', -15, { fps }); // -0.5s, above the floor
    expect(shortened.trimOut).toBeCloseTo(1.5);
  });

  it('does not mutate the input segment', () => {
    const seg: Segment = { id: 'c4', type: 'clip', trimIn: 0, trimOut: 2 };
    const snapshot = { ...seg };
    applyTrim(seg, 'end', 30, { fps });
    expect(seg).toEqual(snapshot);
  });

  it('returns a new object, not the same reference', () => {
    const seg: Segment = { id: 'c5', type: 'clip', trimIn: 0, trimOut: 2 };
    const result = applyTrim(seg, 'end', 30, { fps });
    expect(result).not.toBe(seg);
  });
});
