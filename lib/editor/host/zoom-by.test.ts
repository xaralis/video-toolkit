import { describe, it, expect, vi } from 'vitest';
import { zoomByClamped, zoomByRef } from './zoom-by';

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

describe('zoomByRef', () => {
  // The premise `accumulateZoom` (LayeredTimeline.tsx) depends on: several
  // calls landing in the same tick (no commit — no re-render — in between,
  // exactly what a fast wheel/pinch burst produces) must compound against
  // each other, not against the same stale base. A ref stands in for
  // `scaleWidthRef` without mounting the component.
  it('compounds three same-tick calls by the product of their achieved ratios', () => {
    const ref = { current: 80 };
    const commit = vi.fn();

    const r1 = zoomByRef(ref, 1.25, 16, 400, commit);
    const r2 = zoomByRef(ref, 1.25, 16, 400, commit);
    const r3 = zoomByRef(ref, 1.25, 16, 400, commit);

    // Each step's own achieved ratio is exactly 1.25 (nowhere near the clamp).
    expect(r1).toBeCloseTo(1.25, 6);
    expect(r2).toBeCloseTo(1.25, 6);
    expect(r3).toBeCloseTo(1.25, 6);
    expect(r1 * r2 * r3).toBeCloseTo(1.25 ** 3, 6);

    // The ref — what a burst's LAST layout effect would actually read —
    // moved by the full product, not by the last factor alone (the bug this
    // is fixing: last-write-wins would leave it at 80*1.25 = 100).
    expect(ref.current).toBeCloseTo(80 * 1.25 ** 3, 6);
    expect(commit).toHaveBeenCalledTimes(3);
    expect(commit).toHaveBeenLastCalledWith(ref.current);
  });

  it('clamps compounding at ZOOM_MAX — a burst cannot sail past the ceiling', () => {
    const ref = { current: 350 };
    const commit = vi.fn();

    // 350 * 1.25 * 1.25 * 1.25 ≈ 684, well past 400.
    const r1 = zoomByRef(ref, 1.25, 16, 400, commit);
    const r2 = zoomByRef(ref, 1.25, 16, 400, commit);
    const r3 = zoomByRef(ref, 1.25, 16, 400, commit);

    expect(ref.current).toBe(400);
    // The first step clamps already (350*1.25=437.5 > 400); every step after
    // that is a true no-op — ratio 1, no further commit.
    expect(r1).toBeCloseTo(400 / 350, 6);
    expect(r2).toBe(1);
    expect(r3).toBe(1);
    // No-op steps must not call commit again with the same value.
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(400);
  });

  it('does not call commit for a no-op factor of 1', () => {
    const ref = { current: 80 };
    const commit = vi.fn();

    const ratio = zoomByRef(ref, 1, 16, 400, commit);

    expect(ratio).toBe(1);
    expect(ref.current).toBe(80);
    expect(commit).not.toHaveBeenCalled();
  });
});
