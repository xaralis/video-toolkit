// lib/transitions/presentations/gradient-wipe.tsx
//
// Soft diagonal gradient reveal — blends the OUTGOING clip into the INCOMING
// clip along a feathered gradient band that sweeps corner-to-corner. Unlike
// `wipe` (a hard-edged colour sheet) this has no colour and a wide soft edge,
// so it reads as a "before → after" cross-blend of two visuals occupying the
// same framing (e.g. an official render vs. a proposed variant of the same
// square). The incoming clip is masked; the band's midpoint travels 0 → 100%
// of the chosen diagonal across the transition.
import { AbsoluteFill, interpolate } from 'remotion';
import type { TransitionPresentation, TransitionPresentationComponentProps } from '@remotion/transitions';

export interface GradientWipeProps {
  // Corner where the incoming clip starts being revealed; the band sweeps to
  // the OPPOSITE corner. 'tl-br' = top-left → bottom-right (default).
  direction?: 'tl-br' | 'tr-bl' | 'bl-tr' | 'br-tl';
  // Width of the feathered blend band, in % of the diagonal. Larger = softer
  // (more cross-blend overlap visible at once). Default 40.
  softness?: number;
}

// CSS gradient angle whose 0% endpoint sits at the reveal-start corner, so
// `black` at low stops makes that corner appear first.
const ANGLE: Record<NonNullable<GradientWipeProps['direction']>, number> = {
  'tl-br': 135,
  'tr-bl': 225,
  'bl-tr': 45,
  'br-tl': 315,
};

const GradientWipe: React.FC<TransitionPresentationComponentProps<GradientWipeProps>> = ({
  children,
  presentationProgress,
  passedProps,
  presentationDirection,
}) => {
  // Outgoing clip renders full-frame underneath; the incoming clip is layered
  // on top (TransitionSeries composites 'entering' over 'exiting') and masked.
  if (presentationDirection === 'exiting') {
    return <AbsoluteFill>{children}</AbsoluteFill>;
  }

  const soft = passedProps.softness ?? 40;
  const angle = ANGLE[passedProps.direction ?? 'tl-br'];
  // Band midpoint sweeps 0 → 100 across the diagonal. black = incoming clip
  // visible, transparent = outgoing clip shows through; the soft span between
  // is the feathered cross-blend.
  const edge = interpolate(presentationProgress, [0, 1], [0, 100]);
  const a = edge - soft / 2;
  const b = edge + soft / 2;
  const mask = `linear-gradient(${angle}deg, black ${a}%, transparent ${b}%)`;

  return (
    <AbsoluteFill
      style={{
        WebkitMaskImage: mask,
        maskImage: mask,
        WebkitMaskSize: '100% 100%',
        maskSize: '100% 100%',
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

export const gradientWipe = (
  props: GradientWipeProps = {},
): TransitionPresentation<GradientWipeProps> => ({
  component: GradientWipe,
  props,
});
