// lib/theming/effects/style-effect.ts — the STYLE axis (Phase 4 Task 3.2).
//
// An effect on the WRAPPER axis (./index.ts, `applyEffects`) receives the
// media node and returns a decorated node. A STYLE effect is different: it
// never sees the media node at all. It contributes a `MediaStyleFragment`
// that gets MERGED into the media element's own `style` — the same element
// SegmentMedia's crop and grade already write onto. `ken-burns` is the one
// type today (see `kenBurnsStyleEffect` below), because the movement has to
// compose with the crop's transform/objectPosition, not sit on top of it.
//
// WHY A SECOND AXIS RATHER THAN A FLAG ON THE EXISTING ONE: a wrapper effect's
// renderer signature is `(props with `children`) => ReactNode` — there is no
// media element for it to reach into, by design (see EffectRenderProps in
// ./index.ts). A style effect's renderer is a pure function of the item/frame
// to a style fragment; it never receives `children` because it has nothing to
// wrap. Two different shapes need two registries, not one flag on one shape.
// Value import (not type-only): `combineDefs` below needs `createElement` at
// runtime to join two `defs` fragments without an unkeyed array — see there.
import React from 'react';
import { resolveRegistered, registrationConfig, type Registry } from '../registry';
import type { BrandTheme } from '../types';
import type { Effect, VideoItem } from '../../reel-config-base/layered-schema';
import { isNodeEnabled } from '../../reel-config-base/node-enabled';
import { kenBurnsStyle, type KenBurnsEffect } from './ken-burns';

/** A CLOSED bag, deliberately — NOT `CSSProperties`. An open bag would let two
 *  effects fight over `inset`/`position` with no rule to settle it; a
 *  property absent from this table is simply not expressible on the style
 *  axis, and that is the design, not a gap. One composition rule per
 *  property (enforced by `composeMediaStyle` below):
 *
 *  | property                              | rule                                  |
 *  |----------------------------------------|----------------------------------------|
 *  | `transform`                             | concatenates AFTER the base's          |
 *  | `objectPosition` + `transformOrigin`    | move as a PAIR and OVERRIDE            |
 *  | `filter`                                 | concatenates                           |
 *  | `opacity`                                | multiplies                             |
 *  | `defs`                                   | mounts sibling SVG defs                |
 */
export interface MediaStyleFragment {
  transform?: string;
  objectPosition?: string;
  transformOrigin?: string;
  filter?: string;
  opacity?: number;
  defs?: React.ReactNode;
}

/** The prop bag a style-effect renderer receives. Deliberately NOT
 *  `EffectRenderProps`: there is no `children`/`handles` — a style effect
 *  never wraps anything — and it needs frame-derived values a wrapper effect
 *  reads via hooks instead, because a style renderer is a plain function, not
 *  a component (SegmentMedia calls it directly, outside JSX). */
export interface StyleEffectRenderProps {
  /** The effect entry off the item's `effects[]`, `type` included. */
  effect: Effect;
  /** This entry's position in the item's `effects[]` (see EffectRenderProps
   *  for why this matters — same reasoning, same field). */
  index: number;
  item: VideoItem;
  frame: number;
  durationInFrames: number;
  focalX?: number;
  focalY?: number;
}

/** A style-effect renderer is a pure function, not a component: it has no DOM
 *  of its own to mount, only a fragment to hand back for the CALLER
 *  (SegmentMedia) to merge onto the one media element. */
export type StyleEffectRenderer = (props: StyleEffectRenderProps) => MediaStyleFragment;

export type StyleEffectRegistry = Registry<StyleEffectRenderProps, StyleEffectRenderer>;
export type StyleEffectRegistration = StyleEffectRegistry[string];

/** Thin adapter over `kenBurnsStyle` (../effects/ken-burns.ts). That function
 *  stays BYTE-FOR-BYTE untouched — `ken-burns-parity.test.ts` pins it — so
 *  this only reshapes the call, it does not reimplement the math. */
const kenBurnsStyleEffect: StyleEffectRenderer = ({ effect, frame, durationInFrames, focalX, focalY }) =>
  kenBurnsStyle(effect as KenBurnsEffect, frame, durationInFrames, focalX, focalY);

/** Core's own style-effect renderers, keyed by type. `ken-burns` is the only
 *  member; adding a second core style effect is exactly what widens this
 *  table and, through it, `isReservedEffectType` below — with NO other file
 *  to update, which is the whole point of deriving rather than listing. */
const CORE_STYLE_EFFECT_RENDERERS: Record<string, StyleEffectRenderer> = {
  'ken-burns': kenBurnsStyleEffect,
};

/** The style types core itself renders, for introspection (tests, and any
 *  caller that needs "what does CORE reserve" specifically, as opposed to
 *  "what does THIS theme reserve" — see `isReservedEffectType`). */
export const CORE_STYLE_EFFECT_TYPES: readonly string[] = Object.keys(CORE_STYLE_EFFECT_RENDERERS);

/** The registered-or-generic switch for one style-effect type, resolved
 *  against a STYLE registry directly (not the whole theme) — this is what
 *  lets SegmentMedia resolve style effects from the one narrow field
 *  (`VideoRenderProps.styleEffects`) threaded down from `theme.styleEffects`,
 *  the same way `tokens`/`resolveMediaSource` are threaded, without
 *  SegmentMedia ever holding a `BrandTheme`. */
export function resolveStyleEffectRenderer(
  registry: StyleEffectRegistry | undefined,
  type: string,
): StyleEffectRenderer | undefined {
  return resolveRegistered(registry, type, CORE_STYLE_EFFECT_RENDERERS);
}

/** The brand config registered for a style-effect type (undefined when none). */
export function styleEffectConfig(registry: StyleEffectRegistry | undefined, type: string): unknown {
  return registrationConfig(registry, type);
}

/** THE derived reserved set, as a pure function of (theme, type) — replaces
 *  the old hand-maintained `RESERVED_EFFECT_TYPES` list. A type is reserved
 *  for the WRAPPER axis exactly when it resolves on the STYLE axis for this
 *  theme: core's own `ken-burns`, or a brand's own style-effect registration
 *  for any type name it chooses. Computed fresh, not listed, so `applyEffects`
 *  (../effects/index.ts) and the style path can never drift apart — there is
 *  nothing to keep in sync, because both read the SAME registrations. */
export function isReservedEffectType(theme: BrandTheme, type: string): boolean {
  return resolveStyleEffectRenderer(theme.styleEffects, type) !== undefined;
}

/** Merges one style fragment onto an accumulated one, per the table above.
 *  `next` is the LATER (outer) fragment — e.g. an effect composing onto the
 *  crop's own transform/objectPosition/transformOrigin. */
export function composeMediaStyle(base: MediaStyleFragment, next: MediaStyleFragment): MediaStyleFragment {
  const transform = [base.transform, next.transform].filter(Boolean).join(' ') || undefined;
  const filter = [base.filter, next.filter].filter(Boolean).join(' ') || undefined;
  const hasOpacity = base.opacity !== undefined || next.opacity !== undefined;
  const opacity = hasOpacity ? (base.opacity ?? 1) * (next.opacity ?? 1) : undefined;
  // `objectPosition` + `transformOrigin` move AS A PAIR and OVERRIDE: the
  // naive per-property merge (keep the base's transformOrigin, take the
  // next's objectPosition) is the exact regression this task exists to avoid
  // — see segment-media-merge-baseline.test.tsx's dedicated pairing test.
  const paired =
    next.objectPosition !== undefined
      ? { objectPosition: next.objectPosition, transformOrigin: next.transformOrigin }
      : { objectPosition: base.objectPosition, transformOrigin: base.transformOrigin };
  return { transform, filter, opacity, ...paired, defs: combineDefs(base.defs, next.defs) };
}

function combineDefs(a: React.ReactNode, b: React.ReactNode): React.ReactNode {
  if (a === undefined) return b;
  if (b === undefined) return a;
  // A bare array of ReactNodes would warn ("each child needs a unique key")
  // when this ever composes THREE or more defs; a Fragment needs no keys for
  // its own direct children regardless of count.
  return React.createElement(React.Fragment, null, a, b);
}

/** Applies every STYLE-axis effect on an item's `effects[]`, in array order,
 *  into ONE merged fragment via `composeMediaStyle`.
 *
 *  DUPLICATE entries of the SAME reserved type: the first ENABLED one wins; a
 *  later entry of the same type is ignored whether it is enabled or not. This
 *  is the pre-existing `findKenBurns` semantics (`Array.find` on
 *  `type === X && isNodeEnabled`), generalized to every style-axis type
 *  instead of hardcoded to one — so an item carrying two `ken-burns` entries
 *  renders EXACTLY as it did before this task. Silently applying every
 *  duplicate would double the movement; that is the wrong default and is not
 *  what this does.
 *
 *  Takes the REGISTRY, not the whole theme — see `resolveStyleEffectRenderer`
 *  for why. */
export function applyStyleEffects(
  registry: StyleEffectRegistry | undefined,
  item: VideoItem,
  frame: number,
  durationInFrames: number,
): MediaStyleFragment {
  const effects = item.effects;
  if (!effects?.length) return {};
  let frag: MediaStyleFragment = {};
  const applied = new Set<string>();
  for (const [index, effect] of effects.entries()) {
    if (applied.has(effect.type)) continue; // a later dup of an already-applied type is ignored
    const Renderer = resolveStyleEffectRenderer(registry, effect.type);
    if (!Renderer) continue; // not a style-axis type
    // The enable test is GENERIC here — every style-axis type gets it for
    // free, unlike the old per-reserved-type bespoke check `findKenBurns`
    // needed (see ../effects/index.ts's `RESERVED_EFFECT_TYPES` history). A
    // disabled entry does NOT get added to `applied`, so a later ENABLED
    // entry of the same type can still win — same as `Array.find` skipping
    // past a non-matching (here: disabled) element.
    if (!isNodeEnabled(effect)) continue;
    applied.add(effect.type);
    const next = Renderer({
      effect,
      index,
      item,
      frame,
      durationInFrames,
      focalX: item.focalX,
      focalY: item.focalY,
    });
    frag = composeMediaStyle(frag, next);
  }
  return frag;
}
