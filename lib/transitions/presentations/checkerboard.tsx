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
 * The direction branch is gone, and with it the empty cells — a cell exists
 * only to carry the incoming clip, so when there is no incoming clip (a reel's
 * trailing edge) no cells are drawn at all.
 */
import React, { useMemo } from 'react';
import { AbsoluteFill, interpolate, Easing } from 'remotion';
import type { TransitionNode, TransitionNodeProps } from '../../theming/transitions';

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

export const checkerboard = (props: CheckerboardProps = {}): TransitionNode => {
  const {
    gridSize = 8,
    pattern = 'diagonal',
    stagger = 0.6,
    squareAnimation = 'fade',
    easing = Easing.out(Easing.cubic),
  } = props;

  const composite: React.FC<TransitionNodeProps> = ({ from, to, progress }) => {
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

    return (
      <AbsoluteFill>
        {/* The OUTGOING clip, drawn once and whole, beneath the grid. */}
        <AbsoluteFill>{from}</AbsoluteFill>

        {/* Grid layer — each cell carries the INCOMING clip, clipped to itself.
            A cell has no meaning without an incoming clip, so at a reel's
            trailing edge there is no grid rather than a grid of empty boxes. */}
        {to === null ? null : (
          <AbsoluteFill style={{ overflow: 'hidden' }}>
            {cells.map(({ row, col, order }) => {
              // Calculate when this cell should animate
              // With stagger, cells animate in sequence
              // stagger=0 means all at once, stagger=1 means fully sequential
              const cellStart = order * stagger;
              const cellEnd = cellStart + (1 - stagger);

              // Individual cell progress
              const cellProgress = interpolate(
                progress,
                [cellStart, cellEnd],
                [0, 1],
                {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                }
              );

              const easedProgress = easing(cellProgress);

              // Calculate animation values based on type
              let opacity = 1;
              let scale = 1;
              let rotateY = 0;

              switch (squareAnimation) {
                case 'fade':
                  opacity = easedProgress;
                  break;
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
                    {to}
                  </div>
                </div>
              );
            })}
          </AbsoluteFill>
        )}
      </AbsoluteFill>
    );
  };

  return { composite };
};
