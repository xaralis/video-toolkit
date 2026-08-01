/**
 * Checkerboard Transition
 *
 * Reveals the incoming clip through a grid of squares, over the outgoing one.
 * Classic video editing effect with modern flexibility.
 *
 * Best for: Playful reveals, retro aesthetics, creative transitions
 *
 * PHASE 5 TASK 4 — `composite` → `plan`, THE LAST COMPOSITE KIND. Stages 2-3
 * migrated nineteen of the catalog's twenty kinds; `checkerboard` was the one
 * kind design's own bucket-C carve-out names as "expressible with a
 * carve-out" rather than a plain lift. After this task every catalog kind
 * resolves to a `plan`; Stage 5 owns deleting the (now dead) composite arm.
 *
 * THE DEFAULT PATH — `squareAnimation: 'fade'` — is Task 0.1's SVG alpha
 * mask, moved onto the `plan` contract UNCHANGED in mechanism: one mounted
 * `to`, masked by an SVG `<mask>` whose `gridSize²` `<rect>`s carry the same
 * per-cell eased progress the old clipped-copy path computed
 * (`cellEasedProgress`, below). The only thing that changes is WHERE the
 * mask lives: `plan` cannot call hooks (`useVideoConfig`, and there is no
 * per-frame progress argument at all outside `plan()` itself), so the mask +
 * `<foreignObject>` JSX moves into a `LayerOp.wrap` — the ONE mechanism the
 * single-mount contract grants for "a shell no style can express" (an SVG
 * `mask`/`foreignObject` is exactly that). `CheckerboardMask` (below) is
 * that `wrap`: it reads the live progress off `useActiveTransitionProgress()`
 * (a hook, legal here because a `wrap` is a real mounted React component,
 * unlike `plan` itself — design §5), and `useVideoConfig()` for the
 * composition's pixel size, exactly as `burn.tsx`'s lifted `TransitionLayer`
 * does for the same job.
 *
 * `checkerboard` IS THE FIRST NATIVE NODE TO NEED A `wrap`. Every prior
 * `wrap`-carrying kind (`fade`, `dissolve`, `slide`, `flip`, `clock-wipe`,
 * `iris`, `burn`, `glitch`, `light-leak`, `whip-pan`, `zoom-through`,
 * `zoom-blur`) is a LIFTED one-sided `@remotion/transitions` presentation,
 * and the lift (`wrapRemotionPresentation`, `lib/render/at-cut-
 * transitions.tsx`) builds the `Wrap` component entirely inside `lib/render`
 * — a native node's OWN factory (this file, `lib/transitions/presentations`,
 * a layer BELOW `lib/render`) never had to reach `ActiveTransitionProgress`-
 * Context before. That context (and `useActiveTransitionProgress`) moved to
 * `lib/theming/transitions.ts` this task, for exactly that reason — see that
 * file's own doc comment on the context.
 *
 * THE ONE CARVE-OUT — `'scale'`/`'flip'` — apply a GEOMETRIC transform to the
 * media pixels per cell (`:209-215` in the pre-migration file), which a mask
 * changes alpha, not geometry, so it cannot reproduce. Design's own
 * recommendation (§3 row 20, §7 Stage 4), adopted as-is: ship OPTION 1, the
 * mechanical migration — `gridSize²` `ghosts` on `to`, pixel-exact, still 64
 * mounts. `ghosts` is a flat array of `React.CSSProperties`, one wrapping
 * `<div>` per entry around the SAME mounted clip (`LayerShell`'s own
 * rendering, `lib/render/video-track-plan.tsx`) — there is no room in that
 * contract for the OLD code's two-level nesting (an outer clipping/
 * transforming frame around an INNER oversized, shifted copy of `to`). Each
 * ghost is therefore built as ONE div's worth of CSS: `clip-path: inset(...)`
 * reveals just that cell's rectangle of the FULL, unscaled `to` (equivalent
 * to the old crop, since CSS `clip-path` geometry is computed in the
 * element's own untransformed local coordinate system per spec — the same
 * rectangle the old outer-div's `overflow: hidden` window revealed), and
 * `transform: scale(...)/rotateY(...)` with `transformOrigin` set to THAT
 * CELL's own centre (not the frame's) animates it exactly the way the old
 * outer div's `transformOrigin: 'center center'` animated ITS OWN box (which
 * WAS that cell's box). Per CSS's composition order, `clip-path` is computed
 * before `transform` is applied to the result, so scaling around the cell's
 * own centre scales the already-clipped rectangle around that same point —
 * the same visual chain the old nested-div technique produced through
 * layout instead of through `clip-path`. The REAL mounted `to` is hidden
 * (`opacity: 0`) so only the 64 ghosts are ever visible — exactly as before,
 * where the grid layer was the only picture drawn for this path.
 *
 * `'mask-scale'` — OPTION 2 (a new, differently-named `squareAnimation`
 * value; see `transition-schema.ts`'s own comment on it) — re-specifies
 * `'scale'`'s reveal as pure mask geometry instead: the mask `<rect>` GROWS
 * from a point at the cell's centre to the full cell, alpha fixed at 1
 * throughout. Same 1-mount path as `'fade'`. Visually SIMILAR (a per-cell
 * growing square, evoking `'scale'`) but NOT IDENTICAL — the media itself
 * never scales or rotates, only the window that reveals it grows — so it
 * keeps `'scale'`'s exact picture untouched and gives a brand a cheap,
 * knowingly-approximate alternative to opt into instead.
 *
 * MIGRATION NOTE for a brand author: `'mask-scale'` is new surface with no
 * existing consumer and no pixel-harness goldens (the harness renders only
 * the catalog's own default, `'fade'`) — it is covered by
 * `checkerboard-single-mount.test.tsx`'s own geometry tests, not by the
 * pixel gate. If you already use `squareAnimation: 'scale'` for its 1-mount
 * cost rather than its exact picture, `'mask-scale'` is the cheaper knob;
 * `'scale'`'s own picture never changes underneath you.
 */
import React, { useState } from 'react';
import { useVideoConfig, interpolate, Easing, random } from 'remotion';
import type {
  TransitionNode,
  TransitionPlanProps,
  TransitionComposite,
} from '../../theming/transitions';
import { useActiveTransitionProgress } from '../../theming/transitions';

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
  /** Individual square animation. Default: 'fade'.
   *  `'fade'`/`'mask-scale'` are 1-mount (SVG mask); `'scale'`/`'flip'` are
   *  the pixel-exact carve-out (`gridSize²` `ghosts`). */
  squareAnimation?: 'fade' | 'scale' | 'flip' | 'mask-scale';
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

/** ONE cell's eased progress — the shared arithmetic every path (the mask's
 *  `fillOpacity`/growth factor, and the carve-out's `opacity`/`scale`/
 *  `rotateY`) derives its per-cell value from. Extracted so no path can
 *  drift from another: a stagger or easing change here reaches all of them
 *  at once. Depends only on the cell's own `order` (its position in the
 *  reveal sequence), not its row/col — those already fed into computing
 *  `order`. */
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

interface Cell {
  row: number;
  col: number;
  order: number;
}

export const checkerboard = (props: CheckerboardProps = {}): TransitionNode => {
  const {
    gridSize = 8,
    pattern = 'diagonal',
    stagger = 0.6,
    squareAnimation = 'fade',
    easing = Easing.out(Easing.cubic),
  } = props;

  // BUILT ONCE PER RESOLVED NODE, not per `plan()` call or per frame — the
  // same "build-once-outside-`plan`" discipline every migrated kind in this
  // phase follows. `gridSize`/`pattern` are fixed for this node's whole
  // life, so the cell list never needs to be recomputed; a `useMemo` (which
  // needed a component to live in) is gone with the `composite` arm.
  const cells: Cell[] = [];
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      cells.push({ row, col, order: generateOrder(row, col, gridSize, pattern, SEED) });
    }
  }
  const cellSize = 100 / gridSize; // percent

  if (squareAnimation === 'fade' || squareAnimation === 'mask-scale') {
    // THE WRAP. Reads the live progress off context (never a prop — `wrap`'s
    // signature is fixed at `{active, children}`) and the composition's
    // pixel size off `useVideoConfig()` — both hooks, both legal here because
    // this is a real mounted component, not `plan` itself.
    //
    // PHASE 5 TASK 4, FIX ROUND 1 (opus review, Critical 2) — `uid` MOVED
    // FROM FACTORY TIME INTO `useState`, INSIDE THE COMPONENT. The first
    // submission minted `uid` once at factory time (`checkerboard(props)`),
    // reasoning (WRONGLY) that a fresh id per render would defeat the `wrap`
    // reference's required stability. That conflated the REFERENCE (which
    // `useState` never touches — the `CheckerboardMask` function identity is
    // exactly as stable either way) with the mask's own ID (which needs to be
    // unique per MOUNT, not per node). `transitionNodeFor` caches nodes per
    // (record, dims, palette), so any two boundaries with byte-identical
    // config share the SAME node and therefore the SAME `wrap` reference —
    // and `LayerShell` mounts a `wrap` for the item's WHOLE LIFE (Task 1.4),
    // not only inside its own window. Concretely: in the ordinary reel
    // `a --checkerboard--> b --checkerboard--> c` at the CATALOG DEFAULT
    // (byte-identical params on both cuts), during the b→c window BOTH `b`
    // (inactive, mounted life-long) and `c` (active) render simultaneously —
    // a factory-time id made them emit the SAME `<mask id="...">`, and
    // `url(#id)` resolves to whichever is first in document order (`b`'s,
    // inactive, fully open) — destroying `c`'s reveal in a plainly legal
    // reel with no unusual authoring. `useState(() => …)` mints once per
    // MOUNT (exactly `burn.tsx:40`/`glitch.tsx:46`'s own pattern for the
    // identical problem — neither is a fresh id per RENDER, both are stable
    // across a mount's whole life and unique to that mount), which is what
    // actually restores per-boundary uniqueness while the `wrap` reference
    // itself stays exactly as shared as the cache requires.
    //
    // NEUTRAL PROGRESS = 1 (fully revealed: every mask rect at its "cell
    // fully visible" state). This is `to`'s own "arrived" endpoint — the same
    // endpoint `wrapRemotionPresentation`'s ENTERING neutral uses — and it is
    // EXACT: at progress 1, `cellEasedProgress` clamps every cell's interval
    // to its right edge (`cellEnd <= 1` for every `order` in `[0,1]`), so
    // `easing(1)` for every stock easing function used here (a cubic
    // ease-out) lands on exactly `1`, meaning every rect's `fillOpacity` is
    // `1` (fully visible, mask is the identity) / every rect's dimensions
    // equal the full cell (mask-scale). A `to` this wrap is inactive for
    // therefore renders EXACTLY as if unmasked, whether that is because its
    // own boundary hasn't opened yet or has long since closed.
    const CheckerboardMask: React.FC<{ active: boolean; children: React.ReactNode }> = ({ active, children }) => {
      // Not `React.useId()`: it is unique only WITHIN one React root, so two
      // roots on one document (two `<Player>`s, or Studio's editor root
      // beside a preview root) could each mint the same id — the exact
      // collision class Task 0.1's own fix round 1 already corrected for
      // this kind once. `random(null)`'s output has no such root-scoping
      // caveat.
      const [uid] = useState(() => String(random(null)).slice(2, 10));
      const maskId = `checkerboard-mask-${uid}`;
      const live = useActiveTransitionProgress();
      const { width, height } = useVideoConfig();
      const progress = active ? live.progress : 1;
      return (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{ position: 'absolute', inset: 0 }}
        >
          <defs>
            <mask id={maskId} maskUnits="userSpaceOnUse">
              {/* No conditional mounting on progress: every cell stays in the
                  mask regardless of its own value, so element count is
                  progress-invariant — the structural-constancy discipline
                  Phase 5 depends on. */}
              {cells.map(({ row, col, order }) => {
                const eased = cellEasedProgress(order, progress, stagger, easing);
                const cellX = (col * cellSize * width) / 100;
                const cellY = (row * cellSize * height) / 100;
                const cellW = (cellSize * width) / 100;
                const cellH = (cellSize * height) / 100;
                if (squareAnimation === 'mask-scale') {
                  // OPTION 2 — the rect GROWS from a centred point to the
                  // full cell; alpha is always 1 (opaque wherever the rect
                  // covers). Visually similar to `'scale'`'s per-cell growth,
                  // not identical (the media never scales — only the mask's
                  // own reveal window does).
                  const w = cellW * eased;
                  const h = cellH * eased;
                  return (
                    <rect
                      key={`${row}-${col}`}
                      x={cellX + (cellW - w) / 2}
                      y={cellY + (cellH - h) / 2}
                      width={w}
                      height={h}
                      fill="white"
                    />
                  );
                }
                return (
                  <rect
                    key={`${row}-${col}`}
                    x={cellX}
                    y={cellY}
                    width={cellW}
                    height={cellH}
                    fill="white"
                    fillOpacity={eased}
                  />
                );
              })}
            </mask>
          </defs>
          <foreignObject x={0} y={0} width={width} height={height} mask={`url(#${maskId})`}>
            <div style={{ width: '100%', height: '100%', position: 'relative' }}>{children}</div>
          </foreignObject>
        </svg>
      );
    };

    // `from` needs no op at all: the outgoing clip is drawn plainly,
    // underneath, exactly as the pre-migration `fromLayer` was — and the
    // default `to`-over-`from` stacking (`LayerOp.z`'s own doc comment)
    // already puts the masked `to` on top of it, matching the old
    // single-`AbsoluteFill` composite's stacking without this node having to
    // say so. AT THE REEL'S EDGES the materialised `EdgePlate` reaches this
    // `wrap` through the SAME shell a real clip does (Task 1.4's contract),
    // so the grid still checkers OUT to the background at the trailing edge
    // and IN from it at the leading edge (Task 2.2), with no null-case
    // branching in this node at all.
    const plan = (): TransitionComposite => ({ to: { wrap: CheckerboardMask } });
    return { plan };
  }

  // `'scale'` / `'flip'` — THE ONE CARVE-OUT (option 1). `gridSize²`
  // `ghosts` on `to`, each a single wrapping `<div>` styled with `clip-path`
  // (the crop) + `transform`/`transformOrigin` (the per-cell geometric
  // animation) — see this file's own header comment for the equivalence
  // argument.
  //
  // THE REAL MOUNTED `to` MUST BE HIDDEN VIA `wrap`, NOT `style.opacity`.
  // PHASE 5 TASK 4, FIX ROUND 1 (opus review, Critical 1) — the first
  // submission set `to: { style: { opacity: 0 }, ghosts }`, which is WRONG:
  // `LayerShell` (`lib/render/video-track-plan.tsx`) puts `op.style` on the
  // SAME `<div>` that also holds the ghosts (`ghosts` are appended AS
  // CHILDREN of that div, not as siblings of it) — CSS `opacity` is a GROUP
  // property, so `opacity: 0` on that shell makes the WHOLE SUBTREE,
  // including all `gridSize²` ghosts, unpaintable. The measured effect: a
  // `'scale'`/`'flip'` checkerboard drew NOTHING of the incoming clip for the
  // entire window and then hard-cut — the exact opposite of this carve-out's
  // whole purpose, and invisible to every structural assertion this task
  // shipped (they count elements or read one element's own `style`, never an
  // ancestor-multiplied EFFECTIVE opacity).
  //
  // `wrap` only ever wraps `children` (the real mount), never the ghosts
  // (`LayerShell` appends ghosts as siblings of `{Wrap ? <Wrap>… : children}`,
  // not inside it) — so hiding the real mount through `wrap` cannot touch the
  // ghosts at all, structurally. Built ONCE, outside `plan`, same discipline
  // as `CheckerboardMask` above: a stable reference for the node's whole
  // life. `active` is exactly what "hide only while this boundary owns the
  // frame" needs — while inactive (well outside the window, or before this
  // kind is even live) the real mount renders unchanged, which is the
  // `wrap` contract's own "must be inert when active is false" rule.
  const HideRealWhileActive: React.FC<{ active: boolean; children: React.ReactNode }> = ({ active, children }) => (
    <div style={{ position: 'absolute', inset: 0, opacity: active ? 0 : 1 }}>{children}</div>
  );

  const plan = ({ progress }: TransitionPlanProps): TransitionComposite => {
    const ghosts = cells.map(({ row, col, order }) => {
      const eased = cellEasedProgress(order, progress, stagger, easing);

      let opacity = 1;
      let scale = 1;
      let rotateY = 0;
      switch (squareAnimation) {
        case 'scale':
          scale = eased;
          opacity = eased > 0 ? 1 : 0;
          break;
        case 'flip':
          rotateY = interpolate(eased, [0, 1], [90, 0]);
          opacity = eased > 0.1 ? 1 : 0;
          break;
      }

      const top = row * cellSize;
      const left = col * cellSize;
      const right = 100 - (col + 1) * cellSize;
      const bottom = 100 - (row + 1) * cellSize;
      const cx = left + cellSize / 2;
      const cy = top + cellSize / 2;

      return {
        position: 'absolute',
        inset: 0,
        clipPath: `inset(${top}% ${right}% ${bottom}% ${left}%)`,
        transformOrigin: `${cx}% ${cy}%`,
        opacity,
        transform: `scale(${scale}) perspective(500px) rotateY(${rotateY}deg)`,
      } as React.CSSProperties;
    });

    return {
      to: { wrap: HideRealWhileActive, ghosts },
    };
  };

  return { plan };
};
