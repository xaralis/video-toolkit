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
import { resolveRegistered, registrationConfig, type Registry } from '../registry';
import type { BrandTheme } from '../types';
import type { Effect, VideoItem } from '../../reel-config-base/layered-schema';
import {
  GrainEffect,
  ScanlinesEffect,
  VignetteEffect,
  GradeEffect,
  TransformEffect,
} from './primitives';

export interface EffectRenderProps {
  /** The effect entry off the item's `effects[]`, minus nothing — `type` included. */
  effect: Effect;
  /** The item the effect is attached to (for startMs-derived beat phase etc.). */
  item: VideoItem;
  /** Extra frames borrowed at each edge for cross-item transitions. */
  handles: { inHalf: number; outHalf: number };
  /** Opaque brand config off the registration for this effect type. */
  config?: unknown;
  children: React.ReactNode;
}

export type EffectRenderer = React.FC<EffectRenderProps>;

/** One effect type's registration. No axis-specific fields yet — the shared
 *  Registration primitive is the whole contract. */
export type EffectRegistration = Registry<EffectRenderProps>[string];

/** Core generic effect renderers, keyed by effect type.
 *
 *  `ken-burns` is deliberately ABSENT. It is a STYLE effect, not a wrapper: it
 *  composes into the media element's own transform/objectPosition/transformOrigin
 *  alongside the crop (see SegmentMedia). Re-expressing it as a wrapper div
 *  would move pixels in both brands, which the still-render parity gate forbids.
 *  It lives in ./ken-burns.ts and is applied by SegmentMedia directly; because
 *  it resolves to no wrapper here, applyEffects skips it and it is never
 *  double-applied. */
const CORE_EFFECT_RENDERERS: Record<string, EffectRenderer> = {
  grain: GrainEffect,
  scanlines: ScanlinesEffect,
  vignette: VignetteEffect,
  grade: GradeEffect,
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
  for (const effect of effects) {
    const Renderer = resolveEffectRenderer(theme, effect.type);
    if (!Renderer) continue;
    // `children` goes in the props bag, not as the third argument: the third
    // argument is typed as ReactNode[] and does not satisfy the required
    // `children` on EffectRenderProps.
    node = createElement(Renderer, { effect, item, handles, config: effectConfig(theme, effect.type), children: node });
  }
  return node;
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
