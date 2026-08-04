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
import { isReservedEffectType, CORE_STYLE_EFFECT_TYPES, resolveStyleEffectRenderer } from '../../theming/effects';
import { registrationParams, type ParamField } from '../../theming/registry';
import type { LayeredReel } from '../../reel-config-base/layered-schema';

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
  /** Declared editable fields of a transition, per transition `kind`, for the
   *  kinds the BRAND registers. Unlike the other two `*Props` records this one
   *  keeps a kind whose registration declares NO params: its key set is also
   *  what tells the picker which brand kinds exist, and a param-less brand kind
   *  still has to be selectable. A core kind normally does NOT appear here —
   *  its controls are read structurally off the catalog (`subOptionsFor`) — but
   *  a brand OVERRIDING a core kind does put that key in the registry, so it
   *  lands here too. Harmless: `transitionKindChoices` dedupes against the
   *  catalog (the core entry keeps its position and label) and
   *  `transitionParamsFor` composes the two sources per `prop`. */
  transitionProps?: Record<string, readonly ParamField[]>;
  /** Timeline block colour per timeline effectId (`overlay-<kind>`,
   *  `video-<kind>`, `audio`, `music`, `brand-<kind>`). Overrides the core
   *  defaults and the deterministic fallback. */
  laneColors?: Record<string, string>;
  /** Timeline block label per overlay `content.kind`. Default: humanized kind. */
  overlayLabels?: Record<string, string>;
}

/** Core's own effect catalog: ONLY what core itself renders. SegmentMedia (the
 *  generic footage renderer) implements Ken Burns; every other effect is a
 *  brand's and arrives via `EditorMeta.effects`.
 *
 *  `grade` USED to be a second entry here (Phase 4 Task 3.4 through this
 *  removal) — an offerable `type: 'grade'` EFFECT, editable via the exact
 *  same seven fields as the item-level `item.grade` Color panel in
 *  `LayeredInspector.tsx`. It was removed because the two were always
 *  redundant: every video item already has its own Color section for the
 *  same seven parameters, and the inspector had to grow a whole guard
 *  mechanism (a "disabled — this item has its own grade effect" state) just
 *  to keep the two from silently fighting over one render. `item.grade` is
 *  the survivor — see the Color section below — and this catalog no longer
 *  offers a second way to author the same thing.
 *
 *  What is gone is only the CATALOG ENTRY and the "+ Add effect" route to it
 *  — the renderer arm itself is NOT inert. `gradeStyleEffect`
 *  (`lib/theming/effects/style-effect.ts`) is load-bearing: every video item
 *  that carries `item.grade` gets it synthesized into a `{type:'grade',
 *  ...item.grade}` effect (`syntheticGradeEffect`) and run through this same
 *  renderer at RENDER time, unconditionally — deleting the renderer arm
 *  would break colour grading for every graded clip, not just the
 *  already-vestigial hand-authored `type: 'grade'` literal it also still
 *  accepts for backwards compatibility. */
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
 *  RESERVED ones. A reserved type (`ken-burns`, or a brand's own style-effect
 *  registration — Phase 4 Task 3.2 made this DERIVED via
 *  `isReservedEffectType`, see lib/theming/effects/style-effect.ts) is skipped
 *  by `applyEffects` BEFORE resolution, so a brand's effect-AXIS registration
 *  for it never draws; deriving an editor entry from it would advertise
 *  params that cannot take effect. Core's own `ken-burns` entry (rendered by
 *  SegmentMedia, edited by the inspector's bespoke editor) is unaffected and
 *  stays offerable — it is the effect-axis OVERRIDE that is inert, not the
 *  effect. */
function effectsFromTheme(theme: CompositionTheme): EffectDefinition[] {
  const out: EffectDefinition[] = [];
  for (const [type, reg] of Object.entries(theme.effects ?? {})) {
    if (isReservedEffectType(theme, type)) continue;
    out.push(reg?.params ? { type, params: reg.params } : { type });
  }
  return out;
}

/** Every STYLE-axis effect type the theme registers as ITS OWN — i.e. every
 *  key of `theme.styleEffects` except core's two reserved types (`ken-burns`,
 *  `grade`, `CORE_STYLE_EFFECT_TYPES`). `ken-burns` is excluded because it
 *  already has a static `CORE_EFFECTS` entry with its own bespoke inspector
 *  panel — re-deriving it here would just shadow that with a generic params
 *  list. `grade` is excluded too, but for a stricter reason since the effect
 *  catalog dropped it entirely: it stays a reserved STYLE type (the renderer
 *  arm is kept, inert, for backwards compatibility — see `CORE_EFFECTS`'s own
 *  comment), but it is deliberately not re-offered here EITHER — the whole
 *  point of removing it from `CORE_EFFECTS` was to stop offering a second way
 *  to author what `item.grade` already covers, and letting it back in
 *  through the theme-derivation path the moment a theme happens to register
 *  it under `styleEffects.grade` would undo that.
 *
 *  This is Gap 1 of Task 4.4: a brand's style-effect registration RENDERS
 *  (`SegmentMedia` resolves it via `resolveStyleEffectRenderer`, threaded
 *  through `theme.styleEffects`) but, before this function, had NO editor
 *  catalog entry at all. `effectsFromTheme` above only reads `theme.effects`
 *  (the WRAPPER axis) and explicitly EXCLUDES anything reserved — and since
 *  Task 3.2 made the reserved set DERIVED from `theme.styleEffects` itself,
 *  every brand style effect fell into that exclusion with nothing on the
 *  other side to pick it back up. This function is the STYLE axis' OWN
 *  catalog source, deliberately not a relaxation of `effectsFromTheme`'s
 *  reserved-type skip on the WRAPPER axis — see the docblock above it for why
 *  that skip itself must stay exactly as strict as it is.
 *
 *  Uses `registrationParams` (`lib/theming/registry.ts`) — the SAME accessor
 *  the transition axis uses — rather than reaching into
 *  `theme.styleEffects[type].params` by hand, so a third axis cannot drift
 *  from how the other two read a registration's declared fields.
 *
 *  REQUIRES a resolvable renderer (`resolveStyleEffectRenderer`), fix round 1:
 *  `Registration.renderer` is OPTIONAL (`lib/theming/registry.ts` — "Absent =
 *  routing-only"), so a `theme.styleEffects` entry can declare `params` with
 *  no `renderer` at all. Without this check such an entry was offerable and
 *  editable while `applyStyleEffects` (`style-effect.ts`) silently skipped it
 *  (`if (!Renderer) continue`) — advertising a control that renders NOTHING,
 *  exactly the failure the docblock above forbids for the reserved set,
 *  reproduced on this axis. The predicate below is now symmetric with
 *  `isReservedEffectType`: offerable ⇔ reserved (resolves on the style axis)
 *  AND not core's own. */
function styleEffectsFromTheme(theme: CompositionTheme): EffectDefinition[] {
  const out: EffectDefinition[] = [];
  for (const type of Object.keys(theme.styleEffects ?? {})) {
    if (CORE_STYLE_EFFECT_TYPES.includes(type)) continue;
    if (!resolveStyleEffectRenderer(theme.styleEffects, type)) continue;
    const params = registrationParams(theme.styleEffects, type);
    out.push(params?.length ? { type, params } : { type });
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

/** Like `paramsByKind`, but KEEPS a kind whose registration declares no params
 *  (as an empty list). Used for the transition axis only, where the key set is
 *  itself the answer to "which kinds does this brand have" — dropping a
 *  param-less kind would make it unselectable in the picker, which is the whole
 *  capability. There is no value-presence fallback on this axis for an empty
 *  entry to suppress. */
function kindsWithParams(
  registry: Record<string, { params?: readonly ParamField[] } | undefined> | undefined,
): Record<string, readonly ParamField[]> {
  const out: Record<string, readonly ParamField[]> = {};
  for (const [kind, reg] of Object.entries(registry ?? {})) out[kind] = reg?.params ?? [];
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
  // WRAPPER axis first, then STYLE axis (Gap 1, Task 4.4) — order between the
  // two never matters in practice (a type registered on one axis is reserved
  // on the other, so their key sets cannot overlap), but wrapper-first keeps
  // this line's history readable as an append, not a rewrite.
  const effects = [...effectsFromTheme(theme), ...styleEffectsFromTheme(theme), ...(explicit?.effects ?? [])];
  return {
    ...explicit,
    // Spread per kind, not per axis: an explicit `videoProps.outro` overrides
    // the theme-derived outro while every OTHER kind stays theme-derived.
    videoProps: { ...videoProps, ...explicit?.videoProps },
    overlayProps: { ...overlayProps, ...explicit?.overlayProps },
    transitionProps: { ...kindsWithParams(theme.transitions), ...explicit?.transitionProps },
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

// ---- The curated lane palette ----------------------------------------------
// This used to be a farthest-point-sampled 2048-entry GENERATOR: build a
// candidate pool across `S=20-90%, L=15-80%`, then repeatedly pick whichever
// candidate is farthest (in RGB "redmean" distance) from every colour
// already chosen. Maximising perceptual distance necessarily spans the whole
// candidate box, and the result on screen was a saturated primary red next
// to a pale mint next to a dark navy — maximally distinguishable and
// completely incoherent with the rest of the editor. The user's verdict:
// "ty barvy vůbec nedrží look & feel zbytku" (these colours don't hold the
// rest's look & feel at all) — and the fix is not a better generator, it's
// no generator: pick a small set of colours that actually fits, and cycle
// them.
//
// Every FIXED lane colour in `CORE_LANE_COLOR` (`LayeredTimeline.tsx`) is
// exactly `S=52%, L=45%` — `#ac37ae`, `#ae3758`, `#377dae`, `#37ae87`,
// `#97ae37`, `#3fae37`, `#ae6e37` differ in HUE ALONE. That uniform
// saturation and lightness IS the editor's palette rule, and it's what the
// generator abandoned by roaming the whole sat/light box. This curated set
// obeys the rule instead: hue is the only authored variable below — the
// `52%, 45%` on every line is copied verbatim, deliberately, not derived —
// so retuning one entry can never accidentally drift the family's shared
// saturation/lightness.
//
// The ARRAY ORDER is deliberately NOT wheel order: both consumers below
// (`sourceColors`, `stableColor`) hand out consecutive entries to what are,
// in practice, neighbours — adjacent source files on the timeline, adjacent
// unknown kinds — so consecutive array entries are exactly the pair that
// most needs to contrast. In wheel order these 18 hues sit at roughly even
// ~17° steps around the circle, skipping the accent's guard band
// (`ACCENT_HUE` ± `HUE_GUARD`, `lane-colors.ts`) entirely by construction.
// This array instead visits that same wheel-ordered list at every 7th
// position (stride 7, coprime with 18, so all 18 are still visited exactly
// once) — which is why consecutive entries below read far apart on the
// wheel even though the full set still covers it evenly.
//
// `editor-meta.test.ts` asserts what used to hold "by construction" for the
// generator now holds "by assertion" for this literal: every entry parses,
// is exactly `S=52%, L=45%`, clears the accent guard band (wrapping
// correctly at 0/360), all 18 are distinct, and consecutive entries —
// including the wrap from the last back to the first, since cycling makes
// that pair adjacent too — stay well separated in hue.
export const LANE_PALETTE: readonly string[] = [
  'hsl(0, 52%, 45%)',
  'hsl(119, 52%, 45%)',
  'hsl(282, 52%, 45%)',
  'hsl(51, 52%, 45%)',
  'hsl(170, 52%, 45%)',
  'hsl(329, 52%, 45%)',
  'hsl(102, 52%, 45%)',
  'hsl(218, 52%, 45%)',
  'hsl(34, 52%, 45%)',
  'hsl(153, 52%, 45%)',
  'hsl(313, 52%, 45%)',
  'hsl(85, 52%, 45%)',
  'hsl(204, 52%, 45%)',
  'hsl(17, 52%, 45%)',
  'hsl(136, 52%, 45%)',
  'hsl(297, 52%, 45%)',
  'hsl(68, 52%, 45%)',
  'hsl(187, 52%, 45%)',
];

/** murmur3 fmix32 — avalanche, so one changed input char moves every output
 *  bit. Kept (unlike the rest of the old generator) because it's part of
 *  `stableColor`'s own hash, not part of the deleted palette construction. */
function mix32(x: number): number {
  let h = x >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

// Video-item kinds identified by a single named `source` file — the kinds
// `sourceColors` colours. `multi-clip` deliberately excluded: it carries
// `sources: SubSource[]`, not one `source`, and picking `sources[0]` would
// misrepresent a several-take block as if it were a single one. `card` and
// `outro` carry no media at all. See `sourceColors`'s own comment for the
// full rationale.
const SOURCE_COLORED_KINDS = new Set(['clip', 'broll', 'photo']);

/** Every distinct video-track SOURCE FILE in the reel, mapped to a colour —
 *  so a timeline block answers "is this the same take as that other block,
 *  or a different one," which a colour keyed on KIND cannot: a real reel
 *  that cuts five clips off two source files plus three brolls rendered in
 *  just two colours (one per kind) before this, no matter how wide the
 *  palette got. The kind is already in the block's label ("Clip seg-001:
 *  TH-01_t4.mp4"), so the colour was carrying no information the label
 *  didn't.
 *
 *  Assignment order is the SORTED source path, not order of appearance on
 *  the timeline. During cut-tune the user reorders and trims constantly, and
 *  an appearance-order assignment would recolour the whole timeline on every
 *  reorder — colours that move under you are worse than no colours at all.
 *  Lexicographic order is stable against every edit except adding or
 *  removing a source file, and is reproducible across machines and
 *  sessions, so the same reel opens with the same colours every time.
 *
 *  Colours are `LANE_PALETTE[i % LANE_PALETTE.length]` — CYCLING, not
 *  generating. A reel with more than 18 distinct sources reuses colours,
 *  starting from entry 0 again at the 19th source: that is the user's
 *  explicit instruction ("prostě je tam jen střídat" — just cycle them), not
 *  a defect to "fix" back into a generator that gets less coherent the more
 *  sources it has to spread across. */
export function sourceColors(reel: LayeredReel): Record<string, string> {
  const sources = new Set<string>();
  for (const item of reel.tracks.video) {
    if (SOURCE_COLORED_KINDS.has(item.kind) && 'source' in item && item.source) {
      sources.add(item.source);
    }
  }
  const sorted = [...sources].sort();
  const out: Record<string, string> = {};
  sorted.forEach((source, i) => {
    out[source] = LANE_PALETTE[i % LANE_PALETTE.length];
  });
  return out;
}

/** A deterministic, muted block colour for a lane item core has no colour
 *  for. Same seed → same colour, so an unknown brand kind is at least
 *  consistently distinguishable instead of all-grey. Draws from the SAME
 *  `LANE_PALETTE` `sourceColors` uses — one curated look in the editor, not
 *  a second palette that can drift from the first — via the pre-existing
 *  string hash (`h`) run through `mix32` for avalanche before landing on a
 *  slot, so a one-character change in `seed` still moves to an unrelated
 *  slot rather than a neighbouring one. */
export function stableColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (Math.imul(h, 31) + seed.charCodeAt(i)) >>> 0;
  return LANE_PALETTE[mix32(h) % LANE_PALETTE.length];
}
