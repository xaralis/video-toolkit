// Phase 5 Task 0.1 built `checkerboard`'s default `squareAnimation: 'fade'`
// path as ONE masked mount inside the OLD `composite` contract (66 → 3 media
// elements measured on this suite's own fixtures). Phase 5 Task 4 moves that
// same, already-proven geometry onto the `plan` arm — `checkerboard` was the
// catalog's last composite kind — and adds the `'scale'`/`'flip'` carve-out
// (now `ghosts`, not a hand-nested clipped-copy JSX tree) and the new
// `'mask-scale'` sub-option (design's option 2).
//
// See lib/transitions/presentations/checkerboard.tsx for the mechanism and
// its header comment for the full carve-out argument.
//
// This file runs under jsdom like at-cut-transitions.test.tsx, so — same
// caveat as that file — it settles WIRING and STRUCTURE (mount counts,
// element counts, mask alpha values, ghost styles), not what a frame LOOKS
// like. That is the pixel harness's job (examples/layered-minimal).
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  return {
    ...actual,
    // `CheckerboardMask` (the `'fade'`/`'mask-scale'` `wrap`) reads the
    // composition's pixel size off this hook — a real `<Composition>`
    // context jsdom has none of, exactly like `at-cut-transitions.test.tsx`'s
    // own mock for `burn`/`glitch`.
    useVideoConfig: () => ({ width: 1080, height: 1920, fps: 30, durationInFrames: 300, id: 'test', defaultProps: {}, props: {} }),
  };
});

import {
  transitionNodeFor,
  resetTransitionNodeCache,
  type TransitionRecord,
} from '@video-toolkit/lib/render/at-cut-transitions';
import { ActiveTransitionProgressContext } from '@video-toolkit/lib/render/video-track-plan';

const DIMS = { width: 1080, height: 1920 };

const A = <div data-testid="a" />;
const B = <div data-testid="b" />;

/** Drives a `checkerboard` `plan`-arm node exactly the way `LayerShell`
 *  (`lib/render/video-track-plan.tsx`) does: `op.style` on the shell, `op.wrap`
 *  mounted `active` around the content with the live progress delivered
 *  through `ActiveTransitionProgressContext` (never a prop — a `wrap`'s own
 *  signature is fixed at `{active, children}`), and `op.ghosts` as extra
 *  styled copies appended AFTER the real child. Mirrors
 *  `at-cut-transitions.test.tsx`'s own `mountPlan`, kept local here so this
 *  file does not depend on that file's internals. */
function mountCheckerboard(
  t: Partial<TransitionRecord> & { kind: 'checkerboard' },
  progress: number,
  inputs: { from?: React.ReactNode | null; to?: React.ReactNode | null } = {},
  durationInFrames = 15,
) {
  const node = transitionNodeFor(t as TransitionRecord, DIMS)!;
  if (typeof node.plan !== 'function') throw new Error('expected a plan-arm TransitionNode in this test');
  const frame = Math.round(progress * durationInFrames);
  const composite = node.plan({
    from: inputs.from === null ? null : { range: [0, durationInFrames] },
    to: inputs.to === null ? null : { range: [0, durationInFrames] },
    progress,
    frame,
    durationInFrames,
    params: {},
    dims: { width: 1080, height: 1920, fps: 30 },
    palette: [],
    background: 'transparent',
  });
  const renderSide = (side: 'from' | 'to', content: React.ReactNode) => {
    const op = composite[side];
    const style: React.CSSProperties = { ...(op?.style ?? {}) };
    const Wrap = op?.wrap;
    return (
      <div style={style}>
        {Wrap ? <Wrap active>{content}</Wrap> : content}
        {op?.ghosts?.map((ghost, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <div key={`ghost-${i}`} style={{ ...ghost }}>{content}</div>
        ))}
      </div>
    );
  };
  const fromContent = inputs.from === null ? <div data-testid="edge-from" /> : (inputs.from ?? A);
  const toContent = inputs.to === null ? <div data-testid="edge-to" /> : (inputs.to ?? B);
  return render(
    <ActiveTransitionProgressContext.Provider value={{ progress, frame, durationInFrames }}>
      {renderSide('from', fromContent)}
      {renderSide('to', toContent)}
    </ActiveTransitionProgressContext.Provider>,
  );
}

const bCount = (container: HTMLElement) => container.querySelectorAll('[data-testid="b"]').length;
const maskRectsOf = (container: HTMLElement) => [...container.querySelectorAll('mask rect')];
const fillOpacityOf = (rect: Element) => Number(rect.getAttribute('fill-opacity'));
// PHASE 5 TASK 4 — the carve-out's cells are now `ghosts`: one wrapping
// `<div>` per cell, `clip-path` doing the cropping, `transformOrigin` a
// computed per-cell percentage. Nothing else in this file's fixtures sets
// `clip-path`, so it is what identifies a cell div.
const ghostCellsOf = (container: HTMLElement) =>
  [...container.querySelectorAll('div')].filter((d) => d.style.clipPath !== '');
const transformOf = (div: HTMLElement, fn: string): number =>
  Number(new RegExp(`${fn}\\(([-\\d.]+)`).exec(div.style.transform)?.[1]);

describe('checkerboard default (fade) path mounts `to` once, not gridSize² times', () => {
  it.each([0, 0.2, 0.5, 0.8, 1])('progress=%s: exactly one `to` mount, gridSize² mask rects', (progress) => {
    const { container, unmount } = mountCheckerboard({ kind: 'checkerboard', frames: 15 }, progress);
    expect({ b: bCount(container), rects: maskRectsOf(container).length }).toEqual({ b: 1, rects: 64 }); // default gridSize 8
    unmount();
  });

  it('a non-default gridSize still mounts `to` exactly once', () => {
    const { container, unmount } = mountCheckerboard({ kind: 'checkerboard', frames: 15, gridSize: 5 }, 0.4);
    expect({ b: bCount(container), rects: maskRectsOf(container).length }).toEqual({ b: 1, rects: 25 });
    unmount();
  });

  // No conditional mounting on progress (requirement 4): the rect COUNT must
  // not move even though individual rects' fillOpacity does.
  it('mask rect count is progress-invariant', () => {
    const countsAt = [0, 0.1, 0.5, 0.9, 1].map((p) => {
      const { container, unmount } = mountCheckerboard({ kind: 'checkerboard', frames: 15, gridSize: 4 }, p);
      const n = maskRectsOf(container).length;
      unmount();
      return n;
    });
    expect(countsAt).toEqual([16, 16, 16, 16, 16]);
  });

  // A missing `to` (the reel's trailing edge) still resolves to a single
  // masked background plate — the same "no empty cell" guarantee the old
  // clipped-copy pin made, restated for the mask: no rect is ever left
  // without a defined fillOpacity.
  it('never leaves a mask cell without a fillOpacity, including at the trailing edge', () => {
    const { container, unmount } = mountCheckerboard({ kind: 'checkerboard', frames: 15, gridSize: 3 }, 0.5, { to: null });
    const rects = maskRectsOf(container);
    expect(rects).toHaveLength(9);
    expect(rects.every((r) => r.hasAttribute('fill-opacity') && !Number.isNaN(fillOpacityOf(r)))).toBe(true);
    unmount();
  });
});

describe('checkerboard the mask is actually wired to the masked layer, not just present nearby', () => {
  it.each([
    ['a live `to`', {}],
    ['the trailing edge (`to: null`)', { to: null }],
  ] as const)("the foreignObject's mask attribute references the real <mask> id — %s", (_label, inputs) => {
    const { container, unmount } = mountCheckerboard({ kind: 'checkerboard', frames: 15 }, 0.5, inputs);
    const maskEl = container.querySelector('mask');
    const foreignObject = container.querySelector('foreignObject');
    expect(maskEl).not.toBeNull();
    expect(foreignObject).not.toBeNull();
    // Read the id OFF THE ACTUAL <mask> element, not a value this test
    // invents — a hardcoded string here would pass even if the two drifted.
    expect(foreignObject!.getAttribute('mask')).toBe(`url(#${maskEl!.id})`);
    unmount();
  });

  it("each mask rect's x/y/width/height tiles the frame in real pixel geometry, not stacked at the origin", () => {
    const width = 1080;
    const height = 1920;
    const gridSize = 4;
    const { container, unmount } = mountCheckerboard({ kind: 'checkerboard', frames: 15, gridSize }, 0.5);
    const rects = maskRectsOf(container);
    const cellW = width / gridSize;
    const cellH = height / gridSize;
    const expected: Array<{ x: number; y: number; width: number; height: number }> = [];
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        expected.push({ x: col * cellW, y: row * cellH, width: cellW, height: cellH });
      }
    }
    const got = rects.map((r) => ({
      x: Number(r.getAttribute('x')),
      y: Number(r.getAttribute('y')),
      width: Number(r.getAttribute('width')),
      height: Number(r.getAttribute('height')),
    }));
    expect(got).toEqual(expected);
    // Guard the guard: every rect landing at the origin would also produce a
    // fixed-length array the naive version of this test could satisfy by
    // accident if `expected` were built wrong — assert real spread too.
    expect(new Set(got.map((r) => `${r.x},${r.y}`)).size).toBe(gridSize * gridSize);
    unmount();
  });
});

describe('checkerboard the mask id is stable across frames and unique per DISTINCT node', () => {
  it('the same instance keeps the same mask id across re-renders (progress changes)', () => {
    // The SAME resolved node — `plan`'s wrap is built once at factory time —
    // reused across three re-renders at different progress.
    const node = transitionNodeFor({ kind: 'checkerboard', frames: 15 } as TransitionRecord, DIMS)!;
    if (typeof node.plan !== 'function') throw new Error('expected a plan-arm TransitionNode in this test');
    const renderAt = (progress: number) => {
      const composite = node.plan!({
        from: { range: [0, 15] }, to: { range: [0, 15] }, progress, frame: Math.round(progress * 15),
        durationInFrames: 15, params: {}, dims: { width: 1080, height: 1920, fps: 30 }, palette: [], background: 'transparent',
      });
      const Wrap = composite.to!.wrap!;
      return (
        <ActiveTransitionProgressContext.Provider value={{ progress, frame: Math.round(progress * 15), durationInFrames: 15 }}>
          <Wrap active>{B}</Wrap>
        </ActiveTransitionProgressContext.Provider>
      );
    };
    const { container, rerender, unmount } = render(renderAt(0));
    const idAt0 = container.querySelector('mask')?.id;
    rerender(renderAt(0.5));
    const idAt50 = container.querySelector('mask')?.id;
    rerender(renderAt(1));
    const idAt100 = container.querySelector('mask')?.id;
    expect(idAt0).toBeTruthy();
    expect([idAt0, idAt50, idAt100]).toEqual([idAt0, idAt0, idAt0]);
    unmount();
  });

  // PHASE 5 TASK 4 — CORRECTED CLAIM FROM TASK 0.1's SAME-NAMED TEST. Under
  // the OLD `composite` arm, `checkerboard` was a plain component and TWO
  // `render()` calls of it were two REAL React mounts, each running its own
  // `useState(() => random())` — genuinely two independent instances, always
  // different ids. Under the `plan` arm, the mask id is minted ONCE, at
  // FACTORY time (`checkerboard(props)`), not per render — the same
  // "build-once, `wrap` must be a stable reference for the node's whole
  // life" discipline every migrated kind follows. `transitionNodeFor` also
  // CACHES the resolved node per (record, dims, palette) — so two calls with
  // BYTE-IDENTICAL config return the SAME node, the SAME `wrap` reference,
  // and therefore the SAME mask id. Two DIFFERENT configs (even a one-field
  // difference) resolve to two DIFFERENT cached entries and therefore two
  // different ids — which is what this test now actually proves, since
  // "two concurrent instances" no longer means what it did pre-migration.
  it('two DIFFERENTLY-CONFIGURED live boundaries get different mask ids (via the node cache)', () => {
    resetTransitionNodeCache();
    const nodeA = transitionNodeFor({ kind: 'checkerboard', frames: 15, gridSize: 4 } as TransitionRecord, DIMS)!;
    const nodeB = transitionNodeFor({ kind: 'checkerboard', frames: 15, gridSize: 5 } as TransitionRecord, DIMS)!;
    if (typeof nodeA.plan !== 'function' || typeof nodeB.plan !== 'function') {
      throw new Error('expected plan-arm nodes in this test');
    }
    const idOf = (node: typeof nodeA) => {
      const composite = node.plan!({
        from: { range: [0, 15] }, to: { range: [0, 15] }, progress: 0.5, frame: 7,
        durationInFrames: 15, params: {}, dims: { width: 1080, height: 1920, fps: 30 }, palette: [], background: 'transparent',
      });
      const Wrap = composite.to!.wrap!;
      const { container, unmount } = render(
        <ActiveTransitionProgressContext.Provider value={{ progress: 0.5, frame: 7, durationInFrames: 15 }}>
          <Wrap active>{B}</Wrap>
        </ActiveTransitionProgressContext.Provider>,
      );
      const id = container.querySelector('mask')?.id;
      unmount();
      return id;
    };
    const idA = idOf(nodeA);
    const idB = idOf(nodeB);
    expect(idA).toBeTruthy();
    expect(idB).toBeTruthy();
    expect(idA).not.toBe(idB);
  });

  // THE REAL, MEASURED NARROWING (flagged, not fixed — same class Task 3
  // documented for `scanline-glitch`'s `filterId`, but NOT benign the same
  // way here). Two SIMULTANEOUSLY LIVE boundaries with BYTE-IDENTICAL config
  // resolve to the SAME cached node, hence the SAME mask id — two `<mask
  // id="...">` elements sharing one id in the DOM, which is invalid, and
  // `url(#id)` resolves to whichever is first in document order. Task 3's
  // `scanline-glitch` argued this is benign for the one legally-shared frame
  // between two ABUTTING windows, because both sides' filter graphs are the
  // identity there. That argument does NOT transfer to checkerboard's mask:
  // at the one frame two abutting checkerboard boundaries could share, the
  // CLOSING boundary is at progress 1 (every cell's fillOpacity 1, mask
  // fully open) while the OPENING one is at progress 0 (every cell's
  // fillOpacity 0, mask fully closed) — two genuinely DIFFERENT mask states,
  // not a converging one. Whichever `<mask>` the browser resolves `url(#id)`
  // to would give the OTHER boundary the wrong picture at that shared frame.
  // This is measured here (same node ⇒ same id) and left UNFIXED, per this
  // task's scope (a per-boundary id would need the wrap to know its own
  // `boundaryKey`, which `LayerOp.wrap`'s contract deliberately does not
  // grant it — see `ActiveTransitionProgress`'s own doc comment in
  // `lib/theming/transitions.ts`) — flagged for a human to decide whether a
  // follow-up (a boundary-stable id source) is worth it.
  it('two SAME-CONFIG live boundaries share the identical cached node — and therefore the identical mask id (measured, not fixed)', () => {
    resetTransitionNodeCache();
    const t = { kind: 'checkerboard', frames: 15, gridSize: 4 } as TransitionRecord;
    const nodeA = transitionNodeFor(t, DIMS)!;
    const nodeB = transitionNodeFor(t, DIMS)!;
    expect(nodeA).toBe(nodeB);
    if (typeof nodeA.plan !== 'function') throw new Error('expected a plan-arm node in this test');
    const compositeA = nodeA.plan({
      from: { range: [0, 15] }, to: { range: [0, 15] }, progress: 1, frame: 15,
      durationInFrames: 15, params: {}, dims: { width: 1080, height: 1920, fps: 30 }, palette: [], background: 'transparent',
    });
    // Same `wrap` reference — the shared cache's own consequence.
    expect(compositeA.to!.wrap).toBe(nodeB.plan!({
      from: { range: [0, 15] }, to: { range: [0, 15] }, progress: 0, frame: 0,
      durationInFrames: 15, params: {}, dims: { width: 1080, height: 1920, fps: 30 }, palette: [], background: 'transparent',
    }).to!.wrap);
  });
});

describe("checkerboard's carve-out ('scale'/'flip') keeps a pixel-exact per-cell crop, now as `ghosts`", () => {
  it.each(['scale', 'flip'] as const)('%s still mounts `to` gridSize² + 1 times (the ghosts, plus the real hidden mount)', (squareAnimation) => {
    const { container, unmount } = mountCheckerboard(
      { kind: 'checkerboard', frames: 15, gridSize: 4, squareAnimation },
      0.5,
    );
    expect({ b: bCount(container), cells: ghostCellsOf(container).length }).toEqual({ b: 17, cells: 16 });
    // No mask at all on this path — the carve-out is a structurally different
    // implementation, not the mask path with a geometry no-op layered on top.
    expect(container.querySelector('mask')).toBeNull();
    unmount();
  });

  // THE DEFAULT GRID, EXPLICITLY — `gridSize: 8`, the catalog default, is
  // where "64 mounts is the accepted answer" (design §3/§7) actually lands.
  // Every other test in this describe block uses a smaller grid for speed;
  // this one pins the number the brief itself names.
  it.each(['scale', 'flip'] as const)('%s: the catalog default (gridSize 8) is exactly 64 ghosts', (squareAnimation) => {
    const { container, unmount } = mountCheckerboard(
      { kind: 'checkerboard', frames: 15, squareAnimation },
      0.5,
    );
    expect(ghostCellsOf(container).length).toBe(64);
    unmount();
  });

  // Requirement 4's counterpart for the carve-out: `ghosts.length` must not
  // vary with progress either.
  it('ghost count is progress-invariant', () => {
    const countsAt = [0, 0.1, 0.5, 0.9, 1].map((p) => {
      const { container, unmount } = mountCheckerboard(
        { kind: 'checkerboard', frames: 15, gridSize: 4, squareAnimation: 'scale' }, p,
      );
      const n = ghostCellsOf(container).length;
      unmount();
      return n;
    });
    expect(countsAt).toEqual([16, 16, 16, 16, 16]);
  });

  // The real, un-ghosted `to` mount is hidden, not absent — so hiding it can
  // never itself be a remount (an element-count change).
  it('the real `to` mount is opacity: 0, not removed', () => {
    const { container, unmount } = mountCheckerboard(
      { kind: 'checkerboard', frames: 15, gridSize: 3, squareAnimation: 'scale' }, 0.5,
    );
    const toShell = container.querySelector('[data-testid="b"]')!.parentElement!;
    expect(toShell.style.opacity).toBe('0');
    unmount();
  });

  // Each cell's clip-path crops exactly its own (row, col) rectangle, in
  // percentages of the full frame — the direct structural analogue of the
  // old nested-div technique's outer clipping window, now expressed on one
  // div via `clip-path` instead of `overflow: hidden` + an offset inner div.
  it("each ghost's clip-path tiles the frame in percentage geometry, matching its cell", () => {
    const gridSize = 4;
    const { container, unmount } = mountCheckerboard(
      { kind: 'checkerboard', frames: 15, gridSize, squareAnimation: 'scale' }, 0.5,
    );
    const cells = ghostCellsOf(container);
    const cellSize = 100 / gridSize;
    const expected = new Set<string>();
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const top = row * cellSize;
        const left = col * cellSize;
        const right = 100 - (col + 1) * cellSize;
        const bottom = 100 - (row + 1) * cellSize;
        expected.add(`inset(${top}% ${right}% ${bottom}% ${left}%)`);
      }
    }
    const got = new Set(cells.map((c) => c.style.clipPath));
    expect(got).toEqual(expected);
    unmount();
  });

  // `transformOrigin` is the CELL's own centre (a computed percentage), not
  // the literal `'center center'` the old per-cell-sized box could say —
  // this is what lets `transform: scale(...)` shrink/grow the cell around
  // ITS OWN centre rather than the whole frame's.
  it("each ghost's transformOrigin is that cell's own centre, not the frame's", () => {
    const gridSize = 4;
    const { container, unmount } = mountCheckerboard(
      { kind: 'checkerboard', frames: 15, gridSize, squareAnimation: 'scale' }, 0.5,
    );
    const cells = ghostCellsOf(container);
    const cellSize = 100 / gridSize;
    const origins = new Set(cells.map((c) => c.style.transformOrigin));
    const expected = new Set<string>();
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const cx = col * cellSize + cellSize / 2;
        const cy = row * cellSize + cellSize / 2;
        expected.add(`${cx}% ${cy}%`);
      }
    }
    expect(origins).toEqual(expected);
    // Guard the guard: every cell landing on the SAME (frame-centre) origin
    // would also produce a small set — assert real spread, gridSize² distinct
    // origins.
    expect(origins.size).toBe(gridSize * gridSize);
    unmount();
  });
});

// THE SHARED-HELPER PARITY CHECK. `cellEasedProgress` in checkerboard.tsx is
// the ONE piece of arithmetic every path must read from — a stagger/pattern/
// easing change must reach all of them identically. `'scale'`'s per-cell
// `scale` value IS `easedProgress` verbatim (before the `opacity>0` branching),
// so it is the cleanest observable proxy for the mask path's `fillOpacity`:
// same gridSize/pattern/stagger/progress, index-for-index (`cells` is built
// row-major in every path, so index i is the same (row,col) cell in each).
//
// MUTATION EVIDENCE (see below for the exact command/output): deleting the
// `cellEasedProgress(...)` call from the mask path (e.g. replacing it with a
// constant, or with `progress` directly) turns this RED, which is what proves
// the helper is genuinely shared rather than independently reimplemented per
// path.
describe('checkerboard the mask fillOpacity and the ghost scale value share one computation', () => {
  it.each([0.1, 0.35, 0.5, 0.7, 0.95])('progress=%s: mask fillOpacity[i] === ghost-path scale[i] for every cell', (progress) => {
    const gridSize = 4;
    const stagger = 0.6;
    const pattern = 'diagonal';

    const { container: maskContainer, unmount: unmountMask } = mountCheckerboard(
      { kind: 'checkerboard', frames: 15, gridSize, stagger, pattern, squareAnimation: 'fade' },
      progress,
    );
    const fillOpacities = maskRectsOf(maskContainer).map(fillOpacityOf);
    unmountMask();

    const { container: scaleContainer, unmount: unmountScale } = mountCheckerboard(
      { kind: 'checkerboard', frames: 15, gridSize, stagger, pattern, squareAnimation: 'scale' },
      progress,
    );
    const scales = ghostCellsOf(scaleContainer).map((d) => transformOf(d, 'scale'));
    unmountScale();

    expect(fillOpacities).toHaveLength(gridSize * gridSize);
    expect(scales).toHaveLength(gridSize * gridSize);
    fillOpacities.forEach((alpha, i) => {
      expect(alpha).toBeCloseTo(scales[i], 10);
    });
  });
});

// PART 3 — the new `'mask-scale'` sub-option (design's option 2): a growing
// mask rect per cell instead of alpha. Same 1-mount path as `'fade'`,
// visually similar to `'scale'` but NOT identical (the media never scales,
// only the reveal window grows) — a new, differently-named value, never a
// redefinition of `'scale'`. No pixel-harness goldens exist for it (the
// harness renders only the catalog's own default, `'fade'`), so this is its
// only coverage.
describe("checkerboard's new `'mask-scale'` sub-option (Part 3, option 2)", () => {
  it('is a 1-mount path — same as `fade`, unlike `scale`/`flip`', () => {
    const { container, unmount } = mountCheckerboard(
      { kind: 'checkerboard', frames: 15, gridSize: 4, squareAnimation: 'mask-scale' }, 0.5,
    );
    expect({ b: bCount(container), rects: maskRectsOf(container).length }).toEqual({ b: 1, rects: 16 });
    unmount();
  });

  // Alpha is fixed at 1 throughout — the rect's own SIZE carries the reveal,
  // not its opacity. If this ever drifted to sub-1 alpha it would silently
  // become a second `'fade'`-shaped implementation instead of the geometry
  // this value is FOR.
  it('every rect is fully opaque — the reveal lives in geometry, not alpha', () => {
    const { container, unmount } = mountCheckerboard(
      { kind: 'checkerboard', frames: 15, gridSize: 3, squareAnimation: 'mask-scale' }, 0.4,
    );
    const rects = maskRectsOf(container);
    // No `fill-opacity` attribute at all — SVG's own default is fully opaque,
    // and this path never sets it (unlike `'fade'`, where `fill-opacity` IS
    // the reveal).
    expect(rects.every((r) => !r.hasAttribute('fill-opacity'))).toBe(true);
    unmount();
  });

  // At progress 0 every cell's rect has collapsed to a point (zero area) at
  // its own cell's centre; at progress 1 every rect covers its whole cell.
  // Both endpoints are exact, mirroring `'fade'`'s own endpoint identities.
  it('grows each rect from a centred point (progress 0) to the full cell (progress 1)', () => {
    const width = 1080;
    const height = 1920;
    const gridSize = 2; // every cell's `order` is 0 or (gridSize*2-2)/(gridSize*2-2)=1 under 'diagonal' at the extremes; use stagger 0 so progress 0/1 are exact for every cell regardless of order
    const at = (progress: number) => {
      const { container, unmount } = mountCheckerboard(
        { kind: 'checkerboard', frames: 15, gridSize, stagger: 0, squareAnimation: 'mask-scale' }, progress,
      );
      const rects = [...container.querySelectorAll('mask rect')].map((r) => ({
        w: Number(r.getAttribute('width')),
        h: Number(r.getAttribute('height')),
      }));
      unmount();
      return rects;
    };
    const cellW = width / gridSize;
    const cellH = height / gridSize;
    at(0).forEach(({ w, h }) => {
      expect(w).toBeCloseTo(0, 5);
      expect(h).toBeCloseTo(0, 5);
    });
    at(1).forEach(({ w, h }) => {
      expect(w).toBeCloseTo(cellW, 5);
      expect(h).toBeCloseTo(cellH, 5);
    });
  });

  // Mask rect count is progress-invariant here too — the SAME structural
  // discipline `'fade'` and the carve-out both carry.
  it('mask rect count is progress-invariant', () => {
    const countsAt = [0, 0.1, 0.5, 0.9, 1].map((p) => {
      const { container, unmount } = mountCheckerboard(
        { kind: 'checkerboard', frames: 15, gridSize: 4, squareAnimation: 'mask-scale' }, p,
      );
      const n = maskRectsOf(container).length;
      unmount();
      return n;
    });
    expect(countsAt).toEqual([16, 16, 16, 16, 16]);
  });
});
