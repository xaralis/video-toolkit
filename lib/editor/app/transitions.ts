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
  subOptionsFor,
  type Transition,
} from '@video-toolkit/lib/reel-config-base/transition-schema';
import type { ParamField } from '@video-toolkit/lib/reel-config-base/param-field';
import { humanizeKey } from './editor-meta';

export {
  CUT_KIND,
  isCut,
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

// ---- The brand's own kinds, in the picker ----------------------------------
// Task 1.2 gave the transition axis a registry, so a kind a brand registers
// RENDERS. The editor was still catalog-only: the brand's kind was not offered,
// and (worse — see LayeredInspector) an authored one was coerced to `cut`. The
// two deciders below are the whole of the editor's answer to "which kinds
// exist" and "what does this kind let me edit", so no call site asks either
// question a second way.
//
// Both take the DECLARED params keyed by kind — `EditorMeta.transitionProps`,
// which `editorMetaFromTheme` derives from `theme.transitions`. Passing the
// record rather than the theme keeps this module free of both React and the
// theme types, as it has always been.

/** Every kind the picker offers: core's catalog first, in catalog order, then
 *  whatever kinds the brand declared that core has never heard of. A brand
 *  registration for a kind core ALSO has is an override, not a new entry, so it
 *  keeps the catalog's position and label. */
export function transitionKindChoices(
  declared?: Record<string, readonly ParamField[]>,
): Array<{ kind: string; label: string }> {
  const out: Array<{ kind: string; label: string }> = TRANSITION_CATALOG.map((k) => ({ kind: k.kind, label: k.label }));
  for (const kind of Object.keys(declared ?? {})) {
    if (!out.some((k) => k.kind === kind)) out.push({ kind, label: humanizeKey(kind) });
  }
  return out;
}

/** The contextual controls one kind gets, from BOTH sources at once:
 *
 *  - core's, read structurally off the catalog entry's zod shape
 *    (`subOptionsFor`) — which returns `[]` for a kind core does not have, so a
 *    brand kind simply contributes nothing here;
 *  - the kind's registration `params`, which is the only description that
 *    exists for a brand kind.
 *
 *  They ADD UP, with a declared field winning by `prop` IN PLACE — the same
 *  rule the overlay bag editor applies. A brand that overrides a core kind may
 *  therefore relabel or re-type one of its fields without losing the rest, and
 *  a core kind with nothing declared gets exactly the controls it always had. */
export function transitionParamsFor(
  kind: string,
  declared?: Record<string, readonly ParamField[]>,
): ParamField[] {
  const out: ParamField[] = subOptionsFor(kind);
  for (const f of declared?.[kind] ?? []) {
    const i = out.findIndex((c) => c.prop === f.prop);
    if (i >= 0) out[i] = f;
    else out.push(f);
  }
  return out;
}

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
