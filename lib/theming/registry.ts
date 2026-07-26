// lib/theming/registry.ts — the ONE resolution rule every extension axis uses.
// Brand registration wins; the core generic sits beneath it. A registration
// with no `renderer` contributes routing/config/params only and does NOT mask
// the generic — that is what lets a brand re-route a kind core can still draw.
import type React from 'react';

/** One editable field a registration declares, so a brand kind is editable
 *  without any core UI knowing the kind.
 *
 *  THE one definition — `lib/editor/app/editor-meta.ts` re-exports this rather
 *  than restating it (Phase 3 Task 7 collapsed the temporary duplicate). It
 *  lives HERE and not in the editor because lib/theming must not import from
 *  lib/editor: theming is consumed by lib/render and by every brand's render
 *  program, the editor by neither. Do NOT "fix" the direction by importing the
 *  editor from here.
 *
 *  `options` present → a dropdown over exactly those values; else `type` if
 *  declared; else the field is typed by the value currently held.
 *
 *  Declare `type` for any field whose value the item may not carry yet: with
 *  neither `options` nor `type`, an absent key has no value to be typed from,
 *  so it falls back to a text input and would write a STRING into what the
 *  renderer expects to be a number (e.g. `logoDelaySec: "0.5"`). The opaque bag
 *  is `z.record(z.unknown())`, so nothing rejects it — the config just goes
 *  type-dirty until a reload re-types the field from its (now string) value. */
export interface ParamField {
  prop: string;
  label?: string;
  options?: readonly string[];
  type?: 'number' | 'string' | 'boolean';
}

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
