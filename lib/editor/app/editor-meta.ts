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
 *  offers a second way to author the same thing. `item.grade` and a
 *  hand-authored `type: 'grade'` effect entry still resolve through the SAME
 *  renderer at RENDER time (`gradeStyleEffect`, `lib/theming/effects/
 *  style-effect.ts`) — that renderer arm was deliberately left in place as
 *  inert backwards compatibility for any already-authored config, it is just
 *  no longer reachable through this catalog or the "+ Add effect" UI. */
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
 *  than the measured floor, verified exhaustively (all pairs, not a sample)
 *  in `editor-meta.test.ts`. A seed's colour is `PALETTE[hash(seed) %
 *  size]` — two different seeds either land in the same slot (IDENTICAL
 *  colour — not "close", the exact same rendered value) or are guaranteed
 *  well separated. Read that plainly: the old design's failure mode (two
 *  kinds landing merely close together, e.g. 6-24 redmean apart, close
 *  enough to misread as one colour but not literally equal) has NOT been
 *  eliminated so much as converted into a different failure mode — exact
 *  duplication — whose rate is now a directly chosen, measured number
 *  (`PALETTE_SIZE`'s comment below) rather than an emergent property of
 *  three uncoordinated hash draws. That is real progress (the rate is
 *  smaller AND it's a known, tunable number now), not the absence of a
 *  trade-off.
 *
 *  PALETTE_SIZE is a considered trade-off, chosen by MEASURING, not assuming:
 *  more slots lower the chance two unrelated kinds collide but shrink the
 *  guaranteed floor (the same hue/sat/light box holds more points only by
 *  packing them closer); fewer slots do the opposite. The box below (sat
 *  20-90%, light 15-80%) is now nearly as wide as it can be — the only
 *  remaining constraint is the hue arc and the guard band, since the
 *  legibility concern that used to cap lightness was withdrawn once it was
 *  established the block labels already carry a text shadow a plain contrast
 *  check doesn't see. With that room, `PALETTE_SIZE = 2048` measures out to a
 *  minimum pairwise separation of **~22.52 redmean** over all 2,096,128 pairs
 *  (re-measured exhaustively, not assumed, in `editor-meta.test.ts` — it
 *  moves if the box or size changes; this rose from ~11.65 once `ARC`
 *  widened from a narrow 190-280 cool arc to the whole wheel minus the
 *  accent's guard band — see lane-colors.ts — because the wider hue span
 *  gives farthest-point sampling more room per slot) and a collision
 *  probability for a
 *  realistic dozen-kind brand list of **~3.2%** (birthday bound on 2048
 *  slots: 1 - e^(-12·11/(2·2048))). Honestly stated, that is NOT "the same
 *  ballpark" as the pre-harmonisation generator — at 12 kinds it measures at
 *  ~1.6% (2.1-2.7% was this generator's own measured rate at 14 kinds, not
 *  12; comparing across different list sizes would have understated the
 *  cost). So the real trade is roughly double the old generator's collision
 *  rate — a real, disclosed cost, not a wash — bought for a guaranteed
 *  arc/guard-compliant palette AND (per the reviewer's independent 5000-trial
 *  comparison) a lower near-duplicate rate under 20 redmean (21.4% of
 *  12-kind draws vs the old generator's 33.9%) and a higher mean minimum
 *  separation (30.4 vs the old generator's). Not the ~51-97% an earlier,
 *  much smaller palette (96 slots) produced for the same list sizes — that
 *  smaller palette's identical-colour rate was strictly worse than the
 *  pre-existing problem this task set out to fix, which is why it was
 *  replaced rather than kept: distinguishable is the goal, and identical is
 *  the one outcome that can never be distinguishable. */
const SAT_MIN = 20;
const SAT_MAX = 90;
const LIGHT_MIN = 15;
const LIGHT_MAX = 80;
const PALETTE_SIZE = 2048;

// The usable hue span is the arc minus the guard band around the accent —
// TWO segments, both substantial now that `ARC` is the whole wheel (widened
// from a narrow 190-280 cool arc the user rejected as "too few colours" —
// see lane-colors.ts's own comment on `ARC`): below the guard (0 to
// ~226.78) and above it (~276.78 to 360), roughly 226deg and 82deg wide
// respectively — not the "one wide segment, one sliver" shape the old
// narrow arc produced.
const GUARD_LO = ACCENT_HUE - HUE_GUARD;
const GUARD_HI = ACCENT_HUE + HUE_GUARD;
// A 1deg margin shaved off each segment's edge closest to the guard band.
// `stableColor`'s palette entries are rounded to whole degrees/percents (see
// `buildPalette` below) for a tidier `hsl(...)` string; without this margin a
// candidate generated a fraction of a degree outside the guard could round
// INTO it even though its exact value never crossed the boundary — this
// actually happened during development (a candidate at 226.75deg, past a
// naive un-margined check, rounding to a value inside the band) before the
// margin was widened to cover both segment edges, not just one.
const ROUNDING_MARGIN = 1;
const WIDTH_BELOW_GUARD = Math.max(0, GUARD_LO - ARC[0] - ROUNDING_MARGIN);
const WIDTH_ABOVE_GUARD = Math.max(0, ARC[1] - GUARD_HI - ROUNDING_MARGIN);
// Throws rather than silently clamping: a `Math.max(1, …)` here would let a
// degenerate ARC/ACCENT_HUE/HUE_GUARD combination (the guard band covering
// the whole arc) fall through as a 1deg span at `GUARD_HI + ROUNDING_MARGIN`
// — itself OUTSIDE `ARC` when the guard's upper edge sits at or past the
// arc's own edge, i.e. a silent rule-2 violation the caller would never see.
// `lane-colors.ts` throws on an equally-degenerate malformed accent for the
// same reason: a configuration this broken should fail loudly at module
// load, not quietly produce an out-of-bounds colour at runtime.
if (WIDTH_BELOW_GUARD + WIDTH_ABOVE_GUARD <= 0) {
  throw new Error(
    `ACCENT_HUE (${ACCENT_HUE}) with HUE_GUARD (${HUE_GUARD}) leaves no usable hue outside the guard band within ARC ${JSON.stringify(ARC)}`,
  );
}
const USABLE = WIDTH_BELOW_GUARD + WIDTH_ABOVE_GUARD;

/** Maps a fraction in [0, 1) into the usable hue span — the arc minus the
 *  guard band minus `ROUNDING_MARGIN` on both sides of it, distributed across
 *  whichever of the two segments above are actually non-empty. Used only
 *  while building the palette below (once, lazily, on first use — see
 *  `getStableColorPalette`) — every generated candidate is constrained by
 *  this before farthest-point selection ever runs, so the guarantee holds by
 *  construction rather than by checking afterwards. */
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
 *  least as far from the existing set as every candidate NOT chosen.
 *
 *  Candidates are rounded to whole degrees/percents, and de-duplicated by
 *  that ROUNDED triple, BEFORE selection ever runs — not after. Selecting on
 *  continuous values and rounding only the final palette can silently merge
 *  two distinct, well-separated-as-floats entries into the exact same
 *  rendered colour: found empirically at this box's size once `size` grew
 *  large enough (candidates packed close enough that some pairs shared a
 *  rounded triple), which would have meant the "every pair separated"
 *  guarantee below was checked against values `stableColor` doesn't actually
 *  emit. Rounding first means what's optimised is what ships. */
function buildPalette(size: number): Hsl[] {
  const rnd = mulberry32(0xc0ffee);
  const CANDIDATE_COUNT = 12000;
  const seen = new Set<string>();
  const candidates: Hsl[] = [];
  for (let i = 0; i < CANDIDATE_COUNT; i += 1) {
    const h = Math.round(hueInArc(rnd()));
    const s = Math.round(SAT_MIN + rnd() * (SAT_MAX - SAT_MIN));
    const l = Math.round(LIGHT_MIN + rnd() * (LIGHT_MAX - LIGHT_MIN));
    const key = `${h},${s},${l}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ h, s, l });
  }
  if (candidates.length < size) {
    throw new Error(`only found ${candidates.length} distinct rounded candidates for a palette of ${size}`);
  }
  const rgbs = candidates.map((c) => hslToRgb(c.h, c.s, c.l));
  const chosen = [0];
  const minDistToChosen = new Float64Array(candidates.length);
  for (let i = 0; i < candidates.length; i += 1) minDistToChosen[i] = redmean(rgbs[i], rgbs[0]);
  for (let k = 1; k < size; k += 1) {
    let best = -1;
    let bestDist = -1;
    for (let i = 0; i < candidates.length; i += 1) {
      if (minDistToChosen[i] > bestDist) {
        bestDist = minDistToChosen[i];
        best = i;
      }
    }
    chosen.push(best);
    for (let i = 0; i < candidates.length; i += 1) {
      const d = redmean(rgbs[i], rgbs[best]);
      if (d < minDistToChosen[i]) minDistToChosen[i] = d;
    }
  }
  return chosen.map((i) => candidates[i]);
}

// Built LAZILY, on first use, not at module load. `buildPalette` runs ~24M
// `redmean` calls (2048 slots x 12000 candidates, twice over) — ~77ms in
// plain node, and it measured at ~470ms to import `editor-meta` under
// vitest. `editor-meta.ts` sits on the editor's startup path (`LayeredTimeline`
// imports it), so paying that cost at import time is main-thread blocking on
// every editor open for a palette most sessions barely touch. A memo behind
// an accessor pays it once, on the first actual `stableColor` call (or the
// first test that asks for it), never at import.
let cachedPalette: readonly Hsl[] | undefined;

/** Exported for `editor-meta.test.ts` ONLY — call this, not a bare property,
 *  so the test can force the (lazy) build. Verifying an exhaustive property
 *  (every pair of entries separated, every entry's hue in-bounds) over the
 *  whole palette is a fundamentally stronger guarantee than sampling
 *  `stableColor`'s output over a list of kind names — it is the direct fix
 *  for "the separation was tuned for one fixture instead of being a property
 *  of the generator." Nothing outside the test should import this. */
export function getStableColorPalette(): readonly Hsl[] {
  if (!cachedPalette) cachedPalette = buildPalette(PALETTE_SIZE);
  return cachedPalette;
}

export function stableColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (Math.imul(h, 31) + seed.charCodeAt(i)) >>> 0;
  const palette = getStableColorPalette();
  // Palette entries are already whole-number h/s/l (rounded before selection,
  // not after — see `buildPalette`), so no rounding happens here: this emits
  // exactly the values the palette's own separation guarantee was computed
  // against, not a display-only approximation of them.
  const { h: hue, s, l } = palette[mix32(h) % palette.length];
  return `hsl(${hue}, ${s}%, ${l}%)`;
}
