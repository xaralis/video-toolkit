import { describe, it, expect } from 'vitest';
import { scrubValue, PX_PER_STEP } from './scrub-value';

describe('scrubValue', () => {
  it('moves one step per 4px of travel', () => {
    expect(PX_PER_STEP).toBe(4);
    expect(scrubValue(1, 4, 0.05)).toBeCloseTo(1.05, 10);
    expect(scrubValue(1, 40, 0.05)).toBeCloseTo(1.5, 10);
  });

  it('moves backwards on negative travel', () => {
    expect(scrubValue(1, -8, 0.05)).toBeCloseTo(0.9, 10);
  });

  it('snaps to the step grid, so no float dust reaches the config', () => {
    // 0.1 + 0.2 is 0.30000000000000004 in raw float maths.
    expect(scrubValue(0.1, 8, 0.1)).toBe(0.3);
    expect(String(scrubValue(0.1, 8, 0.1))).not.toContain('0000');
  });

  it('divides the rate by ten in fine mode', () => {
    expect(scrubValue(1, 40, 0.05, { fine: true })).toBeCloseTo(1.05, 10);
  });

  it('clamps to min and max when they are given', () => {
    expect(scrubValue(0.9, 400, 0.05, { max: 1 })).toBe(1);
    expect(scrubValue(0.1, -400, 0.05, { min: 0 })).toBe(0);
  });

  it('is unbounded when no range is given — the case a slider cannot serve', () => {
    expect(scrubValue(0, 4000, 1)).toBe(1000);
    expect(scrubValue(0, -4000, 1)).toBe(-1000);
  });

  it('returns the start value for zero travel', () => {
    expect(scrubValue(0.85, 0, 0.05)).toBe(0.85);
  });
});
