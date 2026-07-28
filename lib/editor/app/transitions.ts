/**
 * The editor's view of the transition vocabulary. Pure helpers — no React, no
 * DOM.
 *
 * This file used to hand-maintain its own copy of the catalog (kinds, labels,
 * sub-options, defaults), with a header explaining that it deliberately did NOT
 * import the zod schema. That independence is what let the two drift: the
 * editor's list ran a whole phase ahead of `TransitionSchema`, and the schema
 * grew fields the picker never offered. The catalog now lives in ONE place —
 * `lib/reel-config-base/transition-schema.ts`, the way `lib/theming/placement.ts`
 * owns PLACEMENTS — and everything below is a re-export or a derivation of it.
 *
 * What remains genuinely editor-only lives here: the named duration presets and
 * their frames↔seconds arithmetic, which are UI affordances with no meaning to
 * the schema or the renderer.
 */
import {
  TRANSITION_CATALOG,
  type Transition,
} from '@video-toolkit/lib/reel-config-base/transition-schema';

export {
  kindNeedsFrames,
  subOptionsFor,
  defaultTransition,
  // `SubOption`/`SubOptionChoice` are now deprecated aliases of the ONE shared
  // descriptor (Phase 4 Task 1.1). Kept exported so existing importers resolve;
  // new code should say `ParamField` / `ParamChoice`.
  type SubOption,
  type SubOptionChoice,
  type Transition,
  type TransitionKind,
  type DraftTransition,
} from '@video-toolkit/lib/reel-config-base/transition-schema';

/** Every transition kind with a human-readable label, in catalog order. */
export const TRANSITION_KINDS: ReadonlyArray<{ kind: string; label: string }> = TRANSITION_CATALOG;

/** Named duration presets offered by the UI, in frames @ 30fps. */
export const DURATION_PRESETS: Array<{ key: 'short' | 'medium' | 'long'; label: string; frames: number }> = [
  { key: 'short', label: 'Short', frames: 8 },
  { key: 'medium', label: 'Medium', frames: 15 },
  { key: 'long', label: 'Long', frames: 30 },
];

/** Converts a frame count to seconds at the given frame rate. */
export function framesToSeconds(frames: number, fps: number): number {
  return frames / fps;
}

/**
 * Resolves which named preset (if any) a frame count matches. Matching is
 * EXACT — a value like 12 sits between "short" (8) and "medium" (15) but
 * isn't either of them, so it reports `null` ("custom") rather than snapping
 * to the nearest preset and silently mislabeling a custom value.
 */
export function presetForFrames(frames: number): 'short' | 'medium' | 'long' | null {
  const match = DURATION_PRESETS.find((p) => p.frames === frames);
  return match ? match.key : null;
}
