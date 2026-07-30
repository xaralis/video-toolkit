// Phase 5 Task 0.1 — `checkerboard`'s default `squareAnimation: 'fade'` path,
// re-expressed as ONE masked mount instead of `gridSize²` clipped copies.
//
// See lib/transitions/presentations/checkerboard.tsx for the mechanism (an
// SVG `<mask>` whose `gridSize²` `<rect>`s carry the same per-cell eased
// progress the old clipped-copy path computed) and its header comment for
// why `'scale'`/`'flip'` are the one carve-out that keeps the original
// per-cell path.
//
// This file runs under jsdom like at-cut-transitions.test.tsx, so — same
// caveat as that file — it settles WIRING and STRUCTURE (mount counts,
// element counts, mask alpha values), not what a frame LOOKS like. That is
// the pixel harness's job (examples/layered-minimal).
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  transitionNodeFor,
  type TransitionRecord,
} from '@video-toolkit/lib/render/at-cut-transitions';

const DIMS = { width: 1080, height: 1920 };

const A = <div data-testid="a" />;
const B = <div data-testid="b" />;

const mount = (
  t: Partial<TransitionRecord> & { kind: 'checkerboard' },
  progress: number,
  inputs: { from?: React.ReactNode | null; to?: React.ReactNode | null } = {},
) => {
  const Composite = transitionNodeFor(t as TransitionRecord, DIMS)!.composite;
  return render(
    <Composite
      from={inputs.from === undefined ? A : inputs.from}
      to={inputs.to === undefined ? B : inputs.to}
      progress={progress}
      durationInFrames={15}
      width={1080}
      height={1920}
      fps={30}
      palette={[]}
      background="transparent"
    />,
  );
};

const bCount = (container: HTMLElement) => container.querySelectorAll('[data-testid="b"]').length;
const cellDivsOf = (container: HTMLElement) =>
  [...container.querySelectorAll('div')].filter((d) => d.style.transformOrigin === 'center center');
const maskRectsOf = (container: HTMLElement) => [...container.querySelectorAll('mask rect')];
const scaleOf = (div: HTMLElement) => Number(/scale\(([-\d.]+)\)/.exec(div.style.transform)?.[1]);
const fillOpacityOf = (rect: Element) => Number(rect.getAttribute('fill-opacity'));

describe('checkerboard default (fade) path mounts `to` once, not gridSize² times', () => {
  it.each([0, 0.2, 0.5, 0.8, 1])('progress=%s: exactly one `to` mount, gridSize² mask rects', (progress) => {
    const { container, unmount } = mount({ kind: 'checkerboard', frames: 15 }, progress);
    expect({ b: bCount(container), rects: maskRectsOf(container).length }).toEqual({ b: 1, rects: 64 }); // default gridSize 8
    unmount();
  });

  it('a non-default gridSize still mounts `to` exactly once', () => {
    const { container, unmount } = mount({ kind: 'checkerboard', frames: 15, gridSize: 5 }, 0.4);
    expect({ b: bCount(container), rects: maskRectsOf(container).length }).toEqual({ b: 1, rects: 25 });
    unmount();
  });

  // No conditional mounting on progress (requirement 4): the rect COUNT must
  // not move even though individual rects' fillOpacity does.
  it('mask rect count is progress-invariant', () => {
    const countsAt = [0, 0.1, 0.5, 0.9, 1].map((p) => {
      const { container, unmount } = mount({ kind: 'checkerboard', frames: 15, gridSize: 4 }, p);
      const n = maskRectsOf(container).length;
      unmount();
      return n;
    });
    expect(countsAt).toEqual([16, 16, 16, 16, 16]);
  });

  // A missing `to` (the reel's trailing edge) still resolves through
  // `edgeInput` to a single masked background plate — the same "no empty
  // cell" guarantee the old clipped-copy pin made, restated for the mask: no
  // rect is ever left without a defined fillOpacity.
  it('never leaves a mask cell without a fillOpacity, including at the trailing edge', () => {
    const { container, unmount } = mount({ kind: 'checkerboard', frames: 15, gridSize: 3 }, 0.5, { to: null });
    const rects = maskRectsOf(container);
    expect(rects).toHaveLength(9);
    expect(rects.every((r) => r.hasAttribute('fill-opacity') && !Number.isNaN(fillOpacityOf(r)))).toBe(true);
    unmount();
  });
});

describe('checkerboard the mask id is stable across frames and unique per instance', () => {
  it('the same instance keeps the same mask id across re-renders (progress changes)', () => {
    const Composite = transitionNodeFor({ kind: 'checkerboard', frames: 15 } as TransitionRecord, DIMS)!.composite;
    const props = { from: A, to: B, durationInFrames: 15, width: 1080, height: 1920, fps: 30, palette: [], background: 'transparent' };
    const { container, rerender, unmount } = render(<Composite {...props} progress={0} />);
    const idAt0 = container.querySelector('mask')?.id;
    rerender(<Composite {...props} progress={0.5} />);
    const idAt50 = container.querySelector('mask')?.id;
    rerender(<Composite {...props} progress={1} />);
    const idAt100 = container.querySelector('mask')?.id;
    expect(idAt0).toBeTruthy();
    expect([idAt0, idAt50, idAt100]).toEqual([idAt0, idAt0, idAt0]);
    unmount();
  });

  it('two concurrent instances (two live boundaries) get different mask ids', () => {
    const node = transitionNodeFor({ kind: 'checkerboard', frames: 15 } as TransitionRecord, DIMS)!;
    const Composite = node.composite;
    const props = { progress: 0.5, durationInFrames: 15, width: 1080, height: 1920, fps: 30, palette: [], background: 'transparent' };
    const first = render(<Composite {...props} from={<div data-testid="a1" />} to={<div data-testid="b1" />} />);
    const second = render(<Composite {...props} from={<div data-testid="a2" />} to={<div data-testid="b2" />} />);
    const id1 = first.container.querySelector('mask')?.id;
    const id2 = second.container.querySelector('mask')?.id;
    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
    first.unmount();
    second.unmount();
  });
});

describe("checkerboard's carve-out ('scale'/'flip') keeps the original gridSize² clipped-copy path", () => {
  it.each(['scale', 'flip'] as const)('%s still mounts `to` gridSize² times, one clipped copy per cell', (squareAnimation) => {
    const { container, unmount } = mount(
      { kind: 'checkerboard', frames: 15, gridSize: 4, squareAnimation },
      0.5,
    );
    expect({ b: bCount(container), cells: cellDivsOf(container).length }).toEqual({ b: 16, cells: 16 });
    // No mask at all on this path — the carve-out is a structurally different
    // implementation, not the mask path with a geometry no-op layered on top.
    expect(container.querySelector('mask')).toBeNull();
    unmount();
  });
});

// THE SHARED-HELPER PARITY CHECK. `cellEasedProgress` in checkerboard.tsx is
// the ONE piece of arithmetic both paths must read from — a stagger/pattern/
// easing change must reach both identically. `'scale'`'s per-cell `scale`
// value IS `easedProgress` verbatim (before the `opacity>0` branching), so it
// is the cleanest observable proxy for the mask path's `fillOpacity`: same
// gridSize/pattern/stagger/progress, index-for-index (`cells.map` iterates
// row-major in both paths, so index i is the same (row,col) cell in each).
//
// MUTATION EVIDENCE (see task-0.1-report.md for the exact commands/output):
// deleting the `cellEasedProgress(...)` call from the mask path (e.g.
// replacing it with a constant, or with `progress` directly) turns this RED,
// which is what proves the helper is genuinely shared rather than
// independently reimplemented per path.
describe('checkerboard the mask fillOpacity and the clipped-copy scale value share one computation', () => {
  it.each([0.1, 0.35, 0.5, 0.7, 0.95])('progress=%s: mask fillOpacity[i] === scale-path scale[i] for every cell', (progress) => {
    const gridSize = 4;
    const stagger = 0.6;
    const pattern = 'diagonal';

    const { container: maskContainer, unmount: unmountMask } = mount(
      { kind: 'checkerboard', frames: 15, gridSize, stagger, pattern, squareAnimation: 'fade' },
      progress,
    );
    const fillOpacities = maskRectsOf(maskContainer).map(fillOpacityOf);
    unmountMask();

    const { container: scaleContainer, unmount: unmountScale } = mount(
      { kind: 'checkerboard', frames: 15, gridSize, stagger, pattern, squareAnimation: 'scale' },
      progress,
    );
    const scales = cellDivsOf(scaleContainer).map(scaleOf);
    unmountScale();

    expect(fillOpacities).toHaveLength(gridSize * gridSize);
    expect(scales).toHaveLength(gridSize * gridSize);
    fillOpacities.forEach((alpha, i) => {
      expect(alpha).toBeCloseTo(scales[i], 10);
    });
  });
});
