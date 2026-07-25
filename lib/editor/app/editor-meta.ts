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

import type { AccentSlot } from '../../theming/palette';

/** One declared, editable field inside an opaque bag (`props`, effect params).
 *  `options` present → a dropdown over exactly those values; otherwise the
 *  field is typed by the value currently held. */
export interface ParamField {
  prop: string;
  label?: string;
  options?: readonly string[];
}

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
  /** Timeline block colour per timeline effectId (`overlay-<kind>`,
   *  `video-<kind>`, `audio`, `music`, `brand-<kind>`). Overrides the core
   *  defaults and the deterministic fallback. */
  laneColors?: Record<string, string>;
  /** Timeline block label per overlay `content.kind`. Default: humanized kind. */
  overlayLabels?: Record<string, string>;
  /** Convenience carrier so a host can keep one metadata object; the inspector
   *  reads its own `accentSlots` prop first (see LayeredInspectorProps). */
  accentSlots?: readonly AccentSlot[];
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
 *  distinguishable instead of all-grey. */
export function stableColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 42%, 34%)`;
}
