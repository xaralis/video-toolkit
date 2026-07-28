// lib/reel-config-base/param-field.ts — THE parameter descriptor, for BOTH
// extension axes.
//
// Before Phase 4 there were two, and neither was a superset:
//
//   • `ParamField` (lib/theming/registry.ts) — `number | string | boolean` plus
//     a `readonly string[]` options list. Used by the EFFECT axis.
//   • `SubOption`  (lib/reel-config-base/transition-schema.ts) — `enum | number
//     | boolean | accent` plus a `{value,label}[]` options list. Used by the
//     TRANSITION axis.
//
// The gap was not academic: because the effect vocabulary had no `accent`, and
// the transition vocabulary had no `string`, burn's `mask` and `glowColor` —
// real, authored-in-config properties — had no editor control at all, on either
// path. One descriptor closes that, and it is what lets the inspector render
// controls for a kind core has never heard of.
//
// WHY IT LIVES HERE and not in `lib/theming/registry.ts` (where the effect-axis
// half used to live): `lib/theming` imports `lib/reel-config-base`
// (`theming/types.ts`, `theming/effects/index.ts`), never the reverse, and
// `lib/reel-config-base` imports nothing outside itself but zod. A descriptor
// shared by both axes has to sit BENEATH both of them or one axis ends up
// importing the other. This module therefore has ZERO imports — keep it that
// way. `lib/theming/registry.ts` re-exports it and remains the axis-facing
// surface; `lib/editor/app/editor-meta.ts` re-exports it from there in turn.

/** What control a parameter gets.
 *
 *  `percent` and `angle` are not pedantry: they are the two units this codebase
 *  keeps storing as bare numbers (opacity, softness, pattern angles), and they
 *  let the editor offer a 0–100 field or a degree dial instead of a raw float.
 *  Neither performs any conversion — the stored value IS the percent or the
 *  degree count. They change the CONTROL, never the data.
 *
 *  `accent` carries no `options`: core does not know a brand's palette, so the
 *  editor fills the choices from the accent slots it was handed.
 *
 *  `color` is a colour literal (a hex string), distinct from `string` so the
 *  editor can offer a swatch. A field is `color` because something DECLARES it
 *  so — a registration's own `type`, or, for a core catalog field, the
 *  `COLOR_FIELDS` list in `transition-schema.ts`. Never because zod says
 *  `z.string()`: an accent key, a hex and a file path are the same shape. */
export type ParamType =
  | 'number'
  | 'string'
  | 'boolean'
  | 'enum'
  | 'color'
  | 'accent'
  | 'percent'
  | 'angle';

/** One enum choice: the value written to the config, and what a human reads. */
export interface ParamChoice {
  value: string;
  label: string;
}

/** An enum choice, either as a bare value (label = the value) or spelled out.
 *
 *  The bare-string form is the effect axis' historical shape and stays valid —
 *  every declaration of the form `options: ['organic', 'fade']` keeps working
 *  unchanged. `paramChoices` normalises both to `ParamChoice[]`. */
export type ParamOption = string | ParamChoice;

/** One editable parameter a registration (or a schema field) declares, so a
 *  brand kind is editable without any core UI knowing the kind.
 *
 *  How the editor picks a control, in order:
 *    1. `options` present → a dropdown over exactly those values;
 *    2. else `type` if declared;
 *    3. else the field is typed by the value it currently holds.
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
  type?: ParamType;
  options?: readonly ParamOption[];
  /** NLE parameter metadata — drives the control, not just the type. Absent
   *  means "the editor's default for this type"; present, these are handed
   *  straight to the numeric control. */
  min?: number;
  max?: number;
  step?: number;
  /** The value the schema falls back to when the field is absent. Informational
   *  — the editor shows it as a placeholder-grade hint, it does NOT write it. */
  default?: unknown;
  /** Reserved: this parameter may vary over the node's span. See
   *  `./animatable.ts`. Keyframe EDITING is out of scope for Phase 4 — the
   *  editor exposes constants only — but the flag is what a later phase reads
   *  to decide which parameters get a curve. */
  animatable?: boolean;
}

/** Normalises a mixed `options` list to `{value,label}` choices, so ONE control
 *  serves both declaration styles. Returns `undefined` for an absent list (the
 *  "not an enum" signal), and preserves order.
 *
 *  A bare string's label is the string itself — deliberately NOT humanized. The
 *  effect axis has always rendered these raw, and humanizing here would silently
 *  relabel every existing brand dropdown. Labels come from the declaration. */
export function paramChoices(options?: readonly ParamOption[]): ParamChoice[] | undefined {
  if (!options) return undefined;
  return options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
}
