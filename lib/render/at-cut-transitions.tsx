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
  fadeToColor,
} from '../transitions';
import { getTransitionRecord, type TransitionRecord } from './transition-record';
import { resolveAccentOrColor, type AccentSlot } from '../theming/palette';
import { resolveRegistered, registrationConfig } from '../theming/registry';
import { isTransitionNode } from '../theming/transitions';
import type {
  AnyPresentation, ResolvedTransition, TransitionNode, TransitionComposite,
  TransitionRegistry, TransitionRenderer,
} from '../theming/transitions';
import { useActiveTransitionProgress } from './video-track-plan';
import { warnOnce } from './warn-once';
import { CUT_KIND } from '../reel-config-base/transition-schema';
import type { CoreTransition, TransitionKind } from '../reel-config-base/transition-schema';

export { getTransitionRecord, type TransitionRecord };
export { isTransitionNode };

// Re-exported: the type is DEFINED in lib/theming (BrandTheme has to name it,
// and lib/theming may not import lib/render), but this has been its import path
// since before the transition axis had a theme surface.
export type {
  AnyPresentation, TransitionNode, ResolvedTransition,
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
// `scanline-glitch`) were NATIVE two-input nodes rather than one-sided
// presentations core lifts; Phase 5 Task 3 adds a fifth, `rgb-split` (it used
// to be lifted via `fromRemotionPresentation`, now it is a native `plan`
// node too). `fade-to-color` joins them CONDITIONALLY — only when its `color`
// key resolves against the brand's palette, because only then is there a dip
// to express; with no colour it is the plain one-sided fade.
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
  // PHASE 5 TASK 2.2 — `gradientWipe` is now a NATIVE two-input `plan` node
  // (see lib/transitions/presentations/gradient-wipe.tsx), not a one-sided
  // `TransitionPresentation` core lifts. No `as AnyPresentation` cast: the
  // factory's return type IS `TransitionNode` now.
  'gradient-wipe': (t) => gradientWipe({ direction: t.direction, softness: t.softness }),
  // Every param below is optional on both sides: the schema member makes it
  // optional, and the presentation destructures it with its own default — so
  // passing an explicit `undefined` through is exactly "use your default", the
  // same contract `burn` and `gradient-wipe` above already rely on.
  //
  // PHASE 5 TASK 3 — `rgbSplit` is now a NATIVE two-input `plan` node (see
  // lib/transitions/presentations/rgb-split.tsx), not a one-sided
  // `TransitionPresentation` core lifts. No `as AnyPresentation` cast: the
  // factory's return type IS `TransitionNode` now, same as `gradientWipe`
  // above.
  'rgb-split': (t) => rgbSplit({ direction: t.direction, displacement: t.displacement }),
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
// TransitionSeries) with the exact prop shape it expects.
//
// PHASE 5 TASK 5 — NO LONGER EXPORTED. This used to be the layer
// `fromRemotionPresentation` built its `composite` React component out of,
// called twice per boundary invocation (once per input) inside a single
// node call. `fromRemotionPresentation` (and the `composite` arm it fed) is
// deleted; the ONLY remaining caller is `wrapRemotionPresentation`'s `Wrap`
// component below, which calls it once per FRAME instead, reading its own
// live progress off context. Nothing outside this file used the public
// export (`git grep -n 'TransitionLayer' lib/editor/src` before this task
// found only `at-cut-transitions.test.tsx`'s own direct unit tests of it,
// migrated in this task — see task-5-report.md).
const TransitionLayer: React.FC<{
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
 *  PHASE 5 TASK 5 — THE WARNING STAYS; ONLY ITS WORDING CHANGED, AND THE
 *  BRIEF'S OWN PRESCRIPTION TO DELETE IT WAS WRONG. §6's deletion table
 *  reasoned "every kind resolves to a node; no one-sided render path is left
 *  to warn about" — true of every kind `wrapRemotionPresentation` lifts from
 *  a one-sided presentation. Post-flip that lift is UNGATED (the old
 *  `WRAP_PLAN_KINDS` allowlist is gone, see `transitionNodeFor` below), so it
 *  covers core's 13 one-sided kinds today (`fade`, `dissolve`, `slide`,
 *  `flip`, `clock-wipe`, `iris`, `fade-to-color`'s no-colour fallback,
 *  `burn`, `glitch`, `light-leak`, `whip-pan`, `zoom-through`, `zoom-blur`)
 *  plus any brand-registered kind that likewise resolves to a plain
 *  presentation — because `resolveTransition` still hands THOSE back as a
 *  plain `AnyPresentation` — the lift to `plan` happens one level up, in
 *  `transitionNodeFor`, which `presentationFor` never calls. But `wipe`, `checkerboard`, `pixelate`,
 *  `gradient-wipe`, `rgb-split`, `scanline-glitch` and `fade-to-color` WITH a
 *  resolved colour are NATIVE two-input nodes straight out of
 *  `resolveTransition` — unaffected by this task, since their factories
 *  already returned `{ plan }` since Stages 2-4 — and have no one-sided form
 *  today, same as before this task. Deleting this warning would silently
 *  hard-cut those seven kinds at every `presentationFor` call site with NO
 *  diagnostic, which is the exact regression Task 2.3's brief named and this
 *  warning exists to prevent; measured (not assumed) against
 *  `examples/layered-minimal`'s `web-program-intro`-shaped call: `wipe`,
 *  `checkerboard`, `pixelate`, `gradient-wipe`, `rgb-split` and
 *  `scanline-glitch` still hit `isTransitionNode(resolved) === true` here at
 *  this HEAD (`at-cut-transitions.test.tsx`'s `presentationFor` block pins
 *  it). Only the MESSAGE'S mention of `AtCutTransition` — deleted this task,
 *  see the module docblock — is stale; it now names only `buildVideoNodes`.
 *
 *  WHY THE WARNING AT ALL. Every caller of this function feeds the result to
 *  `TransitionSeries.Transition`, and every one of them treats `null` as "no
 *  transition" — a HARD CUT. That was harmless while `null` only ever meant
 *  `cut` or an unrecognised kind. Since Task 2.1 it also means "this kind is a
 *  two-input node", which is a real, authored transition silently degrading to
 *  nothing, with no type error to catch it (the signature never changed and
 *  `null` was always legal).
 *
 *  There is deliberately NO compatibility shim faking a one-sided form for a
 *  two-input node: a wrong picture rendered silently is worse than a visible
 *  degradation. The caller has to move to `transitionNodeFor` (or
 *  `buildVideoNodes`), and this says so out loud, once per kind, in dev. */
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
        'HARD CUT. Drive it through transitionNodeFor() + buildVideoNodes instead of ' +
        'TransitionSeries. See docs/superpowers/phase5-migrations.md.',
    );
    return null;
  }
  return resolved;
}

/** PHASE 5 TASK 5 — `fromRemotionPresentation` DELETED. It lifted a one-sided
 *  Remotion presentation into the OLD `composite` model: render `from`
 *  through the presentation's EXITING branch, `to` through its ENTERING
 *  branch, stacked entering-over-exiting inside a JSX component the
 *  now-deleted boundary Sequence mounted. `wrapRemotionPresentation`, below,
 *  is its full replacement — the SAME presentation, driven the SAME way
 *  (same `TransitionLayer`, same `direction`/`progress`/`durationInFrames`),
 *  through the `plan`/`wrap` medium instead: no lift target remains that
 *  produces a `composite`, because `TransitionNode` no longer has that arm
 *  (`lib/theming/transitions.ts`). `edgeInput` (`lib/transitions/edge-plate.tsx`)
 *  was `fromRemotionPresentation`'s only caller and is deleted with it — a
 *  reel edge's missing side is materialised as an `EdgePlate` **timeline
 *  sibling** now (`video-track.tsx`'s `edge()`), reached through the same
 *  `LayerShell` a real clip is, which was already true for every kind that
 *  had migrated to `plan` before this task. */

/** LIFTS a one-sided Remotion presentation into the SINGLE-MOUNT `plan` arm
 *  (Phase 5 Task 2.1). PHASE 5 TASK 5 — now the UNIVERSAL lift: every kind
 *  that resolves to a plain `AnyPresentation` goes through this function,
 *  core's own catalog kinds and any brand renderer alike (see
 *  `transitionNodeFor` below — the old `WRAP_PLAN_KINDS` gate that limited
 *  this to a named subset of core kinds is deleted along with
 *  `fromRemotionPresentation`, its only other possible destination).
 *
 *  THE SAME PRESENTATION, DRIVEN THE SAME WAY, THROUGH A DIFFERENT MEDIUM.
 *  `@remotion/transitions`' own presentations style `children`; they never
 *  re-render them (design §1.1, verified from `dist/types.d.ts`), which is
 *  exactly `LayerOp.wrap`'s contract. `TransitionLayer` (above) is reused
 *  unchanged — same `presentation`, same `direction`, same `progress`, same
 *  `durationInFrames` — so a migrated kind's picture is a pure function of
 *  the same inputs the old composite fed it; only WHERE those inputs come
 *  from differs (a per-frame `ActiveTransitionProgressContext` value instead
 *  of a prop on a freshly-instantiated subtree).
 *
 *  BUILT ONCE PER RESOLVED NODE, NOT PER PLAN CALL. `Wrap`'s own contract
 *  (`LayerOp.wrap`'s doc comment) requires a STABLE component reference for
 *  an item's whole life; `plan` is invoked fresh every live frame
 *  (`VideoTrackHost`), so the two `Wrap` components are created HERE, outside
 *  `plan`, and `plan` only ever returns references to these two closures —
 *  never a new component. */
export function wrapRemotionPresentation(p: AnyPresentation): TransitionNode {
  const makeWrap = (
    direction: 'entering' | 'exiting',
  ): React.ComponentType<{ active: boolean; children: React.ReactNode }> => {
    // THE NEUTRAL PROGRESS, PER DIRECTION — chosen so `TransitionLayer` is
    // MOUNTED UNCONDITIONALLY, active or not, and only its `progress` prop
    // varies. An earlier version of this function returned `<>{children}</>`
    // (no wrapper at all) while inactive and `<TransitionLayer>…</TransitionLayer>`
    // (a real wrapping element) while active — a Fragment-to-component TYPE
    // CHANGE at `children`'s own tree position the instant `active` flips,
    // which is a genuine remount (proven RED: `video-track-remount.test.tsx`'s
    // derived ratchet failed `persists` on every one of the six migrated
    // kinds' eight cases). `LayerOp.wrap`'s contract requires the element type
    // at that position to be CONSTANT; varying only `style`/props on an
    // always-mounted `TransitionLayer` is what actually satisfies it — the
    // same rule `ItemBody`/`LayerShell` already follow elsewhere in this file
    // and `video-track.tsx`/`video-track-plan.tsx`.
    //
    // EXITING neutral is progress 0, ENTERING neutral is progress 1 — the
    // boundary the transition has not yet reached / has already finished —
    // and this is EXACT (not merely close) for all six migrated kinds:
    //   - `fade`/`dissolve`: exiting's opacity is 1 at ANY progress (no
    //     kind here ever sets `shouldFadeOutExitingScene`); entering's
    //     opacity is `progress`, so 1 at progress 1.
    //   - `clock-wipe`/`iris`: exiting's `clipPath` is `undefined` at ANY
    //     progress; entering's clip circle at progress 1 has radius
    //     `sqrt(w²+h²)/2` — exactly the half-diagonal, so the circle
    //     circumscribes the whole rectangular frame and clips nothing a
    //     rectangular layer wasn't already confined to.
    //   - `flip`: both directions' rotation is `interpolate(progress,[0,1],
    //     [x,0])`-shaped, landing on 0° (no rotation) at their own neutral
    //     endpoint.
    //   - `slide`: exact at progress 1 for ALL FOUR authored directions
    //     (`@remotion/transitions`' own `presentationProgress === 1` branch
    //     removes its anti-seam epsilon exactly at that endpoint); at
    //     progress 0 two of the four directions carry that same epsilon
    //     (a 0.01% sub-pixel translate — `slide.js`'s own deliberate
    //     anti-seam fudge, not something this lift introduces), which is
    //     the one kind/direction pair not bit-exact at rest. Immaterial in
    //     practice: sub-pixel, and the pixel harness never samples a frame
    //     outside a live window in the first place.
    const NEUTRAL_PROGRESS = direction === 'exiting' ? 0 : 1;

    const Wrap: React.FC<{ active: boolean; children: React.ReactNode }> = ({ active, children }) => {
      // A hook is legal here — `wrap` is a real React component, unlike
      // `plan` itself (design §5: "a node that genuinely needs a hook uses
      // `wrap`"). `useActiveTransitionProgress` is what makes this SAFE to
      // share across boundaries (see its own doc comment): it is scoped by
      // the TREE position `LayerShell` renders this instance at, not by this
      // closure or by `p`.
      const live = useActiveTransitionProgress();
      const progress = active ? live.progress : NEUTRAL_PROGRESS;
      return (
        <TransitionLayer presentation={p} direction={direction} progress={progress} durationInFrames={live.durationInFrames}>
          {children}
        </TransitionLayer>
      );
    };
    return Wrap;
  };
  const WrapFrom = makeWrap('exiting');
  const WrapTo = makeWrap('entering');
  // The plan itself ignores every prop it is given: both sides' pictures are
  // driven entirely by the STABLE `wrap` references above, which read their
  // own live progress off context rather than off `plan`'s own arguments.
  // Nothing about "which boundary this is" needs to reach `plan` at all —
  // the same property that makes the two `Wrap` references safe to share
  // across boundaries in the first place.
  const plan = (): TransitionComposite => ({
    from: { wrap: WrapFrom },
    to: { wrap: WrapTo },
  });
  return { plan };
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

/** PHASE 5 TASK 5 — `WRAP_PLAN_KINDS` DELETED. Tasks 2.1/2.3 gated the
 *  `wrapRemotionPresentation` lift to a named subset of core kinds
 *  (`fade`, `dissolve`, `slide`, `flip`, `clock-wipe`, `iris`,
 *  `fade-to-color`'s no-colour fallback, `burn`, `glitch`, `light-leak`,
 *  `whip-pan`, `zoom-through`, `zoom-blur`) because the OTHER lift,
 *  `fromRemotionPresentation`, was still the destination for everything not
 *  in the set — a brand renderer returning a plain one-sided presentation,
 *  in particular. Now that `fromRemotionPresentation` is deleted (there is
 *  no second lift target, and no `composite` shape left to build), the gate
 *  has nothing left to decide: `transitionNodeFor` below lifts EVERY
 *  one-sided `AnyPresentation` — core's or a brand's — through
 *  `wrapRemotionPresentation`, unconditionally. A native two-input kind
 *  (`wipe`, `checkerboard`, `pixelate`, `gradient-wipe`, `rgb-split`,
 *  `scanline-glitch`, `fade-to-color` WITH a resolved colour) is still
 *  unaffected: `isTransitionNode(resolved)` is already true for those
 *  straight out of `resolveTransition`, so the lift branch never runs for
 *  them, exactly as before this task.
 *
 *  `resolveTransition`/`presentationFor` are UNCHANGED by this deletion —
 *  they still hand back the plain `AnyPresentation` for these lifted kinds,
 *  because the lift happens one level up, in this function, which
 *  `presentationFor` never calls (see that function's own updated doc
 *  comment for why deleting ITS warning, as §6's table originally
 *  prescribed, would have been a real regression). */

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

  // PHASE 5 TASK 5 — the `WRAP_PLAN_KINDS` gate is gone: every one-sided
  // `AnyPresentation` lifts through `wrapRemotionPresentation`, unconditionally.
  const node = isTransitionNode(resolved) ? resolved : wrapRemotionPresentation(resolved);
  if (cache.size >= TRANSITION_NODE_CACHE_LIMIT) {
    const leastRecentlyUsedKey = cache.keys().next().value;
    if (leastRecentlyUsedKey !== undefined) cache.delete(leastRecentlyUsedKey);
  }
  cache.set(key, node);
  return node;
}

// PHASE 5 TASK 5 — `AtCutTransition` DELETED.
//
// It was THE BOUNDARY COMPOSITOR for the `composite` arm: mounted inside a
// boundary's own `Sequence` (`video-track.tsx`), it resolved one node and
// called it ONCE with `(from, to, progress)` where `from`/`to` were
// already-instantiated subtrees the node's `.composite` component rendered.
// That whole assembly — the boundary Sequence, `rebased()`, `BOUNDARY_TAIL`
// — is deleted from `video-track.tsx` in the same commit, and `TransitionNode`
// no longer HAS a `.composite` arm to drive (`lib/theming/transitions.ts`).
//
// `git grep -n AtCutTransition` before this task found exactly one real call
// site: `video-track.tsx`'s own composite-boundary loop, now gone. Every
// other hit was a doc comment or a unit test exercising the component in
// isolation (migrated or deleted in this task — see task-5-report.md). Once
// `TransitionNode.plan` stopped being optional, `typeof node.plan ===
// 'function'` inside this component was true for EVERY node it could ever
// be handed, which made it warn-and-hard-cut unconditionally — a component
// with zero production callers that could only ever produce one outcome is
// not a capability worth keeping alive, it is exactly the "shipped vacuous"
// failure mode this phase's own laws warn against. `presentationFor`'s
// still-live two-input warning (above) now names only `buildVideoNodes` as
// the render path, not this deleted alternative.
