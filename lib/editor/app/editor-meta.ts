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
import { ACCENT_HUE, HUE_GUARD, ARC, hslToRgb, redmean } from './lane-colors';

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
 *  generic footage renderer) implements Ken Burns and — since Phase 4 Task
 *  3.4, when `grade` joined the style axis alongside it — grade; every other
 *  effect is a brand's and arrives via `EditorMeta.effects`.
 *
 *  `grade` has no non-neutral `defaults`: every `Grade` field is optional and
 *  neutral when absent (see the item-level Color panel in
 *  `LayeredInspector.tsx`, which edits the exact same shape), so adding the
 *  effect starts as a genuine no-op the author then tunes — never a
 *  surprise picture change the instant it's added. */
export const CORE_EFFECTS: readonly EffectDefinition[] = [
  {
    type: 'ken-burns',
    label: 'Ken Burns',
    defaults: { fromScale: 1, toScale: 1.08, fromX: 0.5, toX: 0.5 },
  },
  {
    type: 'grade',
    label: 'Grade',
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
 *  `grade`, `CORE_STYLE_EFFECT_TYPES`), which already have static
 *  `CORE_EFFECTS` entries with their own labels/defaults and (for grade) a
 *  bespoke inspector panel — re-deriving them here would just shadow that
 *  with a generic params list.
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

/** A deterministic, muted block colour for a lane item core has no colour for.
 *  Same seed → same colour, so an unknown brand kind is at least consistently
 *  distinguishable instead of all-grey — and, since the accent repaint, one
 *  that still holds the palette: the hue is confined to the same arc as
 *  `CORE_LANE_COLOR` (`lane-colors.ts`), so an unlisted brand kind never lands
 *  on the accent hue or outside the family of blues the accent belongs to.
 *
 *  Separation is now a PROPERTY OF THE GENERATOR, not tuned against one test
 *  fixture. Earlier versions of this function picked hue/saturation/lightness
 *  independently (first three bit-windows of one hash, then three separately
 *  salted hash rounds) and a test asserted a minimum distance over one fixed
 *  16-kind list — which passed by construction for that list while an
 *  independent audit (random salts, random kind names) found the SAME
 *  generator gave a worse-than-baseline median separation and a tripled
 *  duplicate rate for kinds outside the fixture. The actual bug: three
 *  independently-hashed axes can each look fine alone while landing close
 *  together in the SAME combination for an unlucky seed pair — nothing
 *  guaranteed the three draws stayed apart as a point in (hue, sat, light)
 *  space.
 *
 *  So instead: build a small, FIXED set of colours once, up front, by
 *  farthest-point sampling (maximin) directly in RGB "redmean" distance —
 *  repeatedly adding whichever candidate is farthest from every colour
 *  already chosen. This is a real, geometric construction, not a search
 *  against any list of kind names, and it gives a guarantee a hash-then-slice
 *  scheme cannot: every PAIR of distinct palette entries is farther apart
 *  than PALETTE_FLOOR, verified exhaustively (all pairs, not a sample) in
 *  `editor-meta.test.ts`. A seed's colour is `PALETTE[hash(seed) % size]` —
 *  two different seeds either land in the same slot (identical colour, a
 *  real but bounded risk from the hash alone) or are guaranteed well
 *  separated. There is no middle ground where two different-but-similar
 *  colours slip through, the way independently-hashed axes allowed.
 *
 *  PALETTE_SIZE is a considered, not exhaustively optimised, choice: more
 *  slots lower the chance two unrelated kinds collide but shrink the
 *  guaranteed floor (the same hue/sat/light box holds more points only by
 *  packing them closer); fewer slots do the opposite. 96 keeps the measured
 *  floor comfortably meaningful (~34.5 redmean, see `editor-meta.test.ts`)
 *  while keeping collision risk for a realistic brand's kind list (a dozen or
 *  so — see the history in this file) reasonable. Not re-tuned beyond that —
 *  a bigger PALETTE_SIZE with a lower floor is not obviously a better trade,
 *  so this is a considered point on the curve, not a search for the best
 *  one. */
const SAT_MIN = 26;
const SAT_MAX = 70;
const LIGHT_MIN = 22;
const LIGHT_MAX = 68;
const PALETTE_SIZE = 96;

// The usable hue span is the arc minus the guard band around the accent —
// which, since the accent's real hue (~251.78) differs from the old
// hardcoded 258, leaves TWO segments: below the guard (190 to ~226.78) and a
// sliver above it (~276.78 to 280), not just the one segment the arc's
// numbers made it easy to assume. Guarded against either segment (or both)
// collapsing to 0 or negative width — if the guard band ever covered the
// whole arc, dividing by a 0-width usable span would produce `NaN` and every
// generated colour would be `hsl(NaN, …)`; there is always at least 1deg of
// room instead.
const GUARD_LO = ACCENT_HUE - HUE_GUARD;
const GUARD_HI = ACCENT_HUE + HUE_GUARD;
// A 1deg margin shaved off each segment's edge closest to the guard band.
// `stableColor` rounds its hue to a whole degree for a tidier `hsl(...)`
// string; without this margin a candidate landing a fraction of a degree
// outside the guard could round INTO it even though its exact value never
// crossed the boundary — this actually happened during development (a
// candidate at 226.75deg, past a naive un-margined check, rounding to a
// value inside the band) before the margin was widened to cover both
// segment edges, not just one.
const ROUNDING_MARGIN = 1;
const WIDTH_BELOW_GUARD = Math.max(0, GUARD_LO - ARC[0] - ROUNDING_MARGIN);
const WIDTH_ABOVE_GUARD = Math.max(0, ARC[1] - GUARD_HI - ROUNDING_MARGIN);
const USABLE = Math.max(1, WIDTH_BELOW_GUARD + WIDTH_ABOVE_GUARD);

/** Maps a fraction in [0, 1) into the usable hue span — the arc minus the
 *  guard band minus `ROUNDING_MARGIN` on both sides of it, distributed across
 *  whichever of the two segments above are actually non-empty. Used only
 *  while building `STABLE_COLOR_PALETTE` below (once, at module load) — every
 *  generated candidate is constrained by this before farthest-point selection
 *  ever runs, so the guarantee holds by construction rather than by checking
 *  afterwards. */
function hueInArc(frac: number): number {
  const t = frac * USABLE;
  return t < WIDTH_BELOW_GUARD ? ARC[0] + t : GUARD_HI + ROUNDING_MARGIN + (t - WIDTH_BELOW_GUARD);
}

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

/** A small, deterministic PRNG (mulberry32) — used only to generate the
 *  CANDIDATE pool farthest-point sampling picks from below. Deterministic so
 *  the palette (and every colour derived from it) doesn't change from one
 *  process to the next; the seed is an arbitrary fixed constant, not derived
 *  from anything meaningful. */
function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Hsl {
  h: number;
  s: number;
  l: number;
}

/** Farthest-point (maximin) sampling: start with the first candidate, then
 *  repeatedly add whichever remaining candidate is farthest from every
 *  colour already chosen. This is what makes the palette's separation a
 *  geometric fact rather than a hope — each addition can only ever be at
 *  least as far from the existing set as every candidate NOT chosen. */
function buildPalette(size: number): Hsl[] {
  const rnd = mulberry32(0xc0ffee);
  const CANDIDATE_COUNT = 4000;
  const candidates: Hsl[] = [];
  for (let i = 0; i < CANDIDATE_COUNT; i += 1) {
    candidates.push({
      h: hueInArc(rnd()),
      s: SAT_MIN + rnd() * (SAT_MAX - SAT_MIN),
      l: LIGHT_MIN + rnd() * (LIGHT_MAX - LIGHT_MIN),
    });
  }
  const rgbs = candidates.map((c) => hslToRgb(c.h, c.s, c.l));
  const chosen = [0];
  const minDistToChosen = new Float64Array(CANDIDATE_COUNT);
  for (let i = 0; i < CANDIDATE_COUNT; i += 1) minDistToChosen[i] = redmean(rgbs[i], rgbs[0]);
  for (let k = 1; k < size; k += 1) {
    let best = -1;
    let bestDist = -1;
    for (let i = 0; i < CANDIDATE_COUNT; i += 1) {
      if (minDistToChosen[i] > bestDist) {
        bestDist = minDistToChosen[i];
        best = i;
      }
    }
    chosen.push(best);
    for (let i = 0; i < CANDIDATE_COUNT; i += 1) {
      const d = redmean(rgbs[i], rgbs[best]);
      if (d < minDistToChosen[i]) minDistToChosen[i] = d;
    }
  }
  return chosen.map((i) => candidates[i]);
}

/** Exported for `editor-meta.test.ts` ONLY. Verifying an exhaustive property
 *  (every pair of entries separated, every entry's hue in-bounds) over the
 *  whole palette is a fundamentally stronger guarantee than sampling
 *  `stableColor`'s output over a list of kind names — it is the direct fix
 *  for "the separation was tuned for one fixture instead of being a property
 *  of the generator." Nothing outside the test should import this. */
export const STABLE_COLOR_PALETTE: readonly Hsl[] = buildPalette(PALETTE_SIZE);

export function stableColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (Math.imul(h, 31) + seed.charCodeAt(i)) >>> 0;
  const { h: hue, s, l } = STABLE_COLOR_PALETTE[mix32(h) % STABLE_COLOR_PALETTE.length];
  return `hsl(${Math.round(hue)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}
