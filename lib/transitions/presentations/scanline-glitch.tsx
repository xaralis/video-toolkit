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
//
// SINGLE-MOUNT (Phase 5 Task 0.2): `blend` (the `from`/`to` pair above) used to
// be re-rendered three times — once plain, twice more inside RGB-shifted,
// screen-blended `AbsoluteFill`s — for 6 media mounts total from one node. That
// is the same defect class `glitch.tsx` already fixed for itself: a two-input
// composite mounting its own children N times over is N× the video decode (and
// N× any inherited <Audio>) for one visual effect. This version mounts `blend`
// exactly ONCE and reproduces the chromatic-aberration split with a single SVG
// filter — `feOffset` (the per-copy shift) → `feColorMatrix` (hue-rotate, then
// saturate, then an alpha-scale by `peak` so the shifted contribution is zero
// at both ends) → `feBlend mode="screen"`, applied twice (once per shifted
// copy) against the one `SourceGraphic`. This is exactly `glitch.tsx`'s own
// `filter: url(#id)`-on-an-`AbsoluteFill` technique (`glitch.tsx:78-83`), not a
// new one. The filter is always applied (never conditionally mounted) so
// element count stays invariant across progress; when `peak` is 0 the
// alpha-scaled shifted layers contribute nothing to the screen blend, so the
// composite reduces to the plain plate exactly as the CSS-duplication version
// did at its own ends.
import React, { useState } from 'react';
import { AbsoluteFill, interpolate, random, useCurrentFrame } from 'remotion';
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

    // Stable per-instance, per-mount id — the pattern `burn.tsx` and
    // `glitch.tsx` already use, NOT `React.useId()`: that is unique only
    // within one React root, so two roots on one document (two `<Player>`s, an
    // editor root beside a preview root) could mint the same id and `url(#…)`
    // would then resolve to whichever copy is first in document order.
    const [uid] = useState(() => String(random(null)).slice(2, 10));
    const filterId = `scanline-glitch-${uid}`;

    // The two shifted copies' horizontal offsets. Both fold `peak` in already
    // (so they land on 0 at progress 0/1, same as the jitter itself), which is
    // what lets the filter be applied unconditionally without a separate
    // "is this active" branch.
    const redDx = shift * peak + xJitter;
    const blueDx = -shift * peak + xJitter;

    // THE BLEND. This is what the one-sided form could not express: the
    // incoming clip crossfades in over the outgoing one across the window,
    // rather than replacing it at frame one. Mounted exactly once — the
    // filter below reads it as `SourceGraphic` rather than the caller
    // re-rendering it per shifted copy.
    return (
      <AbsoluteFill>
        <AbsoluteFill style={{ filter: `url(#${filterId})` }}>
          <AbsoluteFill>{from}</AbsoluteFill>
          <AbsoluteFill style={{ opacity: progress }}>{to}</AbsoluteFill>
        </AbsoluteFill>
        <AbsoluteFill style={{
          backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.4) 0 1px, transparent 1px 3px)',
          opacity: peak,
          mixBlendMode: 'multiply',
        }} />
        {/* The RGB-split filter: two hue-rotated, screen-blended copies of the
            SAME source, each alpha-scaled by `peak` so at progress 0 and 1 the
            composite is the plain blend and not a hue-rotated wash of it. */}
        <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
          <defs>
            <filter
              id={filterId}
              x="-10%"
              y="-10%"
              width="120%"
              height="120%"
              colorInterpolationFilters="sRGB"
            >
              <feOffset in="SourceGraphic" dx={redDx} dy={0} result="rShift" />
              <feColorMatrix in="rShift" type="hueRotate" values="-25" result="rHue" />
              <feColorMatrix in="rHue" type="saturate" values="2" result="rSat" />
              <feColorMatrix
                in="rSat"
                type="matrix"
                values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${peak} 0`}
                result="rAlpha"
              />
              <feBlend in="SourceGraphic" in2="rAlpha" mode="screen" result="screenR" />

              <feOffset in="SourceGraphic" dx={blueDx} dy={0} result="bShift" />
              <feColorMatrix in="bShift" type="hueRotate" values="180" result="bHue" />
              <feColorMatrix in="bHue" type="saturate" values="2" result="bSat" />
              <feColorMatrix
                in="bSat"
                type="matrix"
                values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${peak} 0`}
                result="bAlpha"
              />
              <feBlend in="screenR" in2="bAlpha" mode="screen" />
            </filter>
          </defs>
        </svg>
      </AbsoluteFill>
    );
  };

  return { composite };
};
