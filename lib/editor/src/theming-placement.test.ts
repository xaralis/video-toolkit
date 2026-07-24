import { describe, it, expect } from 'vitest';
import { placementGeometry, DEFAULT_PLACEMENT, PLACEMENTS, type Placement } from '@video-toolkit/lib/theming/placement';

describe('placementGeometry', () => {
  it('returns geometry for every placement value', () => {
    for (const p of PLACEMENTS) {
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
    const unknown = placementGeometry('nonsense' as Placement);
    expect(unknown).toEqual(placementGeometry(DEFAULT_PLACEMENT));
  });
  it('defaults to center', () => {
    expect(DEFAULT_PLACEMENT).toBe('center');
  });

  // The reconciliation invariant: PLACEMENTS is the single vocabulary the editor
  // dropdown offers, and EVERY entry must map to a real geometry zone — never the
  // silent center fallback. This is the property whose absence let the old
  // dropdown's `center-left`/`center-right` no-op to center.
  it('gives every dropdown placement its own real geometry (no silent fallback)', () => {
    const fallback = placementGeometry(DEFAULT_PLACEMENT);
    for (const p of PLACEMENTS) {
      if (p === DEFAULT_PLACEMENT) continue;
      expect(placementGeometry(p)).not.toEqual(fallback);
    }
  });

  // Back-compat: the old dropdown could persist `center-left`/`center-right`
  // (they silently rendered as center). They now resolve to the nearest real
  // zone — the vertically-middle anchored halves — instead of jumping to center.
  it('aliases legacy center-left / center-right to the mid halves', () => {
    expect(placementGeometry('center-left' as Placement)).toEqual(placementGeometry('mid-left'));
    expect(placementGeometry('center-right' as Placement)).toEqual(placementGeometry('mid-right'));
  });
});
