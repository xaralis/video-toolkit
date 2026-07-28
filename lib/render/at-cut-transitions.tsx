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
import { resolveRegistered, registrationConfig } from '../theming/registry';
import { isTransitionNode } from '../theming/transitions';
import type {
  AnyPresentation, ResolvedTransition, TransitionNode, TransitionNodeProps,
  TransitionRegistry, TransitionRenderer,
} from '../theming/transitions';
import { warnOnce } from './warn-once';
import { CUT_KIND } from '../reel-config-base/transition-schema';
import type { CoreTransition, TransitionKind } from '../reel-config-base/transition-schema';

export { getTransitionRecord, type TransitionRecord };
export { isTransitionNode };

// Re-exported: the type is DEFINED in lib/theming (BrandTheme has to name it,
// and lib/theming may not import lib/render), but this has been its import path
// since before the transition axis had a theme surface.
export type {
  AnyPresentation, TransitionNode, TransitionNodeProps, ResolvedTransition,
  TransitionRegistry, TransitionRenderer, TransitionRenderProps,
} from '../theming/transitions';

export const DIRECTION_4WAY: Record<string, 'from-left' | 'from-right' | 'from-top' | 'from-bottom'> = {
  left: 'from-left', right: 'from-right', up: 'from-top', down: 'from-bottom',
};

/** What a presentation may need beyond the transition itself: the composition's
 *  pixel size, the BRAND's accent palette — the only place a core schema's
 *  colour KEY (see `AccentKey`) can become an actual hex — and, since Phase 4,
 *  the brand's own transition registry. All three are optional so a renderer
 *  that has no theme in scope still composes: no palette means a colour key
 *  falls back to the presentation's own neutral, and no registry means core's
 *  generics are the only tier, exactly as before the axis existed. */
type Dims = {
  width: number;
  height: number;
  palette?: readonly AccentSlot[];
  transitions?: TransitionRegistry;
};

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
//
// The return type is `ResolvedTransition | null`, not `AnyPresentation | null`:
// since Task 2.1 four of core's own kinds (`wipe`, `checkerboard`, `pixelate`,
// `scanline-glitch`) are NATIVE two-input nodes rather than one-sided
// presentations core lifts.
type Renderer<K extends TransitionKind> = (t: Extract<CoreTransition, { kind: K }>, dims: Dims) => ResolvedTransition | null;

const PRESENTATIONS: { [K in TransitionKind]: Renderer<K> } = {
  // `cut` is the absence of a transition; the gate in ./transition-record
  // filters it out long before here, but the map must still cover it.
  [CUT_KIND]: () => null,
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
  }),
  'gradient-wipe': (t) => gradientWipe({ direction: t.direction, softness: t.softness }) as AnyPresentation,
  // Every param below is optional on both sides: the schema member makes it
  // optional, and the presentation destructures it with its own default — so
  // passing an explicit `undefined` through is exactly "use your default", the
  // same contract `burn` and `gradient-wipe` above already rely on.
  'rgb-split': (t) => rgbSplit({ direction: t.direction, displacement: t.displacement }) as AnyPresentation,
  'scanline-glitch': (t) => scanlineGlitch({ rgbShiftPx: t.rgbShiftPx }),
  'light-leak': (t) => lightLeak({
    temperature: t.temperature, direction: t.direction, intensity: t.intensity, flareArtifacts: t.flareArtifacts,
  }) as AnyPresentation,
  'zoom-blur': (t) => zoomBlur({
    direction: t.direction, blurAmount: t.blurAmount, scaleAmount: t.scaleAmount, origin: t.origin,
  }) as AnyPresentation,
  'pixelate': (t) => pixelate({
    maxBlockSize: t.maxBlockSize, gridSize: t.gridSize,
    scanlines: t.scanlines, glitchArtifacts: t.glitchArtifacts, randomness: t.randomness,
  }),
  // `easing` is not forwarded — it has no schema field (a function can't live
  // in a config), so the presentation's own Easing.out(Easing.cubic) applies.
  'checkerboard': (t) => checkerboard({
    gridSize: t.gridSize, pattern: t.pattern, stagger: t.stagger, squareAnimation: t.squareAnimation,
  }),
};

/** Core's own presentations, adapted to the shared axis signature — ONE prop
 *  bag in, a presentation out — so they can be the `generics` argument of the
 *  shared `resolveRegistered`. The per-kind narrowing above is preserved by
 *  keeping `PRESENTATIONS` as the typed map and wrapping it here: the compiler
 *  still demands an entry per `TransitionKind`, and each entry still receives
 *  its own narrowed union member.
 *
 *  The cast is the widening of that narrowed parameter back to the axis' open
 *  `Transition`, and nothing else — a core entry only ever runs for its own
 *  key, which `PRESENTATIONS`' key type guarantees. */
const CORE_TRANSITIONS: Record<string, TransitionRenderer> = Object.fromEntries(
  (Object.entries(PRESENTATIONS) as Array<[string, Renderer<TransitionKind>]>).map(([kind, render]) => [
    kind,
    ({ transition, width, height, palette }) =>
      render(transition as Extract<CoreTransition, { kind: TransitionKind }>, { width, height, palette }),
  ]),
);

// `cut`/absent/unrecognised → null (hard cut, no wrap). "Unrecognised" now covers
// two cases: a hand-edited Root.tsx literal that is not schema-validated, and a
// BRAND kind neither core nor the brand's own registry has a renderer for. Either
// way the lookup misses and the boundary is a hard cut; `getTransitionRecord` is
// what says so out loud (once per kind, in dev).
//
// THE BRAND TIER LIVES IN THE `resolveRegistered` CALL BELOW. That one line is
// the whole of what this task added: brand registration wins, core's generic
// sits beneath it, and a registration carrying only `config` falls through to
// the generic rather than masking it — the same rule every other extension
// axis uses, not a bespoke lookup of its own.
export function resolveTransition(t: TransitionRecord | undefined, dims: Dims): ResolvedTransition | null {
  if (!t) return null;
  // The index is deliberately widened to `string` before the lookup: `t.kind` is
  // `string` for a brand transition, and a missing key must be a runtime `undefined`
  // rather than a compile error at the call site.
  //
  // `hasOwn` is load-bearing NOW in a way it wasn't before Phase 4. While the
  // schema was closed, no authored kind could reach `Object.prototype`; now any
  // non-core string parses, and `{kind:'constructor', frames:20}` would otherwise
  // return an inherited FUNCTION that this code would then call as a renderer.
  // It has to gate BOTH tiers: `resolveRegistered` indexes the generics record
  // directly, so the guard cannot move inside it.
  const kind: string = t.kind;
  const registry = dims.transitions;
  const known =
    Object.prototype.hasOwnProperty.call(CORE_TRANSITIONS, kind) ||
    (registry !== undefined && Object.prototype.hasOwnProperty.call(registry, kind));
  if (!known) return null;
  const render = resolveRegistered(registry, kind, CORE_TRANSITIONS);
  if (!render) return null;
  return render({
    transition: t,
    width: dims.width,
    height: dims.height,
    palette: dims.palette ?? [],
    config: registrationConfig(registry, kind),
  });
}

// Invokes ONE SIDE of a one-sided presentation directly (not via
// TransitionSeries) with the exact prop shape it expects. Since Task 1.3 this
// is no longer a render-path component in its own right: it is the layer
// `fromRemotionPresentation` builds a two-input node out of, called twice — once
// per input — inside a SINGLE node invocation.
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

/** The ONE-SIDED view of a resolved kind: the `{component, props}` presentation,
 *  or null when the kind resolves to nothing OR to a natively two-input node
 *  (which has no one-sided form to hand back).
 *
 *  Kept as a named export because it is the accessor brands and the editor's
 *  wiring suite have used since the engine was extracted. The RENDER path does
 *  not go through it any more — see `transitionNodeFor`.
 *
 *  WHY THE WARNING. Every caller of this function feeds the result to
 *  `TransitionSeries.Transition`, and every one of them treats `null` as "no
 *  transition" — a HARD CUT. That was harmless while `null` only ever meant
 *  `cut` or an unrecognised kind. Since Task 2.1 it also means "this kind is a
 *  two-input node", which is a real, authored transition silently degrading to
 *  nothing, with no type error to catch it (the signature never changed and
 *  `null` was always legal).
 *
 *  There is deliberately NO compatibility shim faking a one-sided form for a
 *  two-input node: a wrong picture rendered silently is worse than a visible
 *  degradation. The caller has to move to `transitionNodeFor` /
 *  `AtCutTransition` (or `buildVideoNodes`), and this says so out loud, once
 *  per kind, in dev. */
export function presentationFor(t: TransitionRecord | undefined, dims: Dims): AnyPresentation | null {
  const resolved = resolveTransition(t, dims);
  if (!resolved) return null;
  if (isTransitionNode(resolved)) {
    const kind = t!.kind;
    warnOnce(
      `presentationFor:two-input:${kind}`,
      () =>
        `[video-toolkit] transition kind "${kind}" is a TWO-INPUT node and has no one-sided ` +
        'presentation, so presentationFor() returns null and this boundary will render as a ' +
        'HARD CUT. Drive it through transitionNodeFor() + AtCutTransition (or buildVideoNodes) ' +
        'instead of TransitionSeries. See docs/superpowers/phase4-migrations.md.',
    );
    return null;
  }
  return resolved;
}

/** LIFTS a one-sided Remotion presentation into the two-input model: render
 *  `from` through the presentation's EXITING branch, `to` through its ENTERING
 *  branch, and stack entering over exiting — which is `TransitionSeries`' own
 *  compositing order, and (before Task 1.3) exactly what two sibling
 *  `AtCutTransition` wrappers produced across a cut.
 *
 *  This is the compatibility route, not a compromise: the five official
 *  `@remotion/transitions` presentations are one-sided by design and keep
 *  working unchanged, as does every brand registration written against Task
 *  1.2's contract. A null input renders NOTHING on that side — which is how the
 *  leading and trailing edges reproduce their pre-1.3 pixels, where the missing
 *  neighbour simply had no `Sequence` on screen. */
export function fromRemotionPresentation(p: AnyPresentation): TransitionNode {
  const composite: React.FC<TransitionNodeProps> = ({ from, to, progress, durationInFrames }) => (
    <>
      {from === null ? null : (
        <TransitionLayer presentation={p} direction="exiting" progress={progress} durationInFrames={durationInFrames}>
          {from}
        </TransitionLayer>
      )}
      {to === null ? null : (
        <TransitionLayer presentation={p} direction="entering" progress={progress} durationInFrames={durationInFrames}>
          {to}
        </TransitionLayer>
      )}
    </>
  );
  return { composite };
}

/** THE RENDER PATH. Resolves a kind to the two-input node the boundary drives,
 *  lifting a one-sided presentation on the way when that is what it resolved
 *  to. */
export function transitionNodeFor(t: TransitionRecord | undefined, dims: Dims): TransitionNode | null {
  const resolved = resolveTransition(t, dims);
  if (!resolved) return null;
  return isTransitionNode(resolved) ? resolved : fromRemotionPresentation(resolved);
}

// THE BOUNDARY COMPOSITOR. Mounted inside the boundary's OWN `Sequence` (see
// video-track.tsx), so `useCurrentFrame()` is already boundary-relative: frame 0
// is the first frame of the transition and frame `frames` is its last.
//
// It resolves ONE node and calls it ONCE with (from, to, progress). It is NOT
// called twice with a `direction` — that was `TransitionSeries`' shape, and
// asking a two-input operation to draw itself one side at a time is what
// produced core's whole defect family (seven kinds that no-op when exiting,
// `checkerboard`'s empty cells, `wipe`'s two beats running simultaneously, a
// trailing edge that draws nothing). A one-sided presentation still works: it
// is LIFTED by `fromRemotionPresentation` at resolution time, not re-invoked
// here.
//
// PROGRESS IS CLAMPED HERE, deliberately not left to each presentation's own
// interpolate() calls — several of the custom ones (whipPan, zoomThrough) don't
// set extrapolateLeft/Right and would run away outside the window otherwise.
// The boundary Sequence normally bounds the frame anyway; the clamp is what
// makes that a guarantee of the CONTRACT rather than a property of one caller,
// so a node may be driven from anywhere and still never see progress outside
// [0,1].
export const AtCutTransition: React.FC<{
  /** The resolved node, or null for a hard cut (both inputs drawn plainly). */
  node: TransitionNode | null;
  /** The outgoing clip — null at the reel's leading edge. */
  from: React.ReactNode | null;
  /** The incoming clip — null at the reel's trailing edge. */
  to: React.ReactNode | null;
  /** The boundary's length in frames. */
  frames: number;
  dims: { width: number; height: number; fps: number; palette?: readonly AccentSlot[] };
}> = ({ node, from, to, frames, dims }) => {
  const frame = useCurrentFrame();
  const progress = frames > 0 ? Math.max(0, Math.min(1, frame / frames)) : 1;
  if (!node) {
    // No node: a hard cut. Draw both inputs in their natural order rather than
    // dropping one — the caller decided this window belongs to the boundary.
    // eslint-disable-next-line react/jsx-no-useless-fragment
    return <>{from}{to}</>;
  }
  const Composite = node.composite;
  return (
    <Composite
      from={from}
      to={to}
      progress={progress}
      durationInFrames={frames}
      width={dims.width}
      height={dims.height}
      fps={dims.fps}
      palette={dims.palette ?? []}
    />
  );
};
