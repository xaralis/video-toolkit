/**
 * RGB Split Transition
 *
 * Chromatic aberration effect that creates color fringing
 * with directional displacement. Creates a modern tech aesthetic
 * reminiscent of CRT displays and analog video glitches.
 *
 * Best for: Tech products, modern branding, energetic transitions
 *
 * PHASE 5 TASK 3 — one-sided `TransitionPresentation` → NATIVE `plan` node.
 * `rgb-split` is the design's `ghosts` case (design §3 row 6, §7 Stage 3): the
 * one kind whose whole migration IS `ghosts`, not `style`/`wrap`.
 *
 * BEFORE: a one-sided presentation, lifted TWICE by `fromRemotionPresentation`
 * (once per direction) — each call independently drew a main content layer
 * plus a red-shifted and a cyan-shifted ghost, each a full re-render of
 * `children`. That is 3 mounts per call × 2 calls = 6 media elements per cut.
 * §3 row 6 is explicit that reducing that to 2 is a SEPARATE, optional task
 * (an SVG-filter rewrite, the shape `scanline-glitch.tsx` uses) — out of this
 * task's scope. What this task does is express the SAME 6-mount shape through
 * the single-mount contract instead of a doubled JSX lift: the main layer
 * becomes `from`/`to` `LayerOp.style`, and the two ghosts per side become
 * `LayerOp.ghosts` — 2 entries on `from`, 2 on `to`, 4 ghost mounts + 2 main
 * mounts = 6, unchanged from before.
 *
 * THE GUARD → OPACITY CHANGE (design's `ghosts` contract, `lib/theming/
 * transitions.ts`'s `LayerOp.ghosts` doc comment: "`ghosts.length` MUST NOT
 * vary with `progress`"). The old `splitIntensity > 0.05` conditions on the
 * two ghost `AbsoluteFill`s (`:72`, `:86` in the pre-migration file) mounted or
 * unmounted them entirely — a conditional MOUNT, which under this contract is
 * exactly the remount defect the whole phase removes. Both ghosts are now
 * ALWAYS present (2 entries, every progress) and the old threshold becomes
 * `opacity: 0` instead: below the threshold a ghost is still mounted, just
 * fully transparent. Max ghost opacity AT that threshold is `0.05 × 0.7 =
 * 0.035` — visually negligible, but real, so THE PICTURE MOVES SLIGHTLY AT
 * THAT ONE THRESHOLD, by design (this is one of Stage 3's budgeted, deliberate
 * re-baselines, not a regression).
 *
 * THE SCANLINE OVERLAY IS CONSOLIDATED TO ONE PLATE, not two. The old
 * component rendered it as a plain, direction-independent `AbsoluteFill`
 * (`splitIntensity` depends only on `progress`, never on
 * `presentationDirection`) — but because `fromRemotionPresentation` called the
 * SAME component twice (once per direction), the overlay was drawn TWICE,
 * stacked, an accident of the double-lift mechanism rather than an authored
 * choice (nothing in the original source comments argues for a doubled
 * overlay, and two identical semi-transparent layers compositing over each
 * other is measurably darker than one — an artifact, not an effect). This is
 * genuinely one media-free `over` plate now, which is also a moved-picture
 * cause distinct from the ghost-opacity threshold above — see
 * task-3-report.md for the golden-by-golden attribution.
 *
 * REEL EDGE: NEITHER curve is forced to a flat 0 at a null side, unlike
 * `pixelate`. `pixelate`'s defect was its `to`-opacity curve reaching 1 EARLY
 * (by progress 0.4) and staying there, so a materialised edge plate went
 * fully opaque and curtained over still-fading real content for the back half
 * of the window. `rgb-split`'s two curves are LINEAR crossfades
 * (`interpolate(progress, [0,1], [1,0])` / `[0,1]`) that only reach their
 * extreme (0 or 1) exactly AT the window's own edge (progress 0 or 1) — the
 * same shape `wipe`'s complementary sheet has, and `scanline-glitch`'s blend
 * (see that file). A null side's materialised `EdgePlate` therefore only ever
 * reaches full opacity at the instant the boundary itself completes — which is
 * correct (that IS the cut), not premature. No forcing needed; argued from
 * this kind's own arithmetic, not copied from `wipe`.
 */
import { interpolate } from 'remotion';
import type {
  TransitionNode,
  TransitionPlanProps,
  TransitionComposite,
  PlateLayer,
} from '../../theming/transitions';
import type { CSSProperties } from 'react';

export type RgbSplitProps = {
  /** Direction of the split: 'horizontal' | 'vertical' | 'diagonal'. Default: 'horizontal' */
  direction?: 'horizontal' | 'vertical' | 'diagonal';
  /** Maximum pixel displacement. Default: 50 */
  displacement?: number;
};

export const rgbSplit = (props: RgbSplitProps = {}): TransitionNode => {
  const direction = props.direction ?? 'horizontal';
  const displacement = props.displacement ?? 50;

  const getOffset = (splitIntensity: number, multiplier: number): { x: number; y: number } => {
    const offset = displacement * splitIntensity * multiplier;
    switch (direction) {
      case 'vertical':
        return { x: 0, y: offset };
      case 'diagonal':
        return { x: offset * 0.7, y: offset * 0.7 };
      case 'horizontal':
      default:
        return { x: offset, y: 0 };
    }
  };

  /** One ghost's style — the SAME `saturate(2) hue-rotate(Ndeg) brightness(1.2)`
   *  + `screen` blend the pre-migration component applied, with the
   *  conditional MOUNT replaced by `opacity: 0` below the threshold (see the
   *  module doc comment). `sideOpacity` is that side's own main-layer opacity
   *  (`fromOpacity`/`toOpacity`), so a ghost fades in lockstep with its side's
   *  own crossfade, exactly as `opacity * ghostOpacity` did before. */
  const ghostStyle = (
    splitIntensity: number,
    sideOpacity: number,
    offset: { x: number; y: number },
    hueRotateDeg: number,
  ): CSSProperties => {
    const ghostOpacity = splitIntensity * 0.7;
    return {
      opacity: splitIntensity > 0.05 ? sideOpacity * ghostOpacity : 0,
      transform: `translate(${offset.x}px, ${offset.y}px)`,
      filter: `saturate(2) hue-rotate(${hueRotateDeg}deg) brightness(1.2)`,
      mixBlendMode: 'screen',
    };
  };

  const plan = ({ progress }: TransitionPlanProps): TransitionComposite => {
    const splitIntensity = interpolate(progress, [0, 0.5, 1], [0, 1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    const redOffset = getOffset(splitIntensity, -1);
    const cyanOffset = getOffset(splitIntensity, 1);

    // Byte-identical to the pre-migration `opacity` variable, split into its
    // two per-direction branches (each direction's own call used to receive
    // only its own branch; a `plan` computes both from one `progress`).
    const fromOpacity = interpolate(progress, [0, 1], [1, 0]);
    const toOpacity = interpolate(progress, [0, 1], [0, 1]);

    const layers: PlateLayer[] = [];
    if (splitIntensity > 0.3) {
      layers.push({
        key: 'scanlines',
        z: 'over',
        style: {
          opacity: splitIntensity * 0.15,
          background: `repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0, 0, 0, 0.3) 2px,
            rgba(0, 0, 0, 0.3) 4px
          )`,
          pointerEvents: 'none',
        },
      });
    }

    return {
      from: {
        style: { opacity: fromOpacity },
        ghosts: [
          ghostStyle(splitIntensity, fromOpacity, redOffset, -30),
          ghostStyle(splitIntensity, fromOpacity, cyanOffset, 150),
        ],
      },
      to: {
        style: { opacity: toOpacity },
        ghosts: [
          ghostStyle(splitIntensity, toOpacity, redOffset, -30),
          ghostStyle(splitIntensity, toOpacity, cyanOffset, 150),
        ],
      },
      layers,
    };
  };

  return { plan };
};
