// lib/theming/registry.ts — the ONE resolution rule every extension axis uses.
// Brand registration wins; the core generic sits beneath it. A registration
// with no `renderer` contributes routing/config/params only and does NOT mask
// the generic — that is what lets a brand re-route a kind core can still draw.
import type React from 'react';

/** One editable field a registration declares, so a brand kind is editable
 *  without any core UI knowing the kind.
 *
 *  KNOWN TEMPORARY DUPLICATE of the `ParamField` in lib/editor/app/editor-meta.ts.
 *  lib/theming must not import from lib/editor (the dependency runs one way),
 *  so the shape is restated here; Phase 3 Task 7 collapses them by making
 *  editor-meta.ts re-export from this module. Do NOT "fix" this by adding the
 *  wrong-direction import. */
export interface ParamField {
  prop: string;
  label?: string;
  options?: readonly string[];
  type?: 'number' | 'string' | 'boolean';
}

/** One kind's registration on one extension axis. Per-axis interfaces extend
 *  this with their own fields (e.g. the overlay axis adds `routing`/`render`);
 *  the index signature is what lets the shared resolver below accept those
 *  supersets — including as fresh object literals — without knowing them. */
export interface Registration<P> {
  /** The renderer for this kind. Absent = routing-only (the owning body draws it). */
  renderer?: React.FC<P>;
  /** Opaque brand config, threaded to the renderer as `config`. */
  config?: unknown;
  /** Declared editable fields — what makes a brand kind editable without core UI. */
  params?: readonly ParamField[];
  [key: string]: unknown;
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
