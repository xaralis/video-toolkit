// lib/transitions/presentations/wipe.tsx
import { AbsoluteFill, interpolate } from 'remotion';
import type { TransitionPresentation, TransitionPresentationComponentProps } from '@remotion/transitions';

export interface WipeProps {
  /** The sweeping sheet's colour, as a CSS colour (hex, rgb(), …). This used to
   *  be a three-value enum over one brand's palette, with a name→hex map right
   *  here in the shared presentation; the schema now carries a brand
   *  ACCENT-SLOT KEY and `lib/render/at-cut-transitions.tsx` resolves it
   *  against the brand's own palette before calling in. */
  color?: string;
  direction?: 'left' | 'right';
}

/** Used when no colour is supplied (or the brand's palette has no slot under
 *  the configured key). Near-black is the neutral choice: it reads as a wipe
 *  against almost any footage without asserting a brand colour. */
const DEFAULT_COLOR = '#0a0a0a';

const Wipe: React.FC<TransitionPresentationComponentProps<WipeProps>> = ({
  children, presentationProgress, passedProps, presentationDirection,
}) => {
  const color = passedProps.color ?? DEFAULT_COLOR;
  const dir = passedProps.direction ?? 'left';
  const isExit = presentationDirection === 'exiting';
  // Exit: sheet slides INTO frame, covering the outgoing children.
  //   dir='left' → sheet enters from the right, ends at 0% (covering).
  //   dir='right' → sheet enters from the left.
  // Enter: sheet slides OUT of frame, revealing the incoming children.
  const offsetPct = isExit
    ? interpolate(presentationProgress, [0, 1], [dir === 'left' ? 100 : -100, 0])
    : interpolate(presentationProgress, [0, 1], [0, dir === 'left' ? -100 : 100]);
  return (
    <AbsoluteFill>
      <AbsoluteFill>{children}</AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: color, transform: `translateX(${offsetPct}%)` }} />
    </AbsoluteFill>
  );
};

export const wipe = (props: WipeProps = {}): TransitionPresentation<WipeProps> => ({
  component: Wipe,
  props,
});
