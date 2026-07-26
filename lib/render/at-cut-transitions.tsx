// The shared "at-the-cut" transition engine — lifted verbatim (see
// lib/render/README.md) from campaign-reels' LayeredCampaignReel.tsx so that
// every brand's renderer consumes one copy of it. The
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
import { resolveAccentColor, type AccentSlot } from '../theming/palette';
import type { CoreTransition, TransitionKind } from '../reel-config-base/transition-schema';

export { getTransitionRecord, type TransitionRecord };

export type AnyPresentation = { component: React.ComponentType<any>; props: Record<string, unknown> };

export const DIRECTION_4WAY: Record<string, 'from-left' | 'from-right' | 'from-top' | 'from-bottom'> = {
  left: 'from-left', right: 'from-right', up: 'from-top', down: 'from-bottom',
};

/** What a presentation may need beyond the transition itself: the composition's
 *  pixel size, and the BRAND's accent palette — the only place a core schema's
 *  colour KEY (see `AccentKey`) can become an actual hex. `palette` is optional
 *  so a renderer that has no theme in scope still composes; a colour key that
 *  can't be resolved simply falls back to the presentation's own neutral. */
type Dims = { width: number; height: number; palette?: readonly AccentSlot[] };

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
// schema's `wipe` member describes (a brand accent-slot key + a 2-way
// direction); the official package backs every OTHER official kind.
//
// `Extract<CoreTransition, …>` and `TransitionKind` are both read off the CORE
// union deliberately. Since Phase 4 `Transition` also admits brand-authored
// kinds (`kind: string`), and keying this map off THAT would make it a
// `Record<string, …>` — which demands no entries at all and would retire the
// exhaustiveness check silently. Brand kinds are not core's to render; they
// resolve through the brand's own registry.
type Renderer<K extends TransitionKind> = (t: Extract<CoreTransition, { kind: K }>, dims: Dims) => AnyPresentation | null;

const PRESENTATIONS: { [K in TransitionKind]: Renderer<K> } = {
  // `cut` is the absence of a transition; the gate in ./transition-record
  // filters it out long before here, but the map must still cover it.
  'cut': () => null,
  'fade': () => fade() as AnyPresentation,
  'dissolve': () => fade() as AnyPresentation,
  // A plain fade IS the "fade to background" look: opacity<1 reveals the
  // composition's own background colour (theme.background), whatever the brand
  // set it to — no tinting needed. See the note on the kind's name in
  // transition-schema.ts.
  'fade-coal': () => fade() as AnyPresentation,
  'glitch': () => glitch() as AnyPresentation,
  'burn': (t) => burn({ mask: t.mask, glowColor: t.glowColor, edgeContrast: t.edgeContrast, glowBand: t.glowBand }) as AnyPresentation,
  'slide': (t) => slide({ direction: DIRECTION_4WAY[t.direction] ?? 'from-left' }) as AnyPresentation,
  'flip': (t) => flip({ direction: DIRECTION_4WAY[t.direction] ?? 'from-left' }) as AnyPresentation,
  'whip-pan': (t) => whipPan({ direction: t.direction }) as AnyPresentation,
  'zoom-through': (t) => zoomThrough({ direction: t.from }) as AnyPresentation,
  'clock-wipe': (_t, dims) => clockWipe({ width: dims.width, height: dims.height }) as AnyPresentation,
  'iris': (_t, dims) => iris({ width: dims.width, height: dims.height }) as AnyPresentation,
  // `t.color` is a brand accent-slot KEY, not a colour: resolve it here, where
  // the palette is in scope. Unknown/unset → undefined → the presentation's own
  // neutral sweep.
  'wipe': (t, dims) => customWipe({
    color: resolveAccentColor(dims.palette ?? [], t.color ?? null) ?? undefined,
    direction: t.direction,
  }) as AnyPresentation,
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

// `cut`/absent/unrecognised → null (hard cut, no wrap). "Unrecognised" now covers
// two cases: a hand-edited Root.tsx literal that is not schema-validated, and a
// BRAND kind that core legitimately has no renderer for. Either way the lookup
// misses and the boundary is a hard cut; `getTransitionRecord` is what says so
// out loud (once per kind, in dev).
export function presentationFor(t: TransitionRecord | undefined, dims: Dims): AnyPresentation | null {
  if (!t) return null;
  // The index is deliberately widened to `string` before the lookup: `t.kind` is
  // `string` for a brand transition, and a missing key must be a runtime `undefined`
  // rather than a compile error at the call site.
  //
  // `hasOwn` is load-bearing NOW in a way it wasn't before Phase 4. While the
  // schema was closed, no authored kind could reach `Object.prototype`; now any
  // non-core string parses, and `{kind:'constructor', frames:20}` would otherwise
  // return an inherited FUNCTION that this code would then call as a renderer.
  const kind: string = t.kind;
  if (!Object.prototype.hasOwnProperty.call(PRESENTATIONS, kind)) return null;
  const render = (PRESENTATIONS as Record<string, Renderer<TransitionKind> | undefined>)[kind];
  return render ? render(t as Extract<CoreTransition, { kind: TransitionKind }>, dims) : null;
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
