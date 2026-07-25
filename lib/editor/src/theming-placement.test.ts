import { describe, it, expect } from 'vitest';
import { placementGeometry, DEFAULT_PLACEMENT, type Placement } from '@video-toolkit/lib/theming/placement';

const ALL: Placement[] = [
  'upper-third', 'center', 'lower-third',
  'upper-left', 'upper-center', 'upper-right',
  'mid-left', 'mid-right',
  'lower-left', 'lower-center', 'lower-right',
];

describe('placementGeometry', () => {
  it('returns geometry for every placement value', () => {
    for (const p of ALL) {
      const g = placementGeometry(p);
      expect(g.containerStyle).toBeTypeOf('object');
      expect(['left', 'right', 'center']).toContain(g.textAlign);
    }
  });
  it('anchors right-side zones to the right and left-align them', () => {
    expect(placementGeometry('upper-right').textAlign).toBe('right');
    expect(placementGeometry('mid-left').textAlign).toBe('left');
  });
  it('falls back to the default placement for an unknown value', () => {
    const unknown = placementGeometry('bottom-left' as Placement);
    expect(unknown).toEqual(placementGeometry(DEFAULT_PLACEMENT));
  });
  it('defaults to center', () => {
    expect(DEFAULT_PLACEMENT).toBe('center');
  });
});
