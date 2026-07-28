// lib/transitions/presentations/scanline-glitch.tsx
//
// A NATIVE TWO-INPUT NODE (Phase 4 Task 2.1). This kind never touched opacity
// and never even destructured `presentationDirection`: it drew its children
// three times — two RGB-shifted, screen-blended copies and then one fully
// OPAQUE copy on top — plus a scanline overlay. Two consequences, both real and
// both measured:
//
//   1. At a cut it was not a dissolve at all. The entering mount painted the
//      incoming clip opaquely from the transition's first frame, so the cut
//      effectively landed half a window early.
//   2. The RGB-shifted copies were INVISIBLE. The opaque third layer sat on top
//      of them, so the only thing that ever showed was the scanline gradient.
//
// With two inputs the blend becomes explicit: B fades in over A, and the
// jittered RGB copies are ramped by the transition's own peak so they are
// visible mid-cut and absent at both ends — which is also what keeps progress 0
// showing the outgoing clip cleanly.
//
// NOTE ON THE CLOCK: `xJitter` reads `useCurrentFrame()`, and since Task 1.3
// this component is mounted inside the BOUNDARY's Sequence, so that frame is
// boundary-relative. The jitter was invisible before, so this is the first
// render in which the clock matters — expect its goldens to move for the same
// frame-origin reason `glitch`'s did, on top of the blend change.
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import type { TransitionNode, TransitionNodeProps } from '../../theming/transitions';

// `type`, not `interface` — a historical constraint from
// @remotion/transitions' `TransitionPresentation<T extends Record<string,
// unknown>>`, kept because the props type is still part of this module's public
// surface.
export type ScanlineGlitchProps = { rgbShiftPx?: number };

export const scanlineGlitch = (props: ScanlineGlitchProps = {}): TransitionNode => {
  const shift = props.rgbShiftPx ?? 16;

  const composite: React.FC<TransitionNodeProps> = ({ from, to, progress }) => {
    const frame = useCurrentFrame();
    const peak = interpolate(progress, [0, 0.5, 1], [0, 1, 0]);
    const xJitter = ((frame * 31) % 7 - 3) * peak;

    // THE BLEND. This is what the one-sided form could not express: the
    // incoming clip crossfades in over the outgoing one across the window,
    // rather than replacing it at frame one.
    const blend = (
      <>
        <AbsoluteFill>{from}</AbsoluteFill>
        <AbsoluteFill style={{ opacity: progress }}>{to}</AbsoluteFill>
      </>
    );

    return (
      <AbsoluteFill>
        {blend}
        {/* Two RGB-shifted, screen-blended copies of the SAME blend — ramped by
            `peak`, so at progress 0 and 1 the composite is the plain clip and
            not a hue-rotated wash of it. */}
        <AbsoluteFill style={{
          opacity: peak,
          transform: `translate(${shift * peak + xJitter}px, 0) translateZ(0)`,
          mixBlendMode: 'screen',
          filter: 'hue-rotate(-25deg) saturate(2)',
        }}>{blend}</AbsoluteFill>
        <AbsoluteFill style={{
          opacity: peak,
          transform: `translate(${-shift * peak + xJitter}px, 0) translateZ(0)`,
          mixBlendMode: 'screen',
          filter: 'hue-rotate(180deg) saturate(2)',
        }}>{blend}</AbsoluteFill>
        <AbsoluteFill style={{
          backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.4) 0 1px, transparent 1px 3px)',
          opacity: peak,
          mixBlendMode: 'multiply',
        }} />
      </AbsoluteFill>
    );
  };

  return { composite };
};
