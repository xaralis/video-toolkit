// lib/transitions/presentations/gradient-wipe.tsx
//
// Soft diagonal gradient reveal — blends the OUTGOING clip into the INCOMING
// clip along a feathered gradient band that sweeps corner-to-corner. Unlike
// `wipe` (a hard-edged colour sheet) this has no colour and a wide soft edge,
// so it reads as a "before → after" cross-blend of two visuals occupying the
// same framing (e.g. an official render vs. a proposed variant of the same
// square). The incoming clip is masked; the band's midpoint travels 0 → 100%
// of the chosen diagonal across the transition.
//
// PHASE 5 TASK 2.2 — lifted from a one-sided `TransitionPresentation`
// (`presentationDirection === 'exiting' ? identity : masked`) directly to a
// NATIVE TWO-INPUT `plan` node, per design §2.4/§3 row 18: "`to.style.maskImage`
// directly — no `wrap` needed." The `presentationDirection` branch the old
// component read was PER SIDE, not per frame (`exiting` was always the
// identity, `entering` always the mask), which is exactly the shape a `plan`
// expresses as two `LayerOp`s computed from one `progress` — no component, no
// hooks, no second invocation.
//
// THE MASK TECHNIQUE WAS VERIFIED ON THE PLAN PATH, not assumed. Task 0.1
// measured a DIFFERENT masking form (`mask: url(#svg-element)`, an SVG mask
// reference on an HTML element) fully invisible under the real renderer for
// `checkerboard`. This kind's mask is a different CSS mechanism —
// `mask-image`/`WebkitMaskImage` with an inline CSS `linear-gradient()` value,
// never an SVG element reference — and it renders correctly applied as a
// `LayerOp.style` on a `LayerShell`-mounted div: confirmed with
// `examples/layered-minimal`'s `remotion still` at three progress points (see
// task-2.2-report.md). No design correction was needed for this row.
import { interpolate } from 'remotion';
import type { TransitionNode, TransitionPlanProps, TransitionComposite } from '../../theming/transitions';

export type GradientWipeProps = {
  // Corner where the incoming clip starts being revealed; the band sweeps to
  // the OPPOSITE corner. 'tl-br' = top-left → bottom-right (default).
  direction?: 'tl-br' | 'tr-bl' | 'bl-tr' | 'br-tl';
  // Width of the feathered blend band, in % of the diagonal. Larger = softer
  // (more cross-blend overlap visible at once). Default 40.
  softness?: number;
};

// CSS gradient angle whose 0% endpoint sits at the reveal-start corner, so
// `black` at low stops makes that corner appear first.
const ANGLE: Record<NonNullable<GradientWipeProps['direction']>, number> = {
  'tl-br': 135,
  'tr-bl': 225,
  'bl-tr': 45,
  'br-tl': 315,
};

export const gradientWipe = (props: GradientWipeProps = {}): TransitionNode => {
  const soft = props.softness ?? 40;
  const angle = ANGLE[props.direction ?? 'tl-br'];

  const plan = ({ progress }: TransitionPlanProps): TransitionComposite => {
    // Band midpoint sweeps 0 → 100 across the diagonal. black = incoming clip
    // visible, transparent = outgoing clip shows through; the soft span between
    // is the feathered cross-blend. Byte-identical arithmetic to the
    // pre-migration component.
    const edge = interpolate(progress, [0, 1], [0, 100]);
    const a = edge - soft / 2;
    const b = edge + soft / 2;
    const mask = `linear-gradient(${angle}deg, black ${a}%, transparent ${b}%)`;

    return {
      // The outgoing clip renders full-frame, untouched — the old component's
      // `exiting` branch was the identity, so there is nothing for `from`'s
      // `LayerOp` to carry.
      from: {},
      to: {
        style: {
          WebkitMaskImage: mask,
          maskImage: mask,
          WebkitMaskSize: '100% 100%',
          maskSize: '100% 100%',
        },
      },
    };
  };

  return { plan };
};
