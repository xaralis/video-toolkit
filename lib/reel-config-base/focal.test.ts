import { describe, it, expect } from 'vitest';
import { focalObjectPosition } from './focal';

describe('focalObjectPosition', () => {
  it('defaults both axes to center', () => {
    expect(focalObjectPosition()).toBe('50% 50%');
  });
  it('maps focalX/focalY to percentages', () => {
    expect(focalObjectPosition(0.74, 0.3)).toBe('74% 30%');
  });
  it('treats an undefined axis as center', () => {
    expect(focalObjectPosition(0.74)).toBe('74% 50%');
  });
});
