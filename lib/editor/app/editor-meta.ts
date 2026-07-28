// Editor metadata — the brand-supplied vocabulary the inspector and timeline
// need but must not KNOW. Core owns the mechanisms (an effect catalog, a props
// editor, colour-coded lanes, lane labels); a brand owns the values that fill
// them (which effects exist, what an outro's `style` may be, what one of its
// own overlay kinds is called and coloured on the timeline).
//
// Everything here is optional and every consumer has a neutral core default, so
// a host that passes no `meta` still gets a working, brand-neutral editor: the
// core effect catalog, a generically-typed editor for any opaque `props`/effect
// params bag, humanized lane labels, and deterministic lane colours.

// The brand's accent palette is deliberately NOT here: `LayeredInspector` has a
// dedicated `accentSlots` prop and that stays the single source of truth — one
// carrier plus a precedence rule is one too many.

import type { CompositionTheme } from '../../theming/types';
import { overlayRegistry } from '../../theming/brand-theme';
import { RESERVED_EFFECT_TYPES } from '../../theming/effects';
import type { ParamField } from '../../theming/registry';

/** One declared, editable parameter inside an opaque bag (`props`, effect
 *  params) — and, since Phase 4 Task 1.1, the SAME descriptor the transition
 *  axis uses (`SubOption` is now a deprecated alias of it). Re-exported here
 *  because this module is the editor's public vocabulary surface; it is defined
 *  in `lib/reel-config-base/param-field.ts` and surfaced through
 *  `lib/theming/registry.ts` — see the note there for why it sits that low. */
export type { ParamField, ParamType, ParamChoice, ParamOption } from '../../theming/registry';
export { paramChoices } from '../../theming/registry';

/** One offerable clip effect. `defaults` (merged with `{ type }`) is what gets
 *  written onto the item when the effect is added; `params` declares its
 *  editable fields for the inspector. */
export interface EffectDefinition {
  type: string;
  label?: string;
  defaults?: Record<string, unknown>;
  params?: readonly ParamField[];
}

/** Brand-supplied editor vocabulary. All optional — see the module comment. */
export interface EditorMeta {
  /** Clip effects offerable in "+ Add effect", ON TOP of the core catalog.
   *  An entry whose `type` matches a core one replaces it. */
  effects?: readonly EffectDefinition[];
  /** Declared editable fields of a video item's `props` bag, per video kind
   *  (e.g. `{ outro: [{ prop: 'style', options: [...] }] }`). Undeclared props
   *  still render, typed by their current value. */
  videoProps?: Record<string, readonly ParamField[]>;
  /** Declared editable fields of an overlay item's `content` bag, per overlay
   *  `content.kind`. A kind with declared fields is edited through them; a kind
   *  with none keeps the value-presence editor core has always shown. */
  overlayProps?: Record<string, readonly ParamField[]>;
  /** Timeline block colour per timeline effectId (`overlay-<kind>`,
   *  `video-<kind>`, `audio`, `music`, `brand-<kind>`). Overrides the core
   *  defaults and the deterministic fallback. */
  laneColors?: Record<string, string>;
  /** Timeline block label per overlay `content.kind`. Default: humanized kind. */
  overlayLabels?: Record<string, string>;
}

/** Core's own effect catalog: ONLY what core itself renders. SegmentMedia (the
 *  generic footage renderer) implements Ken Burns; every other effect is a
 *  brand's and arrives via `EditorMeta.effects`. */
export const CORE_EFFECTS: readonly EffectDefinition[] = [
  {
    type: 'ken-burns',
    label: 'Ken Burns',
    defaults: { fromScale: 1, toScale: 1.08, fromX: 0.5, toX: 0.5 },
  },
];

/** Core catalog + the brand's, brand entries winning on a `type` collision and
 *  otherwise appended in declaration order. */
export function effectCatalog(meta?: EditorMeta): EffectDefinition[] {
  const out: EffectDefinition[] = [...CORE_EFFECTS];
  for (const e of meta?.effects ?? []) {
    const i = out.findIndex((c) => c.type === e.type);
    if (i >= 0) out[i] = e;
    else out.push(e);
  }
  return out;
}

/** The definition for an effect type, when the catalog declares one. */
export function effectDefinition(meta: EditorMeta | undefined, type: string): EffectDefinition | undefined {
  return effectCatalog(meta).find((e) => e.type === type);
}

// ---- Deriving the vocabulary from the theme --------------------------------
// Before this, a brand declared each kind TWICE: once as a theme registration
// (so it renders) and once in EditorMeta (so it is editable), with nothing
// keeping the two in sync — a brand that added a param to its registration and
// forgot the EditorMeta copy got a field that renders and cannot be edited.
// The registrations already carry `params`, so the editor vocabulary is
// DERIVED from them and the second declaration disappears.
//
// An explicit EditorMeta still wins, PER FIELD (per kind / per effect type):
// the host must be able to override anything the theme implies — relabel a
// field, offer a narrower option list in the editor than the renderer accepts,
// or declare something the theme has no place for at all (laneColors,
// overlayLabels, which have no theme source and simply pass through).

/** Every effect type the theme registers, as catalog entries — minus the
 *  RESERVED ones. A reserved type (`ken-burns`) is skipped by `applyEffects`
 *  BEFORE resolution, so a brand's effect-axis registration for it never draws;
 *  deriving an editor entry from it would advertise params that cannot take
 *  effect. Core's own `ken-burns` entry (rendered by SegmentMedia, edited by
 *  the inspector's bespoke editor) is unaffected and stays offerable — it is
 *  the effect-axis OVERRIDE that is inert, not the effect. */
function effectsFromTheme(theme: CompositionTheme): EffectDefinition[] {
  const out: EffectDefinition[] = [];
  for (const [type, reg] of Object.entries(theme.effects ?? {})) {
    if (RESERVED_EFFECT_TYPES.has(type)) continue;
    out.push(reg?.params ? { type, params: reg.params } : { type });
  }
  return out;
}

/** Per-kind declared fields off one axis' registry, kinds with no `params`
 *  omitted entirely (an empty entry would claim "declared, and nothing to
 *  edit" and suppress the value-presence fallback). */
function paramsByKind(
  registry: Record<string, { params?: readonly ParamField[] }> | undefined,
): Record<string, readonly ParamField[]> {
  const out: Record<string, readonly ParamField[]> = {};
  for (const [kind, reg] of Object.entries(registry ?? {})) {
    // `reg?` — the axis casts erase `| undefined`, and an explicitly-undefined
    // key would otherwise throw here rather than simply declaring nothing.
    if (reg?.params?.length) out[kind] = reg.params;
  }
  return out;
}

/** Derives the editor vocabulary from the theme's registrations, so a brand
 *  declares each kind ONCE. An explicit EditorMeta still wins per field —
 *  the host may override anything the theme implies. */
export function editorMetaFromTheme(theme: CompositionTheme, explicit?: EditorMeta): EditorMeta {
  const videoProps = paramsByKind(theme.video as Record<string, { params?: readonly ParamField[] }> | undefined);
  const overlayProps = paramsByKind(overlayRegistry(theme));
  // Theme-derived first, explicit appended: `effectCatalog` replaces in place
  // on a `type` collision, so the LATER entry wins — i.e. the explicit one.
  const effects = [...effectsFromTheme(theme), ...(explicit?.effects ?? [])];
  return {
    ...explicit,
    // Spread per kind, not per axis: an explicit `videoProps.outro` overrides
    // the theme-derived outro while every OTHER kind stays theme-derived.
    videoProps: { ...videoProps, ...explicit?.videoProps },
    overlayProps: { ...overlayProps, ...explicit?.overlayProps },
    effects,
  };
}

/** A readable label for an identifier key: `logoDelaySec` → "Logo delay sec",
 *  `my-kind` → "My kind". The default whenever no label is declared. */
export function humanizeKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim()
    .toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
}

/** A deterministic, muted block colour for a lane item core has no colour for.
 *  Same seed → same colour, so an unknown brand kind is at least consistently
 *  distinguishable instead of all-grey.
 *
 *  Hue alone is not enough. The old version was `hue = hash % 360` at a fixed
 *  S/L, and with the ~dozen lane kinds a real brand actually has, two of them
 *  landing within a few degrees is likely rather than unlucky — `overlay-chevron`
 *  and `overlay-lottie` came out 6° apart and read as one colour. So: the hash
 *  is avalanched first (the plain `*31` accumulator has almost no low-bit
 *  mixing, which is what made neighbouring seeds land near each other), and
 *  saturation and lightness are two further axes, driven by independent bits of
 *  the mixed hash. Near-identical hues then still separate by weight.
 *  `stableColor.test` asserts a minimum separation over the real kind set. */
const SATURATIONS = [34, 42, 50];
const LIGHTNESSES = [28, 36, 44, 52];

/** murmur3 fmix32 — avalanche, so one changed input char moves every output bit. */
function mix32(x: number): number {
  let h = x >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export function stableColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (Math.imul(h, 31) + seed.charCodeAt(i)) >>> 0;
  const m = mix32(h);
  const hue = m % 360;
  const sat = SATURATIONS[(m >>> 20) % SATURATIONS.length];
  const light = LIGHTNESSES[(m >>> 12) % LIGHTNESSES.length];
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}
