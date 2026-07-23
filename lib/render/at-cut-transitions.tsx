// The shared "at-the-cut" transition engine — lifted verbatim (see
// lib/render/README.md) from campaign-reels' LayeredCampaignReel.tsx so both
// the campaign renderer and a future roost renderer consume one copy. The
// pure "is this a real transition?" gate lives in ./transition-record (no
// Remotion import there, so it can be unit-tested in core); this module adds
// the Remotion presentation mapping + the components that drive it off
// useCurrentFrame().
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { flip } from '@remotion/transitions/flip';
import { clockWipe } from '@remotion/transitions/clock-wipe';
import { iris } from '@remotion/transitions/iris';
import {
  glitch, whipPan, zoomThrough, wipe as customWipe, gradientWipe,
} from '../transitions';
import { useCurrentFrame } from 'remotion';
import { getTransitionRecord, type TransitionRecord } from './transition-record';

export { getTransitionRecord, type TransitionRecord };

export type AnyPresentation = { component: React.ComponentType<any>; props: Record<string, unknown> };

export const DIRECTION_4WAY: Record<string, 'from-left' | 'from-right' | 'from-top' | 'from-bottom'> = {
  left: 'from-left', right: 'from-right', up: 'from-top', down: 'from-bottom',
};

// The full transition catalog (lib/editor/app/transitions.ts is the source of
// truth for kinds/sub-options) mapped to a renderable @remotion/transitions
// presentation. `cut`/absent/unrecognised → null (hard cut, no wrap).
//
// `wipe` maps to the toolkit's OWN custom wipe (color + 2-way direction) —
// NOT @remotion/transitions/wipe (4-way, colourless) — because that's what
// `subOptionsFor('wipe')` describes and what pp-05's CampaignReel.tsx already
// renders for this kind; the design doc's catalog table names the official
// package for every OTHER official kind, but 'wipe' as a distinct schema kind
// is this custom one.
export function presentationFor(
  t: TransitionRecord | undefined,
  dims: { width: number; height: number },
): AnyPresentation | null {
  if (!t) return null;
  const dir4 = DIRECTION_4WAY[String(t.direction)] ?? 'from-left';
  switch (t.kind) {
    case 'fade':
    case 'dissolve':
    // Coal shows through simply because opacity<1 reveals the composition's
    // own coal-coloured background — no tinting needed.
    case 'fade-coal':
      return fade() as AnyPresentation;
    case 'slide':
      return slide({ direction: dir4 }) as AnyPresentation;
    case 'flip':
      return flip({ direction: dir4 }) as AnyPresentation;
    case 'clock-wipe':
      return clockWipe({ width: dims.width, height: dims.height }) as AnyPresentation;
    case 'iris':
      return iris({ width: dims.width, height: dims.height }) as AnyPresentation;
    case 'wipe':
      return customWipe({
        color: t.color as 'lime' | 'teal' | 'coal' | undefined,
        direction: t.direction as 'left' | 'right' | undefined,
      }) as AnyPresentation;
    case 'glitch':
      return glitch() as AnyPresentation;
    case 'whip-pan':
      return whipPan({ direction: t.direction as 'left' | 'right' | 'up' | 'down' | undefined }) as AnyPresentation;
    case 'zoom-through':
      return zoomThrough({ direction: t.from as 'in' | 'out' | undefined }) as AnyPresentation;
    case 'gradient-wipe':
      return gradientWipe({
        direction: t.direction as 'tl-br' | 'tr-bl' | 'bl-tr' | 'br-tl' | undefined,
        softness: t.softness,
      }) as AnyPresentation;
    default:
      return null;
  }
}

// Invokes one presentation's component directly (not via TransitionSeries —
// see AtCutTransition below) with the exact prop shape it expects.
export const TransitionLayer: React.FC<{
  presentation: AnyPresentation;
  direction: 'entering' | 'exiting';
  progress: number;
  durationInFrames: number;
  children: React.ReactNode;
}> = ({ presentation, direction, progress, durationInFrames, children }) => {
  const Component = presentation.component;
  return (
    <Component
      passedProps={presentation.props}
      presentationDirection={direction}
      presentationProgress={progress}
      presentationDurationInFrames={durationInFrames}
    >
      {children}
    </Component>
  );
};

// Drives a boundary's presentation(s) directly off useCurrentFrame() — no
// TransitionSeries, whose crossfade SHRINKS adjacent sequences' visible
// duration by the transition length. This reel instead renders "at the cut":
// each item's own (possibly handle-extended — see the videoNodes map below)
// Sequence is wrapped in its OWN incoming/outgoing presentation(s), mirroring
// TransitionSeries' own compositing order — the exiting presentation (this
// item fading OUT to its successor) wraps the entering one (this item fading
// IN from its predecessor) wraps the actual content.
//
// Progress is clamped to [0,1] HERE, deliberately not left to each
// presentation's own interpolate() calls — several of the custom ones
// (whipPan, zoomThrough) don't set extrapolateLeft/Right and would run away
// outside the transition window otherwise.
export const AtCutTransition: React.FC<{
  inPresentation: AnyPresentation | null;
  inFrames: number;
  outPresentation: AnyPresentation | null;
  outFrames: number;
  seqDurationF: number;
  children: React.ReactNode;
}> = ({ inPresentation, inFrames, outPresentation, outFrames, seqDurationF, children }) => {
  const frame = useCurrentFrame();
  let node: React.ReactNode = children;
  if (inPresentation && inFrames > 0) {
    const progress = Math.max(0, Math.min(1, frame / inFrames));
    node = (
      <TransitionLayer presentation={inPresentation} direction="entering" progress={progress} durationInFrames={inFrames}>
        {node}
      </TransitionLayer>
    );
  }
  if (outPresentation && outFrames > 0) {
    const windowStart = seqDurationF - outFrames;
    const progress = Math.max(0, Math.min(1, (frame - windowStart) / outFrames));
    node = (
      <TransitionLayer presentation={outPresentation} direction="exiting" progress={progress} durationInFrames={outFrames}>
        {node}
      </TransitionLayer>
    );
  }
  // eslint-disable-next-line react/jsx-no-useless-fragment
  return <>{node}</>;
};
