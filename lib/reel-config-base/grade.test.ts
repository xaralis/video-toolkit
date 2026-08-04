import { describe, it, expect } from 'vitest';
import { GRADE_DEFAULTS, hasGradeChanges } from './grade';

describe('hasGradeChanges', () => {
  it('is false for an item with no grade at all', () => {
    expect(hasGradeChanges(undefined)).toBe(false);
  });

  it('is false for an untouched grade (empty object)', () => {
    expect(hasGradeChanges({})).toBe(false);
  });

  it('is false when every field is explicitly SET to its own default — the case a key-presence check gets wrong', () => {
    expect(hasGradeChanges({ ...GRADE_DEFAULTS })).toBe(false);
  });

  it('is true when a multiplier field (default 1) differs from its default', () => {
    expect(hasGradeChanges({ brightness: 1.2 })).toBe(true);
  });

  it('is true when a zero-neutral field (temperature/tint/sepia/hueRotateDeg) differs from its default', () => {
    expect(hasGradeChanges({ sepia: 0.3 })).toBe(true);
    expect(hasGradeChanges({ hueRotateDeg: 15 })).toBe(true);
  });

  it('is false when zero-neutral fields are explicitly stored at 0', () => {
    expect(hasGradeChanges({ temperature: 0, tint: 0, sepia: 0, hueRotateDeg: 0 })).toBe(false);
  });
});
