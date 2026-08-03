import { describe, it, expect } from 'vitest';
import { zoomByClamped } from './zoom-by';

describe('zoomByClamped', () => {
  it('applies the factor unclamped, reporting the requested ratio verbatim', () => {
    const { next, ratio } = zoomByClamped(80, 1.25, 16, 400);
    expect(next).toBeCloseTo(100, 6);
    expect(ratio).toBeCloseTo(1.25, 6);
  });

  it('clamps at the max and reports the ACHIEVED ratio, not the requested one', () => {
    // The exact overshoot scenario from the review: at 350, x1.25 clamps to
    // 400 — an achieved ratio of ~1.143, not 1.25.
    const { next, ratio } = zoomByClamped(350, 1.25, 16, 400);
    expect(next).toBe(400);
    expect(ratio).toBeCloseTo(400 / 350, 6);
    expect(ratio).not.toBeCloseTo(1.25, 2);
  });

  it('clamps at the min symmetrically', () => {
    const { next, ratio } = zoomByClamped(20, 1 / 1.4, 16, 400);
    expect(next).toBe(16);
    expect(ratio).toBeCloseTo(16 / 20, 6);
  });

  it('reports ratio 1 — a true no-op — when already at the max and zooming further in', () => {
    const { next, ratio } = zoomByClamped(400, 1.25, 16, 400);
    expect(next).toBe(400);
    expect(ratio).toBe(1);
  });

  it('reports ratio 1 when already at the min and zooming further out', () => {
    const { next, ratio } = zoomByClamped(16, 1 / 1.4, 16, 400);
    expect(next).toBe(16);
    expect(ratio).toBe(1);
  });

  it('reports ratio 1 for a literal factor of 1 (e.g. resetting to 100% while already there)', () => {
    const { next, ratio } = zoomByClamped(80, 80 / 80, 16, 400);
    expect(next).toBe(80);
    expect(ratio).toBe(1);
  });

  it('supports an absolute reset via factor = target / current', () => {
    const { next, ratio } = zoomByClamped(200, 80 / 200, 16, 400);
    expect(next).toBeCloseTo(80, 6);
    expect(ratio).toBeCloseTo(80 / 200, 6);
  });
});
