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
  fadeToColor, edgeInput,
} from '../transitions';
import { useCurrentFrame } from 'remotion';
import { getTransitionRecord, type TransitionRecord } from './transition-record';
import { resolveAccentOrColor, type AccentSlot } from '../theming/palette';
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
// presentations core lifts. `fade-to-color` joins them CONDITIONALLY — only
// when its `color` key resolves against the brand's palette, because only then
// is there a dip to express; with no colour it is the plain one-sided fade.
type Renderer<K extends TransitionKind> = (t: Extract<CoreTransition, { kind: K }>, dims: Dims) => ResolvedTransition | null;

// Shared by the catalog's only two `AccentOrColorHex` fields — `fade-to-color`'s
// `color` and `wipe`'s `color` (see `ACCENT_OR_COLOR_FIELDS` in
// `../reel-config-base/transition-schema.ts`) — so the two kinds diagnose an
// unresolvable colour key IDENTICALLY rather than one warning and the other
// silently degrading. `wipe` used to be the latter: its fallback to the
// presentation's own `#000` neutral had no diagnostic at all, so an
// unresolvable accent key rendered a black sweep and told nobody, one step
// behind `fade-to-color`'s warning for no reason but that nobody had written
// it.
//
// `color` is DUAL, since the Phase 4 widening: either a brand accent-slot key
// (resolved through the palette) OR a literal colour (hex), used as-is with no
// palette lookup at all. A literal can never be "unresolved" — see
// `resolveAccentOrColor` (lib/theming/palette.ts) — so the warning fires only
// for a key that genuinely failed to resolve, never for a literal.
//
// Both causes an author cannot tell apart from the picture — an unthreaded
// `palette` at the `buildVideoNodes` call site, or a key that is not an
// `accentSlots` member — land here indistinguishably, so the message names
// both. `color === undefined` is NOT one of them: "no colour" is documented,
// intentional behaviour for both kinds, and warning on it would cry wolf on
// every reel that uses it deliberately. `color === ''` is the SAME carve-out:
// the editor's own dual control (`AccentOrColorField`, LayeredInspector.tsx)
// commits an empty string the instant "Custom colour" is picked, before
// anything is typed, so an empty string is the editor's OWN placeholder, not
// an authored key a human typed.
//
// `consequence` is the one thing that differs between the two call sites — what
// the caller does with a `null` result — and is folded into the message rather
// than the caller composing its own text, so the two kinds stay byte-identical
// everywhere except that clause.
function resolveAccentColorOrWarn(
  kind: 'fade-to-color' | 'wipe',
  color: string | undefined,
  palette: readonly AccentSlot[],
  consequence: string,
): string | null {
  const resolved = resolveAccentOrColor(palette, color ?? null);
  if (resolved === null && color !== undefined && color !== '') {
    warnOnce(
      `transition:${kind}:unresolved:${color}`,
      () =>
        `[video-toolkit] transition "${kind}" has color "${color}", which resolved to no colour, so ` +
        `${consequence}. \`color\` accepts EITHER a literal colour (a \`#\`-prefixed hex value) OR a ` +
        'brand ACCENT-SLOT KEY — this value is not a literal (not `#`-prefixed), so it was read as a ' +
        'key. Either the brand theme does not declare that slot in `accentSlots`, or the renderer never ' +
        'threaded `palette` into buildVideoNodes() — check the call site before the theme, because an ' +
        'unthreaded palette makes EVERY key fail identically. (Warning only; nothing is blocked, and ' +
        'this is reported once per key.)',
    );
  }
  return resolved;
}

const PRESENTATIONS: { [K in TransitionKind]: Renderer<K> } = {
  // `cut` is the absence of a transition; the gate in ./transition-record
  // filters it out long before here, but the map must still cover it.
  [CUT_KIND]: () => null,
  // `dissolve` is the canonical name for the A→B blend; `fade` is its synonym
  // and renders identically. Both stay — a baked `{kind:'fade'}` literal must
  // keep meaning crossfade (see the catalog note).
  'fade': () => fade() as AnyPresentation,
  'dissolve': () => fade() as AnyPresentation,
  // THE MISSING PARAMETER (Task 2.3). `t.color` is a brand accent-slot KEY,
  // resolved here where the palette is in scope — exactly as `wipe` does.
  //
  // NO COLOUR → THE PLAIN CROSSFADE. An unresolvable key lands here too, and
  // that is the point: core inventing a colour for a key the brand did not
  // declare would be the brand leak this programme exists to remove. CORE NAMES
  // NO COLOUR IN THIS FILE AT ALL — not even a "neutral" default, because a
  // default colour is still core deciding what a brand's dip looks like.
  //
  // The conditional arity is deliberate and is pinned in the editor suite: with
  // a resolved colour this is a native two-input NODE (a dip has no one-sided
  // form); with none it is the same one-sided presentation `fade` returns.
  'fade-to-color': (t, dims) => {
    // `t.color` is DUAL, since the Phase 4 widening: either a brand
    // accent-slot key (resolved through the palette, as before) OR a literal
    // colour (hex), used as-is with no palette lookup at all. A literal can
    // never be "unresolved" — see `resolveAccentOrColor`
    // (lib/theming/palette.ts) — so the warning below fires only for a key
    // that genuinely failed to resolve, never for a literal.
    const color = resolveAccentColorOrWarn(
      'fade-to-color', t.color, dims.palette ?? [],
      'this boundary renders as a PLAIN CROSSFADE with no dip',
    );
    // AN AUTHORED COLOUR THAT RESOLVES TO NOTHING IS A BUG, NOT A CHOICE — and
    // until it said so, it was an INVISIBLE one. Falling back to `fade()` is
    // still the right RENDER (core naming a colour of its own is the leak this
    // programme removes), but the fallback is indistinguishable from the
    // author's intent in every observable: the frames, deleting the slot, and
    // forcing the slot to another colour all look identical, because the key
    // was never read. A real brand migration shipped on exactly that silence,
    // concluding `color` was inert when in fact its caller never threaded
    // `palette` into `buildVideoNodes`. `resolveAccentColorOrWarn` (below)
    // carries the shared reasoning for why the warning fires exactly when it
    // does; `wipe` hits the identical gap via the same helper.
    return color === null ? (fade() as AnyPresentation) : fadeToColor({ color });
  },
  // Task 2.4: forward the four params `glitch.tsx` always read but no schema
  // field could set. Every field is optional on both sides, so an explicit
  // `undefined` for an omitted one is exactly "use the presentation's own
  // default" — same contract `burn`/`gradient-wipe` already rely on.
  'glitch': (t) => glitch({
    intensity: t.intensity, slices: t.slices, rgbShift: t.rgbShift, scanLines: t.scanLines,
  }) as AnyPresentation,
  'burn': (t) => burn({ mask: t.mask, glowColor: t.glowColor, edgeContrast: t.edgeContrast, glowBand: t.glowBand }) as AnyPresentation,
  'slide': (t) => slide({ direction: DIRECTION_4WAY[t.direction] ?? 'from-left' }) as AnyPresentation,
  'flip': (t) => flip({ direction: DIRECTION_4WAY[t.direction] ?? 'from-left' }) as AnyPresentation,
  // Task 2.4: `blurAmount` was read by `whip-pan.tsx` but never reachable.
  'whip-pan': (t) => whipPan({ direction: t.direction, blurAmount: t.blurAmount }) as AnyPresentation,
  // Task 2.4: `zoomAmount` was read by `zoom-through.tsx` but never reachable.
  //
  // Task 2.5: the schema field is `direction` now — the same spelling
  // `zoom-blur` has always used for the same in/out concept. `from` is a
  // DEPRECATED ALIAS and is still honoured, because a baked literal must keep
  // rendering what it rendered; `direction` wins when both are present, and
  // absent-both is the presentation's own `'in'` default, exactly as before.
  'zoom-through': (t) => {
    if (t.direction === undefined && t.from !== undefined) {
      warnOnce(
        'transition:deprecated:zoom-through.from',
        () =>
          '[video-toolkit] transition "zoom-through" field `from` is DEPRECATED: it is a second ' +
          'name for what every other kind (zoom-blur, rgb-split, light-leak) calls `direction`. ' +
          'Rename it to `direction` — same values, same rendering. Rendering unchanged. ' +
          'See docs/superpowers/phase4-migrations.md.',
      );
    }
    return zoomThrough({ direction: t.direction ?? t.from, zoomAmount: t.zoomAmount }) as AnyPresentation;
  },
  'clock-wipe': (_t, dims) => clockWipe({ width: dims.width, height: dims.height }) as AnyPresentation,
  'iris': (_t, dims) => iris({ width: dims.width, height: dims.height }) as AnyPresentation,
  // `t.color` is DUAL (same widening as `fade-to-color.color`, see there): a
  // brand accent-slot KEY, resolved here where the palette is in scope, OR a
  // literal colour (hex), used as-is with no palette lookup. Unknown/unset →
  // undefined → the presentation's own neutral sweep — and, since the shared
  // `resolveAccentColorOrWarn` above, an unresolvable KEY now says so instead
  // of silently rendering that neutral as if it were chosen.
  'wipe': (t, dims) => customWipe({
    color: resolveAccentColorOrWarn(
      'wipe', t.color, dims.palette ?? [],
      'this boundary renders the sweep in its default neutral colour instead of the intended accent',
    ) ?? undefined,
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
  if (!render) {
    // Task 6.3, warning 8. `known` is true here, so this branch is reached
    // ONLY when the registry (not core) declares `kind` and that registration
    // has no `renderer` — i.e. the exact "config-only registration for a
    // BRAND-ONLY kind" case. For a GENUINE core kind, `CORE_TRANSITIONS[kind]`
    // is always defined and `render` cannot be falsy, so this never fires for
    // a config-only registration of a real core kind (that case is CORRECT:
    // it falls through to core's generic, per Task 6.2's negative pin).
    //
    // Review round 1, MINOR — left AS-IS, not fixed, but not glossed over
    // either: `resolveRegistered`'s `generics[kind]` is an UNGUARDED bracket
    // read (registry.ts:63), so `kind: 'constructor'` resolves the inherited
    // `Object.prototype.constructor` function via the prototype chain even
    // though `CORE_TRANSITIONS` does not OWN that key — making `render`
    // truthy and this warning silently NOT fire for that one specific string,
    // despite 'constructor' having no real core generic either. This is a
    // pre-existing property of the shared resolver (not introduced here), the
    // render path itself already guards the ACTUAL invocation against it (the
    // `known` check above uses `hasOwnProperty`, precisely because
    // `{kind:'constructor'}` must not resolve to a callable renderer) — only
    // THIS diagnostic's precision is affected, not correctness of what
    // renders. Unlike the video/overlay/effect/brand axes, the transition
    // axis has no generic beneath a kind core never heard of — there is
    // nothing to fall through to, so "declared" degrades straight to a
    // silent hard cut.
    warnOnce(`transition-config-only:${kind}`, () =>
      `[video-toolkit] Transition kind "${kind}" is registered on the brand theme with \`config\` (and/or ` +
      'params) but no `renderer`, and core has no generic for this kind — "declared" is not "handled". ' +
      'This boundary renders as a hard cut. Add a `renderer` to the registration (or remove it if the ' +
      'kind was never meant to render). (Warning only; nothing is blocked, and this is reported once per kind.)');
    return null;
  }
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
 *  1.2's contract.
 *
 *  A NULL INPUT IS THE COMPOSITION BACKGROUND (Task 2.2), not nothing. Task 1.3
 *  drew nothing on the missing side, which reproduced the pre-1.3 pixels
 *  exactly — and preserved the defect that came with them: a one-sided
 *  presentation whose EXITING branch is the identity function (`fade`,
 *  `dissolve`, `fade-to-color` with no colour, `burn`, `clock-wipe`, `iris`,
 *  `gradient-wipe`) did
 *  literally nothing as a `transitionOut`, because the only branch that draws
 *  had no input. Feeding it a plate of `background` is what makes the reel's
 *  trailing edge actually fade — and it is the same operation at the leading
 *  edge, where the incoming clip now resolves OUT of the background rather than
 *  out of nothing. `background` is `transparent` when the caller has none, so
 *  that route still paints exactly what 1.3 did. */
export function fromRemotionPresentation(p: AnyPresentation): TransitionNode {
  const composite: React.FC<TransitionNodeProps> = ({ from, to, progress, durationInFrames, background }) => (
    <>
      <TransitionLayer presentation={p} direction="exiting" progress={progress} durationInFrames={durationInFrames}>
        {edgeInput(from, background)}
      </TransitionLayer>
      <TransitionLayer presentation={p} direction="entering" progress={progress} durationInFrames={durationInFrames}>
        {edgeInput(to, background)}
      </TransitionLayer>
    </>
  );
  return { composite };
}

// TASK R1 — FIX 3, UNIVERSAL (not preview-gated: this is pure caching of a
// pure function's result, so it changes nothing about what gets drawn, in
// preview OR at render time).
//
// THE AMPLIFIER. `fromRemotionPresentation` (above) — and every native
// two-input presentation that follows the same shape (`wipe.tsx`,
// `pixelate.tsx`, `checkerboard.tsx`, `scanline-glitch.tsx`,
// `fade-to-color.tsx`) — defines its `composite` component INSIDE the
// factory, so every call returns a brand-new function reference. `node` is
// used as a JSX ELEMENT TYPE at the call site (`<node.composite .../>` in
// `AtCutTransition`), and React remounts a subtree whenever its element type
// changes between renders — even when every prop is identical. Since
// `buildVideoNodes` calls `transitionNodeFor` fresh on every render of
// `LayeredReelComposition`, ANY re-render (every inspector edit — playback
// itself is memoized, see `EditorHost.tsx`) handed EVERY boundary a new
// element type and remounted its videos, whether or not that boundary's own
// config had changed.
//
// Rather than restructure five presentation files to take their params via
// props/context instead of closure (a public-contract change that reaches
// brand-authored `TransitionNode`s too), this caches the RESOLVED node per
// distinct (transition record, palette, size) — the brief's sanctioned
// alternative ("memoize transitionNodeFor per boundary record"). A boundary
// whose authored config is unchanged between renders gets back the exact
// same node/composite reference and does not remount. A boundary whose
// params genuinely changed (e.g. mid-drag on its own slider) still gets a new
// node — unavoidable, since its picture actually differs — but that no
// longer drags every OTHER boundary down with it.
//
// Keyed first by the TRANSITIONS REGISTRY object (a brand-theme-level
// reference, stable for a session) via a WeakMap, so a registry swap (hot
// reload, a different brand — or, within one process, two THEMES that happen
// to register the same kind NAME with different renderers) can never serve a
// stale cross-registry hit; without this, `{kind:'sweep',...}` resolved
// against theme A's registry could hand theme B's boundary theme A's node,
// because the two would otherwise collide on an identical JSON key. Keyed
// second by a JSON digest of the record + the dims that can change what it
// resolves to.
//
// Bounded per registry, and genuinely LRU (Review Round 1 finding — see
// `transitionNodeFor`'s docblock for why a plain FIFO defeats this cache in
// exactly the scenario it exists for): a long slider drag that visits
// hundreds of distinct param values cannot grow this without limit, and the
// entries it evicts are the ones least likely to be asked for again, not
// whichever boundary happened to render first.
const TRANSITION_NODE_CACHE_LIMIT = 64;
const NO_REGISTRY: TransitionRegistry = {};
let transitionNodeCacheByRegistry = new WeakMap<TransitionRegistry, Map<string, TransitionNode>>();

function transitionNodeCacheFor(registry: TransitionRegistry | undefined): Map<string, TransitionNode> {
  const registryKey = registry ?? NO_REGISTRY;
  let cache = transitionNodeCacheByRegistry.get(registryKey);
  if (!cache) {
    cache = new Map();
    transitionNodeCacheByRegistry.set(registryKey, cache);
  }
  return cache;
}

/** Forget every memoized node. For tests only — this module's cache is
 *  otherwise meant to live for the whole process, the same as `warnOnce`'s
 *  SEEN set, so a suite asserting eviction/identity behaviour from a known
 *  empty state needs a way to get one (see `resetWarnOnce` in
 *  `./warn-once.ts` for the same pattern, same reason). */
export function resetTransitionNodeCache(): void {
  transitionNodeCacheByRegistry = new WeakMap();
}

/** THE RENDER PATH. Resolves a kind to the two-input node the boundary drives,
 *  lifting a one-sided presentation on the way when that is what it resolved
 *  to. Memoized — see the block above — so repeated calls with an unchanged
 *  record/dims return the SAME node, not merely an equivalent one.
 *
 *  `resolveTransition` ALWAYS RUNS, cache hit or not — it is not only a pure
 *  computation, it is also the SITE of `resolveAccentColorOrWarn`'s
 *  `warnOnce` diagnostics (`wipe`/`fade-to-color`'s unresolved-accent-key
 *  warning). Skipping that call on a cache hit would make the warning's OWN
 *  de-duplication (which already guarantees "at most once, ever") into "at
 *  most once, and only if this exact config was never memoized before" — a
 *  strictly weaker guarantee that broke three existing tests the first time
 *  this was tried (they call `resetWarnOnce()` between cases and expect the
 *  render path to re-diagnose on request). What the cache memoizes is only
 *  the FINAL node object/composite reference `resolveTransition`'s result
 *  turns into — never whether the resolution logic itself runs.
 *
 *  LRU, NOT FIFO (Review Round 1 finding, fixed here). `Map.get` does not
 *  reorder a `Map`'s keys — only insertion does — so a plain
 *  "evict-the-first-key-when-full" policy evicts in INSERTION order, which is
 *  the OPPOSITE of what a size-bounded cache should evict under this
 *  workload: a reel's STABLE boundaries are inserted once, on the first
 *  render, making them the OLDEST entries; a boundary the user is actively
 *  dragging a slider on inserts one NEW key per drag step. Past
 *  `TRANSITION_NODE_CACHE_LIMIT` steps of one drag, FIFO evicts every stable
 *  boundary's entry first and keeps nothing but the dragged one's history —
 *  exactly backwards, and it silently regresses every OTHER boundary back to
 *  a fresh node (and therefore a remount) on the very next render, which is
 *  precisely the "slow while tuning" complaint this task exists to fix. The
 *  two-line fix: touch a hit by re-inserting it, which `Map` orders as
 *  MOST-recently-used; eviction then removes the true least-recently-used
 *  entry, which for a drag is an earlier VALUE of the param being dragged,
 *  never a stable boundary. */
export function transitionNodeFor(t: TransitionRecord | undefined, dims: Dims): TransitionNode | null {
  const resolved = resolveTransition(t, dims);
  if (!resolved) return null;

  const cache = transitionNodeCacheFor(dims.transitions);
  const key = JSON.stringify({ t, width: dims.width, height: dims.height, palette: dims.palette });
  const cached = cache.get(key);
  if (cached) {
    // Re-insert to mark MOST-recently-used — `Map` iterates in insertion
    // order, so this is what makes eviction (below) genuinely LRU.
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }

  const node = isTransitionNode(resolved) ? resolved : fromRemotionPresentation(resolved);
  if (cache.size >= TRANSITION_NODE_CACHE_LIMIT) {
    const leastRecentlyUsedKey = cache.keys().next().value;
    if (leastRecentlyUsedKey !== undefined) cache.delete(leastRecentlyUsedKey);
  }
  cache.set(key, node);
  return node;
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
  dims: {
    width: number; height: number; fps: number;
    palette?: readonly AccentSlot[];
    /** `CompositionTheme.background` — what a null input resolves to (Task
     *  2.2). Optional so a caller with no theme in scope still composes;
     *  absent becomes `transparent`, which paints nothing. Core never
     *  substitutes a colour of its own. */
    background?: string;
  };
}> = ({ node, from, to, frames, dims }) => {
  const frame = useCurrentFrame();
  const progress = frames > 0 ? Math.max(0, Math.min(1, frame / frames)) : 1;
  if (!node) {
    // No node: a hard cut. Draw both inputs in their natural order rather than
    // dropping one — the caller decided this window belongs to the boundary.
    // eslint-disable-next-line react/jsx-no-useless-fragment
    return <>{from}{to}</>;
  }
  if (typeof node.plan === 'function') {
    // `typeof`, not `'plan' in node`: `plan?: never` is OPTIONAL, so
    // `{ composite: X, plan: undefined }` — a plausible shape for a
    // spread-built node — is a legal composite node whose `plan` KEY still
    // exists. `'in'` would take this branch for that node; `typeof` checks
    // the VALUE and does not. Matches `isTransitionNode`'s own discriminant.
    //
    // Phase 5 Task 1.1: `TransitionNode` widened to admit the `plan` arm, but
    // nothing can produce one yet — no presentation returns `{ plan }` until
    // Stage 4 migrates a kind and Stage 1.2 wires this component to actually
    // DRIVE `plan`. This branch is therefore unreachable in the current repo.
    // It exists anyway rather than falling through silently, because an
    // unreachable branch that hard-cuts without saying so is exactly how core
    // lost four transition kinds once already (`at-cut-transition-findings.md`)
    // — a hand-built or future node reaching here should be loud, not quiet.
    // Same fallback as the `!node` branch above: draw both inputs plainly.
    warnOnce(
      'at-cut-transition:plan-arm-unwired',
      () =>
        '[video-toolkit] a transition node supplied `plan` instead of `composite`, but ' +
        'AtCutTransition cannot drive the plan arm yet — that lands in Stage 1.2 of ' +
        'docs/superpowers/phase5-single-mount-design.md. This boundary is rendering as a HARD CUT.',
    );
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
      background={dims.background ?? 'transparent'}
    />
  );
};
