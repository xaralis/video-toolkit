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

/** Default `[]` means "no media-scope effects" for ANY consumer that renders
 *  outside a Provider — including every existing SegmentMedia test and the
 *  Task 3.1 merge baseline, which construct `<SegmentMedia>` directly. That is
 *  what keeps this addition parity-preserving: `useMediaEffects()` returns an
 *  empty array there, `SegmentMedia` allocates no wrapper, and the baseline
 *  stays green and unmodified. */
export const MediaEffectsContext = createContext<readonly MediaEffectEntry[]>([]);

/** Resets media-effect delivery to empty for a subtree. Mounted by
 *  `GenericMultiClip` around its synthetic per-pane `SegmentMedia` calls: a
 *  multi-clip's OWN item may carry a media-scope effect (delivered to
 *  `GenericMultiClip` itself via the context `renderVideoItemNode` set up one
 *  level up), but a pane's sub-item is NOT the parent — inheriting the
 *  parent's media effects would apply them once per pane, on top of media the
 *  parent-level effect was never asked to treat, which is not "apply it to
 *  the media element" but "apply it to every media element", a different and
 *  unrequested thing. Resetting to `[]` here is what keeps a multi-clip pane
 *  identical to before this axis existed. */
export const MediaEffectsBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <MediaEffectsContext.Provider value={[]}>{children}</MediaEffectsContext.Provider>
);

/** For a brand that hand-rolls its own media element instead of using
 *  `SegmentMedia` — reads the SAME context `SegmentMedia` reads, so a brand
 *  renderer can apply its item's media-scope effects around whatever element
 *  it builds itself, using the exact style it computed for that element as
 *  each effect's `mediaStyle` (see `EffectRenderProps.mediaStyle`). */
export function useMediaEffects(): readonly MediaEffectEntry[] {
  return useContext(MediaEffectsContext);
}
