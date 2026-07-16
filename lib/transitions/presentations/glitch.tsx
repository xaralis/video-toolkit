/**
 * Glitch Transition (single-mount, SVG-filter based)
 *
 * Digital distortion: horizontal slice tearing + RGB channel separation +
 * scan lines. Perfect for tech / edgy reveals.
 *
 * IMPORTANT — why this renders `children` ONCE:
 * The original implementation re-mounted `children` ~10× (8 DOM slices + 2 RGB
 * copies). That is fine for a static card, but catastrophic when the scene is a
 * live segment: 10× video decode froze Studio, and 10× copies of any inherited
 * <Audio> played on top of each other (echo). This version mounts `children`
 * exactly once and produces the entire glitch look with a single SVG filter
 * (feTurbulence → feDisplacementMap for the tearing, feOffset chromatic
 * aberration for the RGB split) plus cheap CSS overlays that never touch the
 * children. Result: 1× video, 1× audio, GPU-filtered — no freeze, no echo.
 */
import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from '@remotion/transitions';
import React, { useState } from 'react';
import { AbsoluteFill, random, interpolate, useCurrentFrame } from 'remotion';

export type GlitchProps = {
  /** Intensity of the glitch effect (0-1). Default: 0.8 */
  intensity?: number;
  /** Roughly how many horizontal tear-bands (drives vertical noise frequency). Default: 8 */
  slices?: number;
  /** Include RGB channel separation. Default: true */
  rgbShift?: boolean;
  /** Include scan lines overlay. Default: true */
  scanLines?: boolean;
};

const GlitchPresentation: React.FC<
  TransitionPresentationComponentProps<GlitchProps>
> = ({ children, presentationDirection, presentationProgress, passedProps }) => {
  const {
    intensity = 0.8,
    slices = 8,
    rgbShift = true,
    scanLines = true,
  } = passedProps;

  const frame = useCurrentFrame();
  const [filterId] = useState(() => `glitch-${String(random(null)).slice(2, 10)}`);

  // Sustained plateau across the transition (ramp up → hold → ramp down), not a
  // single mid spike — reads as a glitchy CUT for short transitions.
  const glitchIntensity =
    intensity *
    interpolate(presentationProgress, [0, 0.2, 0.8, 1], [0, 1, 1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });

  // Crossfade underneath the glitch.
  const opacity =
    presentationDirection === 'exiting'
      ? interpolate(presentationProgress, [0, 1], [1, 0])
      : interpolate(presentationProgress, [0, 1], [0, 1]);

  // Re-seed a few times per second so the tear pattern jitters.
  const flickerFrame = Math.floor(frame / 2);
  const seed = flickerFrame % 100;

  // Filter drive values — all scale with intensity so it eases in/out.
  const dispScale = glitchIntensity * 55; // px of horizontal tearing
  const rgbOffset = rgbShift ? glitchIntensity * 14 : 0;
  // More requested slices → higher vertical noise frequency → thinner bands.
  const yFreq = (0.18 + 0.28 * (slices / 8)).toFixed(3);
  const active = glitchIntensity > 0.01;

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {/* Children mounted ONCE; the whole glitch is a single SVG filter. */}
      <AbsoluteFill
        style={{
          opacity,
          filter: active ? `url(#${filterId})` : undefined,
        }}
      >
        {children}
      </AbsoluteFill>

      {/* Scan lines — pure CSS overlay, no children. */}
      {scanLines && glitchIntensity > 0.1 && (
        <AbsoluteFill
          style={{
            opacity: glitchIntensity * 0.4,
            background: `repeating-linear-gradient(
              0deg,
              transparent,
              transparent 2px,
              rgba(0, 0, 0, 0.4) 2px,
              rgba(0, 0, 0, 0.4) 4px
            )`,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Digital noise texture — pure CSS overlay. */}
      {glitchIntensity > 0.15 && (
        <AbsoluteFill
          style={{
            opacity: glitchIntensity * 0.2,
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            pointerEvents: 'none',
            mixBlendMode: 'overlay',
          }}
        />
      )}

      {/* Random neon glitch blocks — pure CSS overlay, no children. */}
      {glitchIntensity > 0.15 && (
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
          {Array.from({ length: 8 }, (_, i) => {
            const s = `block-${i}-${flickerFrame}`;
            if (random(s) < 0.5) return null;
            const colorChoice = random(`${s}-c`);
            const bgColor =
              colorChoice > 0.7
                ? `rgba(255,255,255,${glitchIntensity * 0.5})`
                : colorChoice > 0.4
                  ? `rgba(255,0,80,${glitchIntensity * 0.6})`
                  : `rgba(0,255,255,${glitchIntensity * 0.6})`;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `${random(`${s}-x`) * 100}%`,
                  top: `${random(`${s}-y`) * 100}%`,
                  width: `${5 + random(`${s}-w`) * 40}%`,
                  height: `${1 + random(`${s}-h`) * 12}%`,
                  backgroundColor: bgColor,
                  mixBlendMode: 'screen',
                }}
              />
            );
          })}
        </AbsoluteFill>
      )}

      {/* The one glitch filter: tearing (displacement) + RGB split, applied to
          the single children instance above. Region expanded so shifted
          channels / displaced rows are not clipped. */}
      {active && (
        <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
          <defs>
            <filter
              id={filterId}
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
              colorInterpolationFilters="sRGB"
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency={`0.01 ${yFreq}`}
                numOctaves={1}
                seed={seed}
                stitchTiles="stitch"
                result="noise"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale={dispScale}
                xChannelSelector="R"
                yChannelSelector="G"
                result="disp"
              />
              {/* Red channel shifted left */}
              <feOffset in="disp" dx={-rgbOffset} dy="0" result="rs" />
              <feColorMatrix
                in="rs"
                type="matrix"
                values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
                result="rc"
              />
              {/* Blue channel shifted right */}
              <feOffset in="disp" dx={rgbOffset} dy="0" result="bs" />
              <feColorMatrix
                in="bs"
                type="matrix"
                values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
                result="bc"
              />
              {/* Green channel stays put */}
              <feColorMatrix
                in="disp"
                type="matrix"
                values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
                result="gc"
              />
              <feBlend in="rc" in2="gc" mode="screen" result="rg" />
              <feBlend in="rg" in2="bc" mode="screen" />
            </filter>
          </defs>
        </svg>
      )}
    </AbsoluteFill>
  );
};

export const glitch = (
  props: GlitchProps = {}
): TransitionPresentation<GlitchProps> => {
  return { component: GlitchPresentation, props };
};
