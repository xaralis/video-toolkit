/**
 * Burn Transition — organic paper/ember reveal.
 *
 * A low-frequency cloud texture is thresholded by the transition progress (via
 * a CSS filter inside an SVG <mask>) so brighter blobs of the ENTERING clip
 * reveal first and spread until it fully covers the exiting clip. A thin glow
 * band (mask B, run `glowBand` ahead of the reveal) paints a hot edge in the
 * ring B\A. Generalized from roost's outro burn so it works as a real at-cut
 * transition between any two clips; the mask asset + glow color are supplied by
 * the brand via the transition record (see presentationFor), keeping this core
 * component brand-agnostic. Renders `children` exactly once (no video re-mount).
 */
import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from '@remotion/transitions';
import React, { useState } from 'react';
import { AbsoluteFill, staticFile, useVideoConfig, random } from 'remotion';

export type BurnProps = {
  /** Cloud-texture mask image (staticFile path or http URL). Absent → plain opacity reveal. */
  mask?: string;
  /** Hot-edge glow color. Default a warm cream. */
  glowColor?: string;
  /** Higher = harder/crisper burn edge. Default 14. */
  edgeContrast?: number;
  /** How far (in luma) the glow runs ahead of the reveal. Default 0.1. */
  glowBand?: number;
};

const BurnPresentation: React.FC<TransitionPresentationComponentProps<BurnProps>> = ({
  children,
  presentationDirection,
  presentationProgress,
  passedProps,
}) => {
  const { mask, glowColor = '#faf4e6', edgeContrast = 14, glowBand = 0.1 } = passedProps;
  const { width, height } = useVideoConfig();
  // Unique mask ids per instance so two concurrent burns can't collide.
  const [uid] = useState(() => String(random(null)).slice(2, 10));

  // The outgoing clip renders plainly underneath; the entering clip's masked
  // reveal (below) is stacked on top of it by the later Sequence.
  if (presentationDirection === 'exiting') {
    return <AbsoluteFill>{children}</AbsoluteFill>;
  }

  // No mask supplied → degrade gracefully to a plain opacity reveal.
  if (!mask) {
    return <AbsoluteFill style={{ opacity: presentationProgress }}>{children}</AbsoluteFill>;
  }

  const cloud = mask.startsWith('http') ? mask : staticFile(mask);
  const p = presentationProgress;
  // Reveal where cloud luminance > (1 - progress): brightness scales the pivot,
  // high contrast turns it into a (soft) step.
  const brightnessFor = (pp: number) => 0.5 / Math.max(1 - pp, 0.001);
  const maskImage = (pp: number) => (
    <image
      href={cloud}
      x={0}
      y={0}
      width={width}
      height={height}
      preserveAspectRatio="none"
      style={{ filter: `grayscale(1) brightness(${brightnessFor(pp)}) contrast(${edgeContrast})` }}
    />
  );
  return (
    <AbsoluteFill>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <mask id={`burn-a-${uid}`} maskUnits="userSpaceOnUse">{maskImage(p)}</mask>
          <mask id={`burn-b-${uid}`} maskUnits="userSpaceOnUse">{maskImage(Math.min(1, p + glowBand))}</mask>
        </defs>
        {/* glow at the leading burn edge (revealed by B, then covered by the clip A) */}
        <foreignObject x={0} y={0} width={width} height={height} mask={`url(#burn-b-${uid})`}>
          <div style={{ width: '100%', height: '100%', background: glowColor }} />
        </foreignObject>
        {/* the entering clip */}
        <foreignObject x={0} y={0} width={width} height={height} mask={`url(#burn-a-${uid})`}>
          <div style={{ width: '100%', height: '100%', position: 'relative' }}>{children}</div>
        </foreignObject>
      </svg>
    </AbsoluteFill>
  );
};

export const burn = (props: BurnProps = {}): TransitionPresentation<BurnProps> => ({
  component: BurnPresentation,
  props,
});
