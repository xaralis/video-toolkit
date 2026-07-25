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
  glitch, whipPan, zoomThrough, wipe as customWipe, gradientWipe, burn,
  rgbSplit, scanlineGlitch, lightLeak, zoomBlur, pixelate, checkerboard,
} from '../transitions';
import { useCurrentFrame } from 'remotion';
import { getTransitionRecord, type TransitionRecord } from './transition-record';
import type { Transition, TransitionKind } from '../reel-config-base/transition-schema';

export { getTransitionRecord, type TransitionRecord };

export type AnyPresentation = { component: React.ComponentType<any>; props: Record<string, unknown> };

export const DIRECTION_4WAY: Record<string, 'from-left' | 'from-right' | 'from-top' | 'from-bottom'> = {
  left: 'from-left', right: 'from-right', up: 'from-top', down: 'from-bottom',
};

type Dims = { width: number; height: number };

// One renderer per transition kind, keyed by TransitionKind — so the COMPILER
// demands an entry for every kind in the catalog (lib/reel-config-base/
// transition-schema.ts). This replaced a `switch` with a `default: return null`
// arm, which happily swallowed a kind the catalog had but the renderer didn't:
// the reel just played a hard cut and nothing said why.
//
// Each entry receives its OWN narrowed member of the union, so `t.color`,
// `t.from`, `t.mask` etc. are typed rather than cast out of a loose record.
//
// `wipe` maps to the toolkit's OWN custom wipe (color + 2-way direction) — NOT
// @remotion/transitions/wipe (4-way, colourless) — because that's what the
// schema's `wipe` member describes and what pp-05's CampaignReel.tsx already
// renders for this kind; the official package backs every OTHER official kind.
type Renderer<K extends TransitionKind> = (t: Extract<Transition, { kind: K }>, dims: Dims) => AnyPresentation | null;

const PRESENTATIONS: { [K in TransitionKind]: Renderer<K> } = {
  // `cut` is the absence of a transition; the gate in ./transition-record
  // filters it out long before here, but the map must still cover it.
  'cut': () => null,
  'fade': () => fade() as AnyPresentation,
  'dissolve': () => fade() as AnyPresentation,
  // Coal shows through simply because opacity<1 reveals the composition's own
  // coal-coloured background — no tinting needed.
  'fade-coal': () => fade() as AnyPresentation,
  'glitch': () => glitch() as AnyPresentation,
  'burn': (t) => burn({ mask: t.mask, glowColor: t.glowColor, edgeContrast: t.edgeContrast, glowBand: t.glowBand }) as AnyPresentation,
  'slide': (t) => slide({ direction: DIRECTION_4WAY[t.direction] ?? 'from-left' }) as AnyPresentation,
  'flip': (t) => flip({ direction: DIRECTION_4WAY[t.direction] ?? 'from-left' }) as AnyPresentation,
  'whip-pan': (t) => whipPan({ direction: t.direction }) as AnyPresentation,
  'zoom-through': (t) => zoomThrough({ direction: t.from }) as AnyPresentation,
  'clock-wipe': (_t, dims) => clockWipe({ width: dims.width, height: dims.height }) as AnyPresentation,
  'iris': (_t, dims) => iris({ width: dims.width, height: dims.height }) as AnyPresentation,
  'wipe': (t) => customWipe({ color: t.color, direction: t.direction }) as AnyPresentation,
  'gradient-wipe': (t) => gradientWipe({ direction: t.direction, softness: t.softness }) as AnyPresentation,
  // Every param below is optional on both sides: the schema member makes it
  // optional, and the presentation destructures it with its own default — so
  // passing an explicit `undefined` through is exactly "use your default", the
  // same contract `burn` and `gradient-wipe` above already rely on.
  'rgb-split': (t) => rgbSplit({ direction: t.direction, displacement: t.displacement }) as AnyPresentation,
  'scanline-glitch': (t) => scanlineGlitch({ rgbShiftPx: t.rgbShiftPx }) as AnyPresentation,
  'light-leak': (t) => lightLeak({
    temperature: t.temperature, direction: t.direction, intensity: t.intensity, flareArtifacts: t.flareArtifacts,
  }) as AnyPresentation,
  'zoom-blur': (t) => zoomBlur({
    direction: t.direction, blurAmount: t.blurAmount, scaleAmount: t.scaleAmount, origin: t.origin,
  }) as AnyPresentation,
  'pixelate': (t) => pixelate({
    maxBlockSize: t.maxBlockSize, gridSize: t.gridSize,
    scanlines: t.scanlines, glitchArtifacts: t.glitchArtifacts, randomness: t.randomness,
  }) as AnyPresentation,
  // `easing` is not forwarded — it has no schema field (a function can't live
  // in a config), so the presentation's own Easing.out(Easing.cubic) applies.
  'checkerboard': (t) => checkerboard({
    gridSize: t.gridSize, pattern: t.pattern, stagger: t.stagger, squareAnimation: t.squareAnimation,
  }) as AnyPresentation,
};

// `cut`/absent/unrecognised → null (hard cut, no wrap). "Unrecognised" can still
// happen at runtime: a hand-edited Root.tsx literal is not schema-validated.
export function presentationFor(t: TransitionRecord | undefined, dims: Dims): AnyPresentation | null {
  if (!t) return null;
  const render = PRESENTATIONS[t.kind] as Renderer<TransitionKind> | undefined;
  return render ? render(t, dims) : null;
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
