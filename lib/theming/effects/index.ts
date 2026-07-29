// lib/theming/effects — the EFFECT extension axis.
//
// An effect is a WRAPPER: it receives the media node and returns a decorated
// node. That is the shape every brand effect surveyed already has — a vintage
// filter+overlay stack and a gradient-masked blend layer both wrap.
//
// Resolution is the ONE rule from ../registry.ts: a brand registration wins,
// the core generic (primitives.tsx) sits beneath it, and a type neither has is
// SILENTLY SKIPPED — never thrown. That last part is deliberate and pinned by
// test: a brand's `extractEffects` ignores unrecognised effect types today, so
// a config with a typo'd effect must keep rendering rather than fail the render.
import type React from 'react';
import { createElement } from 'react';
import { resolveRegistered, registrationConfig, type Registration, type Registry } from '../registry';
import type { BrandTheme } from '../types';
import type { Effect, VideoItem } from '../../reel-config-base/layered-schema';
import { isNodeEnabled } from '../../reel-config-base/node-enabled';
import {
  GrainEffect,
  ScanlinesEffect,
  VignetteEffect,
  GradeEffect,
  TransformEffect,
} from './primitives';
import { isReservedEffectType } from './style-effect';

export interface EffectRenderProps {
  /** The effect entry off the item's `effects[]`, minus nothing — `type` included. */
  effect: Effect;
  /** This entry's position in the item's `effects[]`. The registry supports the
   *  SAME type appearing more than once, so anything a renderer makes unique
   *  per-effect (an SVG filter id, say) must key on item id AND this. */
  index: number;
  /** The item the effect is attached to (for startMs-derived beat phase etc.). */
  item: VideoItem;
  /** Extra frames borrowed at each edge for cross-item transitions. */
  handles: { inHalf: number; outHalf: number };
  /** Opaque brand config off the registration for this effect type. */
  config?: unknown;
  /** The MEDIA-scope wrapper's own reason to exist (Phase 4 Task 3.3): the
   *  CSS style `SegmentMedia` (or a brand's own hand-rolled media element via
   *  `useMediaEffects`) computed for its media element — crop + style-effects
   *  (ken-burns) + grade, already merged. Present ONLY for a `scope: 'media'`
   *  effect, applied from inside the media element's own position; a
   *  `scope: 'clip'` effect (the default, applied by `applyEffects` around the
   *  whole item renderer's output) has no single media style to hand over and
   *  leaves this `undefined`. This is what lets a media-scope wrapper build a
   *  SECOND media element carrying the exact same crop/grade/ken-burns
   *  treatment as the first (PP's `blend`) without recomputing that transform
   *  itself and drifting from it the moment either input changes. This is the
   *  SAME object reference the media element itself renders with (not a
   *  clone) — spread it (`{ ...mediaStyle, … }`) onto a second element as the
   *  sample above does; mutating it in place would mutate the first
   *  element's own style too. */
  mediaStyle?: React.CSSProperties;
  children: React.ReactNode;
}

export type EffectRenderer = React.FC<EffectRenderProps>;

/** One effect type's registration. `scope` (Phase 4 Task 3.3) is the ONE
 *  axis-specific field: 'clip' (default, unset) applies the effect the way
 *  every effect has always applied — `applyEffects` wraps the WHOLE item
 *  renderer's output, from outside it. 'media' routes the SAME renderer shape
 *  (still `EffectRenderer`: children in, node out) to wrap the media element
 *  itself instead, delivered via `MediaEffectsContext` (./media-effects-context.tsx)
 *  rather than through `applyEffects` — see that module for why a context and
 *  not a new prop. Nothing about the wrapper CONTRACT changes between the two
 *  scopes; only WHERE core calls it and what `mediaStyle` carries. */
export interface EffectRegistration extends Registration<EffectRenderProps> {
  scope?: 'clip' | 'media';
}

/** One resolved media-scope effect entry, ready for `SegmentMedia` (or
 *  `useMediaEffects`) to apply around its own media element with its OWN
 *  `item`/`handles` and computed style — see `collectMediaEffects`. */
export interface MediaEffectEntry {
  effect: Effect;
  index: number;
  Renderer: EffectRenderer;
  config?: unknown;
}

/** Effect types that are RESERVED: applied elsewhere in the pipeline, so
 *  applyEffects must never wrap them however they are registered.
 *
 *  `ken-burns` is a STYLE effect, not a wrapper: it composes into the media
 *  element's own transform/objectPosition/transformOrigin alongside the crop,
 *  inside SegmentMedia (see ./ken-burns.ts and ./style-effect.ts). If
 *  applyEffects ALSO wrapped it, every ken-burns item would get the movement
 *  twice.
 *
 *  `grade` joined it at Phase 4 Task 3.4, for the same reason: `item.grade`
 *  merges into the media element's own `filter` inside SegmentMedia (via
 *  `applyStyleEffects`'s synthetic entry, ./style-effect.ts), and an authored
 *  `type: 'grade'` effect now resolves through that SAME renderer. Before
 *  this task `grade` was a WRAPPER generic here (`primitives.tsx`'s
 *  `GradeEffect`, a separate mechanism — an enclosing div with its own
 *  filter) that a hand-edited item carrying both `item.grade` and a
 *  `type:'grade'` effect would silently double up against. `GradeEffect`
 *  and `gradeFromEffect` are still exported below for their own direct-render
 *  tests, but no config resolves them through `applyEffects`/
 *  `collectMediaEffects` any more — verified by
 *  effects-registry.test.tsx's "has NO core wrapper generic for grade" case.
 *
 *  Phase 4 Task 3.2: this used to be a hand-maintained `Set` here. It is now
 *  DERIVED — `isReservedEffectType(theme, type)` (./style-effect.ts) is `true`
 *  exactly when `type` resolves on the STYLE axis for this theme (core's own
 *  `ken-burns`, or a brand's own style-effect registration for any type name
 *  it chooses). Core not registering a `ken-burns` generic on the WRAPPER axis
 *  was never sufficient on its own — the registry is open-keyed, so a brand
 *  writing `effects: { 'ken-burns': { renderer: X } }` would otherwise resolve
 *  and double-apply — and a hand-maintained list is a second source of truth
 *  that can drift from the style registrations it is supposed to describe.
 *  Deriving it means `applyEffects` and `editorMetaFromTheme` read the SAME
 *  registrations and cannot disagree.
 *
 *  Since Phase 3 Task 7, and still true: a brand registration for a reserved
 *  type is inert at RENDER time, so `editorMetaFromTheme` consults the same
 *  derivation to keep it inert at EDIT time too, rather than offering params
 *  that would never be applied. */
export { isReservedEffectType } from './style-effect';

/** Core generic effect renderers, keyed by effect type. `ken-burns` and
 *  `grade` (Task 3.4) are both absent by the rule above — see
 *  `isReservedEffectType`. */
const CORE_EFFECT_RENDERERS: Record<string, EffectRenderer> = {
  grain: GrainEffect,
  scanlines: ScanlinesEffect,
  vignette: VignetteEffect,
  transform: TransformEffect,
};

/** The registered-or-generic switch for one effect type. Undefined when
 *  neither the brand nor core can draw it — the caller SKIPS, never throws. */
export function resolveEffectRenderer(theme: BrandTheme, type: string): EffectRenderer | undefined {
  return resolveRegistered(theme.effects, type, CORE_EFFECT_RENDERERS);
}

/** The brand config registered for an effect type (undefined when none). */
export function effectConfig(theme: BrandTheme, type: string): unknown {
  return registrationConfig(theme.effects, type);
}

/** The declared `scope` for one effect type's registration (Phase 4 Task 3.3).
 *  Absent registration, or a registration with no `scope`, is 'clip' — the
 *  pre-3.3 behaviour for EVERY existing effect and registration, brand or
 *  core: nothing moves unless a registration opts in. */
export function effectScope(theme: BrandTheme, type: string): 'clip' | 'media' {
  return theme.effects?.[type]?.scope ?? 'clip';
}

/** Applies every effect on an item, in array order, innermost-first: the first
 *  entry ends up closest to the media, the last outermost.
 *
 *  Returns `media` REFERENTIALLY UNCHANGED when the item has no effects, or
 *  when none of them resolve — no wrapper is allocated, so an item without
 *  effects renders byte-identically to before this axis existed. */
export function applyEffects(
  theme: BrandTheme,
  item: VideoItem,
  handles: { inHalf: number; outHalf: number },
  media: React.ReactNode,
): React.ReactNode {
  const effects = item.effects;
  if (!effects?.length) return media;
  let node = media;
  for (const [index, effect] of effects.entries()) {
    // Reserved types are applied elsewhere in the pipeline. Skipped BEFORE
    // resolution, so a brand registration cannot re-open the double-apply.
    //
    // NOTE FOR `enabled`: this `continue` runs BEFORE the enable test below, so
    // a reserved type never reaches it. That is no longer a gap needing a
    // bespoke per-type probe, though: `applyStyleEffects` (./style-effect.ts)
    // — the thing that actually renders every reserved type — applies the
    // SAME generic `isNodeEnabled` test to every style-axis type uniformly,
    // so a second reserved type gets `enabled: false` support for free.
    if (isReservedEffectType(theme, effect.type)) continue;
    // MEDIA-scope types (Phase 4 Task 3.3) are applied elsewhere too — inside
    // SegmentMedia (or a brand's hand-rolled media element), via
    // MediaEffectsContext, not wrapped around the WHOLE item renderer here.
    // Skipped BEFORE resolution and BEFORE the enable test for the same
    // reason reserved types are: `collectMediaEffects` below applies its own
    // `isNodeEnabled` test at the point it actually renders.
    if (effectScope(theme, effect.type) === 'media') continue;
    // A DISABLED effect is skipped ENTIRELY — no wrapper is allocated, so the
    // node is referentially what it would be if the entry were deleted, while
    // the entry's authored params stay in the config for the toggle back. Also
    // skipped BEFORE resolution, so it costs nothing beyond the test. Absent
    // means enabled (see `isNodeEnabled`), so no baked literal changes.
    if (!isNodeEnabled(effect)) continue;
    const Renderer = resolveEffectRenderer(theme, effect.type);
    if (!Renderer) continue;
    // `children` goes in the props bag, not as the third argument: the third
    // argument is typed as ReactNode[] and does not satisfy the required
    // `children` on EffectRenderProps.
    node = createElement(Renderer, {
      effect,
      index,
      item,
      handles,
      config: effectConfig(theme, effect.type),
      children: node,
    });
  }
  return node;
}

/** Resolves every `scope: 'media'` effect on an item into a ready-to-apply
 *  `MediaEffectEntry` list, for `renderVideoItemNode` to hand to
 *  `MediaEffectsContext` — see ./media-effects-context.tsx for the delivery
 *  mechanism and why it is a context rather than a prop.
 *
 *  Mirrors `applyEffects`'s own filter, minus the wrap: reserved (style-axis)
 *  types are skipped, non-'media'-scope types are skipped (they go through
 *  `applyEffects` instead), a disabled entry is skipped entirely (dropped, not
 *  delivered as an inert entry — same "no wrapper for a disabled node" rule as
 *  the wrapper axis), and a type with no resolvable renderer is skipped
 *  (silently — the same "SKIP, never throw" rule every axis follows).
 *
 *  Returns `[]` for an item with no effects, or none of them media-scoped —
 *  the empty array `MediaEffectsContext`'s own default already is, so a
 *  `renderVideoItemNode` caller providing `[]` here is indistinguishable from
 *  one providing nothing at all. */
export function collectMediaEffects(theme: BrandTheme, item: VideoItem): MediaEffectEntry[] {
  const effects = item.effects;
  if (!effects?.length) return [];
  const entries: MediaEffectEntry[] = [];
  for (const [index, effect] of effects.entries()) {
    if (isReservedEffectType(theme, effect.type)) continue;
    if (effectScope(theme, effect.type) !== 'media') continue;
    if (!isNodeEnabled(effect)) continue;
    const Renderer = resolveEffectRenderer(theme, effect.type);
    if (!Renderer) continue;
    entries.push({ effect, index, Renderer, config: effectConfig(theme, effect.type) });
  }
  return entries;
}

export { kenBurnsStyle, findKenBurns, type KenBurnsEffect } from './ken-burns';
export {
  GrainEffect,
  ScanlinesEffect,
  VignetteEffect,
  GradeEffect,
  TransformEffect,
  grainLayerStyle,
  grainTurbulenceAttrs,
  scanlinesLayerStyle,
  vignetteLayerStyle,
  gradeFromEffect,
  transformString,
  transformLayerStyle,
} from './primitives';
export {
  resolveStyleEffectRenderer,
  styleEffectConfig,
  composeMediaStyle,
  applyStyleEffects,
  CORE_STYLE_EFFECT_TYPES,
  type MediaStyleFragment,
  type StyleEffectRenderProps,
  type StyleEffectRenderer,
  type StyleEffectRegistry,
  type StyleEffectRegistration,
} from './style-effect';
