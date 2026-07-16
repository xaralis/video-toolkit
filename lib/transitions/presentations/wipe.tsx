// lib/transitions/presentations/wipe.tsx
import { AbsoluteFill, interpolate } from 'remotion';
import type { TransitionPresentation, TransitionPresentationComponentProps } from '@remotion/transitions';

export interface WipeProps {
  color?: 'lime' | 'teal' | 'coal';
  direction?: 'left' | 'right';
}

const COLOR_MAP = { lime: '#c6f432', teal: '#2ad4c5', coal: '#0a0a0a' };

const Wipe: React.FC<TransitionPresentationComponentProps<WipeProps>> = ({
  children, presentationProgress, passedProps, presentationDirection,
}) => {
  const color = COLOR_MAP[passedProps.color ?? 'lime'];
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
