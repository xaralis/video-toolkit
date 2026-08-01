/**
 * Pixelate Transition
 *
 * Digital pixelation/mosaic effect that dissolves one clip into the next
 * through blocks. Features randomized block reveals and glitchy artifacts.
 *
 * Best for: Tech themes, retro/gaming content, digital transformations
 *
 * A NATIVE TWO-INPUT NODE since Phase 4 Task 2.1. The defect it carried was one
 * line: the root `AbsoluteFill` was painted OPAQUE BLACK unconditionally, in
 * both directions and at every progress. That made sense only for a one-sided
 * presentation asked to draw "the frame" with nothing but its own clip in hand
 * — at a cut it meant the transition's very first frame was FULL BLACK, the
 * outgoing clip vanishing instantly instead of dissolving.
 *
 * With two inputs the opaque root has no meaning at all: the outgoing clip is
 * an INPUT, drawn beneath the incoming one, so there is nothing to fill in for.
 * The mosaic, grid, glitch slices, scanlines, vignette and noise are unchanged
 * — they were never the problem.
 *
 * PHASE 5 TASK 2.2 — `composite` → `plan`. Both inputs are ALREADY MOUNTED; the
 * node styles them instead of instantiating them. The SAME filter/transform
 * string applies to BOTH `LayerOp.style`s — differing only in `opacity`,
 * exactly as `plate(from, fromOpacity)`/`plate(to, toOpacity)` gave both sides
 * identical treatment before, differing only in the opacity argument. The grid
 * cells, glitch slices, RGB-split ghosts, scanlines, vignette and noise overlay
 * are media-free, so they become `over` PLATEs (timeline siblings, never a
 * second mount of either clip) instead of JSX children of the old composite.
 * `useMemo` is GONE: a `plan` is a plain function, not a component, and cannot
 * call hooks — every value below is recomputed from `progress` on each call,
 * which is exactly as often as the old memoized values were (once per frame).
 */
import { interpolate, random } from 'remotion';
import type { TransitionNode, TransitionPlanProps, TransitionComposite, PlateLayer } from '../../theming/transitions';
import type { CSSProperties, ReactNode } from 'react';

export type PixelateProps = {
  /** Maximum block size at peak pixelation (pixels). Default: 60 */
  maxBlockSize?: number;
  /** Grid dimensions (e.g., 12 = 12x12 grid). Default: 12 */
  gridSize?: number;
  /** Add scanline overlay for CRT effect. Default: true */
  scanlines?: boolean;
  /** Add glitch artifacts during transition. Default: true */
  glitchArtifacts?: boolean;
  /** Randomness of block reveal (0-1). Default: 0.8 */
  randomness?: number;
};

// Generate pseudo-random value for a grid cell
const getCellRandom = (row: number, col: number, seed: number): number => {
  return random(`cell-${row}-${col}-${seed}`);
};

const SEED = 42;

export const pixelate = (props: PixelateProps = {}): TransitionNode => {
  const {
    maxBlockSize = 60,
    gridSize = 12,
    scanlines = true,
    glitchArtifacts = true,
    randomness = 0.8,
  } = props;

  const plan = ({ progress, from, to }: TransitionPlanProps): TransitionComposite => {
    // Pixelation intensity peaks in the middle
    const pixelIntensity = interpolate(progress, [0, 0.4, 0.6, 1], [0, 1, 1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });

    // Block size grows then shrinks
    const blockSize = Math.max(8, Math.round(maxBlockSize * pixelIntensity));

    // Heavy blur for mosaic effect
    const blurAmount = pixelIntensity * (maxBlockSize / 2.5);

    // Crossfade between the two inputs — the SAME two curves the composite
    // form used, applied to the two clips' `LayerOp.style.opacity` rather than
    // to a JSX plate's `opacity` prop.
    //
    // FIX ROUND (Phase 5 Task 2.2) — a REEL EDGE forces its curve to 0,
    // regardless of progress. `from === null` / `to === null` (design §2.5)
    // is a node's ONLY way to see that a side is not a real clip but a
    // materialised `EdgePlate` (a flat background-colour rectangle) core
    // mounts in its place. This node's crossfade curves assume a REAL clip is
    // crossfading in/out on both sides — `toOpacity` reaches 1 by progress
    // 0.4, which is exactly right when `to` is real content arriving, but at
    // a TRAILING edge (`to === null`) that curve is applied to the flat edge
    // plate instead, and because a trailing edge's materialised `to` plate is
    // stacked ABOVE the outgoing clip (`video-track.tsx`), an opaque flat
    // rectangle by progress 0.4 curtains over the real `from` clip for the
    // entire back half of the transition — a defect the OLD `composite` arm
    // never had, because it rendered NOTHING at all for a null side
    // (`{to === null ? null : plate(to, toOpacity)}`), leaving `from` to fade
    // out on its own curve and reveal the true background only once it
    // actually reached opacity 0. Forcing the missing side's curve to a flat
    // 0 restores that exact behaviour: a null side is never drawn, at any
    // progress, matching the old composite bit for bit. The leading-edge
    // case (`from === null`) is not visibly broken today — its materialised
    // plate sits BENEATH the incoming clip — but is fixed the same way for
    // the same underlying reason (a null side has no content to crossfade),
    // rather than leaving it correct only by accident of z-order.
    const fromOpacity = from === null
      ? 0
      : interpolate(progress, [0, 0.6, 1], [1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const toOpacity = to === null
      ? 0
      : interpolate(progress, [0, 0.4, 1], [0, 1, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

    const shouldApplyEffect = pixelIntensity > 0.05;

    // THE SAME filter/transform STRING for both sides — the mechanism §2.4
    // prescribes: "the same filter/transform string on both LayerOp.styles,
    // differing only in opacity".
    const sharedStyle: CSSProperties = {
      filter: shouldApplyEffect
        ? `blur(${blurAmount}px) saturate(140%) contrast(120%)`
        : undefined,
    };

    // Glitch offset that changes during transition
    let glitchOffset = { x: 0, y: 0 };
    if (glitchArtifacts && pixelIntensity >= 0.3) {
      const intensity = (pixelIntensity - 0.3) / 0.7;
      glitchOffset = {
        x: Math.sin(progress * Math.PI * 8) * intensity * 15,
        y: Math.cos(progress * Math.PI * 6) * intensity * 8,
      };
    }
    if (glitchArtifacts && pixelIntensity > 0.5) {
      sharedStyle.transform = `translate(${glitchOffset.x}px, ${glitchOffset.y}px)`;
    }

    const layers: PlateLayer[] = [];

    // Random block grid overlay
    if (shouldApplyEffect) {
      const cellSize = 100 / gridSize;
      const cells: ReactNode[] = [];
      for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
          const baseOrder = (row + col) / (gridSize * 2);
          const randOffset = getCellRandom(row, col, SEED) * randomness;
          const revealOrder = baseOrder * (1 - randomness) + randOffset;
          const hueShift = getCellRandom(row, col, SEED + 1) * 30 - 15;
          const cellProgress = interpolate(
            pixelIntensity,
            [revealOrder * 0.5, revealOrder * 0.5 + 0.5],
            [0, 1],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
          );
          if (cellProgress < 0.1) continue;
          const cellOpacity = cellProgress * 0.7;
          cells.push(
            // eslint-disable-next-line react/no-array-index-key
            <div
              key={`${row}-${col}`}
              style={{
                position: 'absolute',
                left: `${col * cellSize}%`,
                top: `${row * cellSize}%`,
                width: `${cellSize}%`,
                height: `${cellSize}%`,
                backgroundColor: `hsla(${hueShift + 180}, 50%, 50%, ${cellOpacity * 0.15})`,
                border: `1px solid rgba(0, 0, 0, ${cellOpacity})`,
                boxSizing: 'border-box',
              }}
            />,
          );
        }
      }
      layers.push({ key: 'cells', z: 'over', style: { pointerEvents: 'none' }, content: cells });
    }

    // Pronounced grid lines
    if (shouldApplyEffect && blockSize >= 8) {
      layers.push({
        key: 'grid-lines',
        z: 'over',
        style: {
          opacity: pixelIntensity * 0.8,
          backgroundImage: `
            linear-gradient(to right, rgba(0, 0, 0, 0.9) 2px, transparent 2px),
            linear-gradient(to bottom, rgba(0, 0, 0, 0.9) 2px, transparent 2px)
          `,
          backgroundSize: `${blockSize}px ${blockSize}px`,
          pointerEvents: 'none',
        },
      });
    }

    // Glitch slices
    if (glitchArtifacts && pixelIntensity > 0.4) {
      const sliceIntensity = (pixelIntensity - 0.4) / 0.6;
      const slices = [0.15, 0.35, 0.55, 0.75, 0.9].map((pos, i) => {
        const offset = Math.sin(progress * Math.PI * (4 + i)) * sliceIntensity * 20;
        const height = 3 + random(`slice-h-${i}`) * 8;
        return (
          // eslint-disable-next-line react/no-array-index-key
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: `${pos * 100}%`,
              height: `${height}%`,
              transform: `translateX(${offset}px)`,
              background: `linear-gradient(90deg,
                transparent 0%,
                rgba(255, 0, 128, ${sliceIntensity * 0.2}) 20%,
                rgba(0, 255, 255, ${sliceIntensity * 0.2}) 80%,
                transparent 100%
              )`,
              mixBlendMode: 'screen',
              pointerEvents: 'none',
            }}
          />
        );
      });
      layers.push({ key: 'glitch-slices', z: 'over', style: { pointerEvents: 'none' }, content: slices });
    }

    // RGB split effect — two separate plates, matching the two separate
    // `AbsoluteFill`s the composite form drew.
    if (glitchArtifacts && pixelIntensity > 0.5) {
      layers.push({
        key: 'rgb-split-red',
        z: 'over',
        style: {
          opacity: (pixelIntensity - 0.5) * 0.4,
          transform: `translateX(${pixelIntensity * 8}px)`,
          filter: `blur(${blurAmount}px)`,
          mixBlendMode: 'screen',
        },
        content: <div style={{ width: '100%', height: '100%', backgroundColor: 'rgba(255, 0, 0, 0.4)' }} />,
      });
      layers.push({
        key: 'rgb-split-cyan',
        z: 'over',
        style: {
          opacity: (pixelIntensity - 0.5) * 0.4,
          transform: `translateX(${-pixelIntensity * 8}px)`,
          filter: `blur(${blurAmount}px)`,
          mixBlendMode: 'screen',
        },
        content: <div style={{ width: '100%', height: '100%', backgroundColor: 'rgba(0, 255, 255, 0.4)' }} />,
      });
    }

    // Heavy scanlines
    if (scanlines && pixelIntensity > 0.15) {
      layers.push({
        key: 'scanlines',
        z: 'over',
        style: {
          opacity: pixelIntensity * 0.5,
          backgroundImage: `repeating-linear-gradient(
            0deg,
            transparent 0px,
            transparent 3px,
            rgba(0, 0, 0, 0.6) 3px,
            rgba(0, 0, 0, 0.6) 6px
          )`,
          pointerEvents: 'none',
        },
      });
    }

    // Vignette
    if (pixelIntensity > 0.2) {
      layers.push({
        key: 'vignette',
        z: 'over',
        style: {
          opacity: pixelIntensity * 0.7,
          background: `radial-gradient(
            ellipse at center,
            transparent 30%,
            rgba(0, 0, 0, 0.6) 100%
          )`,
          pointerEvents: 'none',
        },
      });
    }

    // Noise overlay
    if (pixelIntensity > 0.3) {
      layers.push({
        key: 'noise',
        z: 'over',
        style: {
          opacity: pixelIntensity * 0.15,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          pointerEvents: 'none',
          mixBlendMode: 'overlay',
        },
      });
    }

    return {
      // NO `backgroundColor` here. The opaque black root was the defect: with
      // two inputs there is nothing for it to stand in for, and painting it
      // would occlude the outgoing clip sitting right beneath.
      from: { style: { ...sharedStyle, opacity: fromOpacity } },
      to: { style: { ...sharedStyle, opacity: toOpacity } },
      layers,
    };
  };

  return { plan };
};
