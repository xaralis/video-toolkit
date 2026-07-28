// lib/theming/registry.ts — the ONE resolution rule every extension axis uses.
// Brand registration wins; the core generic sits beneath it. A registration
// with no `renderer` contributes routing/config/params only and does NOT mask
// the generic — that is what lets a brand re-route a kind core can still draw.
import type React from 'react';
import type { ParamField } from '../reel-config-base/param-field';

/** The parameter descriptor a registration declares, so a brand kind is
 *  editable without any core UI knowing the kind.
 *
 *  It used to be DEFINED here, with a `number | string | boolean` vocabulary,
 *  while the transition axis carried a second, incompatible one (`SubOption`:
 *  `enum | number | boolean | accent`). Phase 4 Task 1.1 merged them into ONE
 *  descriptor, which had to move one level DOWN to
 *  `lib/reel-config-base/param-field.ts` — `lib/theming` imports
 *  `lib/reel-config-base` and never the reverse, so a descriptor shared by both
 *  axes cannot live on either side of that edge. See that file for the full
 *  rule and for why it has zero imports.
 *
 *  This module stays the axis-facing surface: `lib/editor/app/editor-meta.ts`
 *  still re-exports from here, and lib/theming must not import from lib/editor
 *  (theming is consumed by lib/render and by every brand's render program, the
 *  editor by neither). Do NOT "fix" the direction by importing the editor. */
export type { ParamField, ParamType, ParamChoice, ParamOption } from '../reel-config-base/param-field';
export { paramChoices } from '../reel-config-base/param-field';

/** One kind's registration on one extension axis. Per-axis interfaces extend
 *  this with their own fields (e.g. the overlay axis adds `routing`/`render`),
 *  and a named superset is assignable to `Registration<P>` without a freshness
 *  check, so the shared resolver below accepts them as-is.
 *
 *  Deliberately NOT open with an index signature: an index signature would let
 *  a typo'd `renderer` compile clean, and a brand's renderer would then vanish
 *  from the render into the core generic with no signal — the exact silent
 *  brand regression Phase 3 exists to close. Fresh object literals that carry a
 *  per-axis field must be typed as that superset. */
export interface Registration<P> {
  /** The renderer for this kind. Absent = routing-only (the owning body draws it). */
  renderer?: React.FC<P>;
  /** Opaque brand config, threaded to the renderer as `config`. */
  config?: unknown;
  /** Declared editable fields — what makes a brand kind editable without core UI. */
  params?: readonly ParamField[];
}

export type Registry<P> = Record<string, Registration<P>>;

/** THE resolution order for every axis: brand registration wins, core generic
 *  beneath. Returns undefined only when neither has the kind. */
export function resolveRegistered<P>(
  registry: Registry<P> | undefined,
  kind: string,
  generics: Record<string, React.FC<P>>,
): React.FC<P> | undefined {
  return registry?.[kind]?.renderer ?? generics[kind];
}

/** The opaque brand config registered for a kind (undefined when none). */
export function registrationConfig<P>(registry: Registry<P> | undefined, kind: string): unknown {
  return registry?.[kind]?.config;
}

/** The editable fields declared for a kind (undefined when none). */
export function registrationParams<P>(
  registry: Registry<P> | undefined,
  kind: string,
): readonly ParamField[] | undefined {
  return registry?.[kind]?.params;
}
