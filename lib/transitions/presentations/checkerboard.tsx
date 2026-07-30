/**
 * Checkerboard Transition
 *
 * Reveals the incoming clip through a grid of squares, over the outgoing one.
 * Classic video editing effect with modern flexibility.
 *
 * Best for: Playful reveals, retro aesthetics, creative transitions
 *
 * A NATIVE TWO-INPUT NODE since Phase 4 Task 2.1. It used to branch on
 * `presentationDirection` and have TWO implementations: the entering one
 * clipped the incoming clip into each cell, while the exiting one drew the same
 * cells EMPTY (no content, no background) over an untouched base layer — so a
 * `checkerboard` used as a `transitionOut` had no visible effect whatsoever,
 * and at a cut the two layers together laid out the grid twice.
 *
 * There is ONE implementation now: B clipped into cells, over an intact A.
 * The direction branch is gone, and with it the empty cells.
 *
 * Task 2.1 answered "no incoming clip" (a reel's TRAILING edge) with "draw no
 * cells", which left `checkerboard` doing nothing as a `transitionOut` — the
 * eighth member of the exiting-no-op family the model had no answer for yet.
 * Task 2.2 gives it one: a missing input IS the composition background
 * (`edgeInput`), so the grid checkers OUT to the brand's background exactly as
 * it checkers IN from it at the leading edge. No null case survives here.
 *
 * SINGLE MOUNT FOR THE DEFAULT PATH (Phase 5 Task 0.1). The default
 * `squareAnimation: 'fade'` used to mount `to` once PER CELL — `gridSize²`
 * times, 64 at the default 8×8 grid, by far the worst mount count in the
 * catalog. `'fade'`'s only per-cell effect is alpha with an identity
 * transform, which an SVG `<mask>` expresses directly: one mounted `to`,
 * masked by a `<mask>` holding `gridSize²` `<rect>`s whose `fillOpacity`
 * carries the same per-cell eased progress the cell path always computed.
 * `'scale'` and `'flip'` apply a GEOMETRIC transform per cell (not just
 * alpha), which a mask cannot reproduce — they keep the original clipped-copy
 * path unchanged. The per-cell ordering/stagger/easing arithmetic is shared
 * between both paths via `cellEasedProgress` below, so they cannot drift.
 */
import React, { useMemo, useState } from 'react';
import { AbsoluteFill, interpolate, Easing, random } from 'remotion';
import type { TransitionNode, TransitionNodeProps } from '../../theming/transitions';
import { edgeInput } from '../edge-plate';

export type CheckerboardPattern =
  | 'sequential'    // Left-to-right, top-to-bottom
  | 'random'        // Randomized order
  | 'diagonal'      // Diagonal wave
  | 'alternating'   // True checkerboard - alternating squares first
  | 'spiral'        // From center outward in spiral
  | 'rows'          // Row by row
  | 'columns'       // Column by column
  | 'center-out'    // Radial from center
  | 'corners-in';   // From all corners to center

export type CheckerboardProps = {
  /** Grid size (e.g., 8 = 8x8 grid). Default: 8 */
  gridSize?: number;
  /** Reveal pattern. Default: 'diagonal' */
  pattern?: CheckerboardPattern;
  /** Stagger amount - how spread out the animation is (0-1). Default: 0.6 */
  stagger?: number;
  /** Individual square animation: 'fade' | 'scale' | 'flip'. Default: 'fade' */
  squareAnimation?: 'fade' | 'scale' | 'flip';
  /** Easing for individual squares. Default: ease-out */
  easing?: (t: number) => number;
};

// Generate order indices for each pattern
const generateOrder = (
  row: number,
  col: number,
  gridSize: number,
  pattern: CheckerboardPattern,
  seed: number
): number => {
  const total = gridSize * gridSize;
  const index = row * gridSize + col;
  const centerRow = (gridSize - 1) / 2;
  const centerCol = (gridSize - 1) / 2;

  switch (pattern) {
    case 'sequential':
      return index / total;

    case 'random':
      // Seeded pseudo-random based on position
      const hash = Math.sin(seed + index * 9999) * 10000;
      return (hash - Math.floor(hash));

    case 'diagonal':
      // Diagonal wave from top-left
      return (row + col) / (gridSize * 2 - 2);

    case 'alternating':
      // True checkerboard: alternating squares first (0-0.5), then others (0.5-1)
      const isAlternate = (row + col) % 2 === 0;
      const baseOrder = (row + col) / (gridSize * 2 - 2);
      return isAlternate ? baseOrder * 0.5 : 0.5 + baseOrder * 0.5;

    case 'spiral':
      // Spiral from center outward
      const distFromCenter = Math.max(
        Math.abs(row - centerRow),
        Math.abs(col - centerCol)
      );
      const maxDist = Math.max(centerRow, centerCol);
      const ring = distFromCenter / maxDist;
      // Add angle component for spiral effect
      const angle = Math.atan2(row - centerRow, col - centerCol);
      const normalizedAngle = (angle + Math.PI) / (2 * Math.PI);
      return ring * 0.8 + normalizedAngle * 0.2;

    case 'rows':
      return row / (gridSize - 1);

    case 'columns':
      return col / (gridSize - 1);

    case 'center-out':
      // Radial from center
      const dist = Math.sqrt(
        Math.pow(row - centerRow, 2) + Math.pow(col - centerCol, 2)
      );
      const maxRadius = Math.sqrt(2) * gridSize / 2;
      return dist / maxRadius;

    case 'corners-in':
      // From corners to center (inverse of center-out)
      const distCorners = Math.sqrt(
        Math.pow(row - centerRow, 2) + Math.pow(col - centerCol, 2)
      );
      const maxRadiusCorners = Math.sqrt(2) * gridSize / 2;
      return 1 - (distCorners / maxRadiusCorners);

    default:
      return index / total;
  }
};

// Stable seed for the `random` pattern — the reveal order must not change
// between frames of one transition.
const SEED = 12345;

/** ONE cell's eased progress — the shared arithmetic both the mask path
 *  (`fillOpacity`) and the clipped-copy path (`opacity`/`scale`/`rotateY`)
 *  derive their per-cell value from. Extracted so the two paths cannot drift:
 *  a stagger or easing change here reaches both at once. Depends only on the
 *  cell's own `order` (its position in the reveal sequence), not its row/col —
 *  those already fed into computing `order`. */
function cellEasedProgress(
  order: number,
  progress: number,
  stagger: number,
  easing: (t: number) => number,
): number {
  const cellStart = order * stagger;
  const cellEnd = cellStart + (1 - stagger);
  const cellProgress = interpolate(progress, [cellStart, cellEnd], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return easing(cellProgress);
}

export const checkerboard = (props: CheckerboardProps = {}): TransitionNode => {
  const {
    gridSize = 8,
    pattern = 'diagonal',
    stagger = 0.6,
    squareAnimation = 'fade',
    easing = Easing.out(Easing.cubic),
  } = props;

  const composite: React.FC<TransitionNodeProps> = ({ from, to, progress, background, width, height }) => {
    // Generate grid cells
    const cells = useMemo(() => {
      const result: Array<{
        row: number;
        col: number;
        order: number;
      }> = [];

      for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
          result.push({
            row,
            col,
            order: generateOrder(row, col, gridSize, pattern, SEED),
          });
        }
      }

      return result;
    }, [gridSize, pattern]);

    // Calculate cell size as percentage
    const cellSize = 100 / gridSize;

    // Stable across this instance's whole mounted lifetime (every frame of the
    // one boundary), unique per instance — two concurrent checkerboards must
    // not collide. NOT `React.useId()`: it is unique only WITHIN one React
    // root (absent an `identifierPrefix`), so two roots on the same document
    // — e.g. two Player instances, or Studio's editor root alongside a
    // preview root — both start numbering from zero and can mint the same
    // `checkerboard-mask-r0`, which `url(#…)` then resolves to whichever
    // copy is first in document order: the WRONG mask. That collision is
    // exactly the defect class requirement 3 exists to prevent. `burn.tsx`
    // and `glitch.tsx` already solve "one random id per mounted instance,
    // stable across that instance's frames" for this same job — reused
    // verbatim rather than a third pattern.
    const [uid] = useState(() => String(random(null)).slice(2, 10));
    const maskId = `checkerboard-mask-${uid}`;

    // The OUTGOING clip, drawn once and whole, beneath the grid/mask in both
    // paths below. At the reel's LEADING edge there is none, and it resolves
    // to the composition background (Task 2.2).
    const fromLayer = <AbsoluteFill>{edgeInput(from, background)}</AbsoluteFill>;

    if (squareAnimation === 'fade') {
      // SINGLE MOUNT: one `to`, masked by an SVG `<mask>` whose `gridSize²`
      // `<rect>`s carry the same per-cell eased progress the clipped-copy path
      // computes, via the shared `cellEasedProgress` helper. AT THE REEL'S
      // TRAILING EDGE `to` is the composition background (Task 2.2's fix,
      // preserved exactly): the masked layer is that plate, so the grid still
      // checkers OUT to it.
      //
      // A CSS `mask: url(#id)` applied directly to the HTML layer (percentage
      // rect geometry, no `maskUnits`/`maskContentUnits`) was tried first and
      // measured BROKEN under the real renderer — `to` came out fully
      // invisible at every progress, not just drifted (see task-0.1-report.md
      // for the pixel evidence). `burn.tsx` already solves "mask arbitrary
      // HTML content" correctly in this exact pipeline via an SVG-native
      // `<foreignObject mask="url(#…)">` with `maskUnits="userSpaceOnUse"`
      // and pixel geometry — reused verbatim here rather than re-deriving a
      // second working technique.
      return (
        <AbsoluteFill>
          {fromLayer}
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            style={{ position: 'absolute', inset: 0 }}
          >
            <defs>
              <mask id={maskId} maskUnits="userSpaceOnUse">
                {/* No conditional mounting on progress: every cell stays in the
                    mask regardless of its `fillOpacity`, so element count is
                    progress-invariant — the structural-constancy discipline
                    Phase 5 depends on. */}
                {cells.map(({ row, col, order }) => (
                  <rect
                    key={`${row}-${col}`}
                    x={(col * cellSize * width) / 100}
                    y={(row * cellSize * height) / 100}
                    width={(cellSize * width) / 100}
                    height={(cellSize * height) / 100}
                    fill="white"
                    fillOpacity={cellEasedProgress(order, progress, stagger, easing)}
                  />
                ))}
              </mask>
            </defs>
            <foreignObject x={0} y={0} width={width} height={height} mask={`url(#${maskId})`}>
              <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                {edgeInput(to, background)}
              </div>
            </foreignObject>
          </svg>
        </AbsoluteFill>
      );
    }

    // `'scale'` and `'flip'` — THE ONE CARVE-OUT. Both apply a geometric
    // transform to the media pixels per cell, not just alpha; a mask changes
    // alpha, not geometry, so they are not reproducible by masking and keep
    // the original per-cell clipped-copy path, unchanged in shape.
    return (
      <AbsoluteFill>
        {fromLayer}

        {/* Grid layer — each cell carries the INCOMING clip, clipped to itself.
            AT THE REEL'S TRAILING EDGE that clip is the composition background:
            Task 2.1 drew no grid at all there, which made `checkerboard` the
            eighth kind that did nothing as a `transitionOut`. It now checkers
            OUT to the background, the same answer the seven lifted kinds get —
            so there is no direction branch and no null case left here. */}
        <AbsoluteFill style={{ overflow: 'hidden' }}>
          {cells.map(({ row, col, order }) => {
            const easedProgress = cellEasedProgress(order, progress, stagger, easing);

            // Calculate animation values based on type
            let opacity = 1;
            let scale = 1;
            let rotateY = 0;

            switch (squareAnimation) {
              case 'scale':
                scale = easedProgress;
                opacity = easedProgress > 0 ? 1 : 0;
                break;
              case 'flip':
                rotateY = interpolate(easedProgress, [0, 1], [90, 0]);
                opacity = easedProgress > 0.1 ? 1 : 0;
                break;
            }

            // No direction branch. The old `!isEntering` inverse — which flipped
            // opacity, scale and rotation on a cell that carried no content — is
            // gone with the second implementation it belonged to.
            return (
              <div
                key={`${row}-${col}`}
                style={{
                  position: 'absolute',
                  left: `${col * cellSize}%`,
                  top: `${row * cellSize}%`,
                  width: `${cellSize}%`,
                  height: `${cellSize}%`,
                  overflow: 'hidden',
                  opacity,
                  transform: `scale(${scale}) perspective(500px) rotateY(${rotateY}deg)`,
                  transformOrigin: 'center center',
                }}
              >
                {/* Clip the incoming clip to this cell */}
                <div
                  style={{
                    position: 'absolute',
                    left: `${-col * 100}%`,
                    top: `${-row * 100}%`,
                    width: `${gridSize * 100}%`,
                    height: `${gridSize * 100}%`,
                  }}
                >
                  {edgeInput(to, background)}
                </div>
              </div>
            );
          })}
        </AbsoluteFill>
      </AbsoluteFill>
    );
  };

  return { composite };
};
