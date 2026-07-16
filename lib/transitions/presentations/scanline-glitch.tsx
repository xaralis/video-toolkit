// lib/transitions/presentations/scanline-glitch.tsx
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import type { TransitionPresentation, TransitionPresentationComponentProps } from '@remotion/transitions';

export interface ScanlineGlitchProps { rgbShiftPx?: number; }

const ScanlineGlitch: React.FC<TransitionPresentationComponentProps<ScanlineGlitchProps>> = ({
  children, presentationProgress, passedProps,
}) => {
  const frame = useCurrentFrame();
  const shift = passedProps.rgbShiftPx ?? 16;
  const peak = interpolate(presentationProgress, [0, 0.5, 1], [0, 1, 0]);
  const xJitter = ((frame * 31) % 7 - 3) * peak;

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{
        transform: `translate(${shift * peak + xJitter}px, 0) translateZ(0)`,
        mixBlendMode: 'screen',
        filter: 'hue-rotate(-25deg) saturate(2)',
      }}>{children}</AbsoluteFill>
      <AbsoluteFill style={{
        transform: `translate(${-shift * peak + xJitter}px, 0) translateZ(0)`,
        mixBlendMode: 'screen',
        filter: 'hue-rotate(180deg) saturate(2)',
      }}>{children}</AbsoluteFill>
      <AbsoluteFill>{children}</AbsoluteFill>
      <AbsoluteFill style={{
        backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.4) 0 1px, transparent 1px 3px)',
        opacity: peak,
        mixBlendMode: 'multiply',
      }} />
    </AbsoluteFill>
  );
};

export const scanlineGlitch = (props: ScanlineGlitchProps = {}): TransitionPresentation<ScanlineGlitchProps> => ({
  component: ScanlineGlitch,
  props,
});
