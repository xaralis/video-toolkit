// lib/theming/effects/media-effects-context.tsx — the MEDIA-scope delivery
// mechanism (Phase 4 Task 3.3).
//
// `scope: 'media'` (see ./index.ts's `effectScope`/`collectMediaEffects`) picks
// an effect OUT of the ordinary wrapper axis (applyEffects, which wraps the
// whole video renderer's output, from OUTSIDE the renderer) and routes it to
// wrap the media element itself, from INSIDE `SegmentMedia` — a component core
// owns but which sits inside a brand's own footage-segment renderer. Neither
// brand repo forwards extra props to `SegmentMedia` today (verified by grep
// against both — see the task report), so a new PROP here would be dropped on
// day one, exactly like `anchoredOverlays`'s write-only bug. Context sidesteps
// that: core supplies the value at `renderVideoItemNode` (above the renderer,
// so a brand's existing JSX tree carries it for free) and reads it back inside
// `SegmentMedia` (or a brand's own hand-rolled media element, via
// `useMediaEffects`) with no prop for anyone to forget.
import React, { createContext, useContext } from 'react';
import type { MediaEffectEntry } from './index';
import type { VideoItem } from '../../reel-config-base/layered-schema';

/** Default `[]` means "no media-scope effects" for ANY consumer that renders
 *  outside a Provider — including every existing SegmentMedia test and the
 *  Task 3.1 merge baseline, which construct `<SegmentMedia>` directly. That is
 *  what keeps this addition parity-preserving: `useMediaEffects()` returns an
 *  empty array there, `SegmentMedia` allocates no wrapper, and the baseline
 *  stays green and unmodified. */
export const MediaEffectsContext = createContext<readonly MediaEffectEntry[]>([]);

/** Phase 4 Task 6.3, warning 7 — a side channel PARALLEL to
 *  `MediaEffectsContext`, carrying nothing but a "something read this" ping.
 *  `renderVideoItemNode` provides one bound to the CURRENT video item;
 *  `useMediaEffects()` pings it on every call. `LayeredReelComposition` uses
 *  that ping (checked by a later sibling in the SAME render pass — see
 *  `ConsumptionAudit` in ./lib/render/layered-composition.tsx) to tell "a
 *  media-scope effect was delivered AND something called useMediaEffects()"
 *  from "delivered, and nothing in this item's renderer ever reads it" — the
 *  write-only-prop failure Task 3.3's context sidesteps for a PROP, returning
 *  here for a renderer that never calls the hook at all. Default `undefined`
 *  (a no-op ping) so every pre-6.3 call site — including every existing
 *  `useMediaEffects()` test that renders outside a Provider — is unaffected. */
const MediaEffectsConsumptionContext = createContext<(() => void) | undefined>(undefined);
export { MediaEffectsConsumptionContext };

/** Resets media-effect delivery to empty for a subtree. Mounted by
 *  `GenericMultiClip` around its synthetic per-pane `SegmentMedia` calls: a
 *  multi-clip's OWN item may carry a media-scope effect (delivered to
 *  `GenericMultiClip` itself via the context `renderVideoItemNode` set up one
 *  level up), but a pane's sub-item is NOT the parent — inheriting the
 *  parent's media effects would apply them once per pane, on top of media the
 *  parent-level effect was never asked to treat, which is not "apply it to
 *  the media element" but "apply it to every media element", a different and
 *  unrequested thing. Resetting to `[]` here is what keeps a multi-clip pane
 *  identical to before this axis existed.
 *
 *  ALSO resets the consumption ping (Task 6.3) to `undefined` — a pane's OWN
 *  `SegmentMedia` calls `useMediaEffects()` unconditionally, and without this
 *  second reset that call would ping the OUTER multi-clip item's tracker even
 *  though the pane received `[]`, an empty delivery it did nothing with —
 *  which would make the multi-clip item's own (unrelated, unconsumed) media
 *  effect look consumed by accident. */
export const MediaEffectsBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <MediaEffectsContext.Provider value={[]}>
    <MediaEffectsConsumptionContext.Provider value={undefined}>{children}</MediaEffectsConsumptionContext.Provider>
  </MediaEffectsContext.Provider>
);

/** For a brand that hand-rolls its own media element instead of using
 *  `SegmentMedia` — reads the SAME context `SegmentMedia` reads, so a brand
 *  renderer can apply its item's media-scope effects around whatever element
 *  it builds itself, using the exact style it computed for that element as
 *  each effect's `mediaStyle` (see `EffectRenderProps.mediaStyle`). */
export function useMediaEffects(): readonly MediaEffectEntry[] {
  const entries = useContext(MediaEffectsContext);
  // Task 6.3, warning 7 — pings the consumption tracker unconditionally (not
  // only when `entries.length > 0`): "consumed" means "something called this
  // hook for this item", which is the fact the audit needs regardless of
  // whether this particular delivery happened to be empty.
  useContext(MediaEffectsConsumptionContext)?.();
  return entries;
}

/** Applies a list of resolved media-scope entries around `node`,
 *  innermost-first — the first entry ends up closest to the media, the last
 *  outermost, mirroring `applyEffects`'s own order on the wrapper axis.
 *
 *  Exported alongside `useMediaEffects` (review round 1, MINOR 5) so a brand
 *  that hand-rolls its own media element does not have to re-derive this
 *  ordering, or remember to pass `mediaStyle` — the SAME `mediaStyle` fidelity
 *  Task 3.3's mutation 3 pins for `SegmentMedia`'s own (now equivalent) call.
 *  `SegmentMedia` itself calls this too, so there is exactly one
 *  implementation of "how a media-scope effect wraps a media element",
 *  not two that could drift. Returns `node` referentially unchanged when
 *  `entries` is empty — the same "no wrapper for nothing to apply" rule
 *  every axis in this codebase follows. */
export function applyMediaEffects(
  entries: readonly MediaEffectEntry[],
  props: { item: VideoItem; handles: { inHalf: number; outHalf: number }; mediaStyle: React.CSSProperties },
  node: React.ReactNode,
): React.ReactNode {
  let out = node;
  for (const { effect, index, Renderer, config } of entries) {
    out = React.createElement(Renderer, {
      effect,
      index,
      item: props.item,
      handles: props.handles,
      config,
      mediaStyle: props.mediaStyle,
      children: out,
    });
  }
  return out;
}
