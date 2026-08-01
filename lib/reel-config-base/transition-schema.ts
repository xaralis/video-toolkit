// THE transition catalog — the single source of truth for what a transition is.
//
// A transition used to be defined four times over: this zod union, the editor's
// hand-written `TRANSITION_KINDS` + `subOptionsFor` + `defaultTransition`, the
// `presentationFor` switch, and `transition-record.ts`'s structural type. They
// drifted (the editor's list ran ahead of the union for a whole phase). This
// file now owns the vocabulary the way `lib/theming/placement.ts` owns
// PLACEMENTS: ONE ordered catalog, from which everything else is derived —
//
//   CoreTransitionSchema = the zod discriminated union, built from the catalog
//   TransitionSchema     = (CoreTransitionSchema ∪ BrandTransitionSchema)
//                          ∩ TransitionTimingSchema (the kind-independent
//                          fields: `alignment`, `enabled`)
//   Transition           = z.infer of that union (see ./base-types)
//   TransitionKind       = the CORE kinds only — see the note on the type
//   TRANSITION_KINDS     = catalog kinds + labels (lib/editor/app/transitions)
//   subOptionsFor(kind)  = read STRUCTURALLY off the kind's own zod shape
//   defaultTransition()  = catalog defaults, checked against the schema by test
//   resolveTransition    = backed by a Record keyed by TransitionKind, so the
//                          compiler demands a mapping for every kind (lib/render;
//                          `presentationFor` used to be this Record's public
//                          name — deleted, see lib/render/README.md)
//
// ADDING A CORE KIND: append one entry below. The union, the editor dropdown,
// its sub-option controls and its defaults all follow; the only other edit the
// compiler will demand is the render mapping in lib/render/at-cut-transitions.
//
// ADDING A BRAND KIND: don't touch this file at all. Since Phase 4 the catalog
// is core's vocabulary, not THE vocabulary: `TransitionSchema` is a union of the
// closed catalog and an open `BrandTransitionSchema`, so a brand kind parses on
// shape alone and reaches the renderer with its own parameters intact. The cost
// is spelled out on `BrandTransitionSchema` and in lib/render/transition-record.
//
// MIGRATING A BRAND (on the submodule pin bump that brings this file in):
// `layered-schema.ts` now types `transitionIn`/`transitionOut` as
// `TransitionSchema` rather than `z.record(z.string(), z.unknown())`, so a
// brand that SPREADS a transition object to inject its own look no longer
// typechecks — spreading a `Transition | undefined` makes every property
// optional, `kind` included, and an optional discriminant is not a Transition.
// Rendering is unaffected (nothing re-parses at render time); this is a
// compile-time migration only. Replace the spread with
// `withTransitionOverrides` (bottom of this file):
//
//   -  ? { ...it, transitionOut: { ...it.transitionOut, mask: 'm.png' } }
//   +  ? { ...it, transitionOut: withTransitionOverrides(it.transitionOut, { mask: 'm.png' }) }
//
// 30 fps assumption baked into copy text ("30 frames = 1 sec").
import { z } from 'zod';
import type { ParamChoice, ParamField } from './param-field';
import { NodeEnabledSchema } from './node-enabled';

export const TransitionFrames = z
  .number()
  .min(1)
  .max(60)
  .describe('Transition length in FRAMES (30fps reel → 30 frames = 1 sec). Rendered at the cut using handle frames from both sides.');

/** Where a transition sits RELATIVE TO THE CUT — every NLE's third transition
 *  property, after kind and length (Premiere spells them "Center at Cut",
 *  "Start at Cut", "End at Cut").
 *
 *  - `center` — half the transition before the cut, half after. The default,
 *    and what core could express before Phase 4 Task 1.4.
 *  - `start`  — the whole transition AFTER the cut; the incoming clip carries
 *    it, and the outgoing clip is held to its last frame.
 *  - `end`    — the whole transition BEFORE the cut; the outgoing clip carries
 *    it, and the incoming clip is pulled in early.
 *
 *  The frames each side lends are decided by {@link transitionHandles} below —
 *  read by the renderer (`lib/render/video-track-layout.ts`) and by the editor's
 *  transitions lane, so the ruler and the render can never disagree. */
export const TRANSITION_ALIGNMENTS = ['center', 'start', 'end'] as const;

export const TransitionAlignmentSchema = z
  .enum(TRANSITION_ALIGNMENTS)
  .describe('Where the transition sits relative to the cut. Default center (half each side).');

/** @see TRANSITION_ALIGNMENTS */
export type TransitionAlignment = (typeof TRANSITION_ALIGNMENTS)[number];

/** True when `v` is one of the three alignments. THE one place that decides it:
 *  both the renderer's defaulting ({@link transitionAlignmentOf}, read by
 *  `lib/render/video-track-layout.ts`) and the editor's kind-switch threading
 *  (`defaultTransition` below) read a value that was never re-parsed — a
 *  hand-edited `Root.tsx`, a config persisted by an older editor — so both need
 *  to ask, and neither should carry its own copy of the literal list. */
export function isTransitionAlignment(v: unknown): v is TransitionAlignment {
  return (TRANSITION_ALIGNMENTS as readonly unknown[]).includes(v);
}

/** The alignment a transition-like value asks for, DEFAULTED. Read defensively
 *  rather than off the parsed type: a project's `Root.tsx` is hand-edited and
 *  never re-parsed at render time, so an unknown string here must mean "the
 *  default", not "undefined behaviour". */
export function transitionAlignmentOf(t: unknown): TransitionAlignment {
  const a = (t as { alignment?: unknown } | null | undefined)?.alignment;
  return isTransitionAlignment(a) ? a : 'center';
}

/** Where a boundary's transition window sits relative to its cut, as the frames
 *  claimed on each side: `before` is what the INCOMING clip lends BACKWARDS,
 *  `after` what the OUTGOING clip lends FORWARDS. The window at a cut at frame
 *  `c` is therefore `[c - before, c + after]`, and `before + after === frames`
 *  for every alignment.
 *
 *  THE one decider — same rule as {@link isCut} and {@link isTransitionAlignment}.
 *  Two places need this answer and they must not disagree: the RENDERER
 *  (`computeVideoLayout` in `lib/render/video-track-layout.ts`, which turns it
 *  into each clip's handle frames) and the EDITOR (the transitions lane in
 *  `lib/editor/src/timeline/layered-adapter.ts`, which draws the block on the
 *  ruler). The lane used to reimplement the split as an unconditional
 *  `[c - f/2, c + f/2]`, so a `start`- or `end`-aligned boundary rendered offset
 *  and was DRAWN centred.
 *
 *  `center`'s `Math.floor` is load-bearing and paired with the `Math.ceil`: on
 *  an odd frame count the extra frame goes to the OUTGOING side, and every baked
 *  reel in every brand repo is cut that way. Do not "tidy" the pair into one
 *  rounding helper. */
export function transitionHandles(
  frames: number,
  alignment: TransitionAlignment,
): { before: number; after: number } {
  if (alignment === 'start') return { before: 0, after: frames };
  if (alignment === 'end') return { before: frames, after: 0 };
  return { before: Math.floor(frames / 2), after: Math.ceil(frames / 2) };
}

/** The kind that means "no transition at all". THE literal — every site that
 *  asks "is this a cut?" goes through {@link isCut}, and every site that BUILDS
 *  one uses this constant, so the string exists once.
 *
 *  Before Phase 4 Task 1.5 it was written out independently in five places
 *  (this file's catalog entry and `kindNeedsFrames`, `transition-record.ts`'s
 *  type and its runtime gate, and the render map's key) plus two more in the
 *  editor's timeline adapter — all of them in the path that decides whether a
 *  boundary renders anything at all. */
export const CUT_KIND = 'cut';

/** True when a transitionIn/transitionOut field means NO TRANSITION at this
 *  boundary: absent, kind-less, or explicitly `cut`. All three are the same
 *  answer to every caller, which is why they are one predicate rather than a
 *  `kind === 'cut'` sprinkled next to an ad-hoc null check.
 *
 *  Accepts a kind STRING or the whole transition object, and takes `unknown`
 *  deliberately: a rendered literal is not necessarily schema-validated (a
 *  project's `Root.tsx` is hand-edited), so this has to survive whatever it is
 *  handed. Same rule as {@link isTransitionAlignment} — one exported decider,
 *  no site keeping its own copy of the literal. */
export function isCut(t: unknown): boolean {
  const kind = typeof t === 'string' ? t : (t as { kind?: unknown } | null | undefined)?.kind;
  // Falsy — not just nullish — because that is exactly what the gate in
  // `transition-record.ts` did before the collapse (`!kind || kind === 'cut'`),
  // and `{ kind: '' }` off a hand-edited literal is "no kind", not a kind.
  return !kind || kind === CUT_KIND;
}

/**
 * The TIMING fields every transition carries, whatever its kind — core-catalog
 * or brand-authored. Kept OUT of the catalog members on purpose:
 *
 * - a brand transition is no less entitled to alignment than a core one, and
 *   `BrandTransitionSchema` cannot enumerate core's members to inherit from;
 * - `subOptionsFor` reads a kind's LOOK parameters structurally off its member
 *   shape, and alignment is not a look parameter — it is a sibling of `frames`,
 *   which that function already excludes by name.
 *
 * Intersected onto the whole union in `TransitionSchema` below, so both
 * branches carry it from one declaration.
 */
export const TransitionTimingSchema = z.object({
  alignment: TransitionAlignmentSchema.optional(),
  // The node contract's own switch, shared with the effect axis (see
  // ./node-enabled.ts). It rides here for the same reason
  // `alignment` does: a brand transition is no less entitled to it than a core
  // one, it is not a look parameter, and this is the one declaration that
  // reaches BOTH branches of the union. Honoured in `getTransitionRecord`.
  enabled: NodeEnabledSchema,
});

const Direction4 = z.enum(['left', 'right', 'up', 'down']);

/**
 * A BRAND accent-slot key — the brand-neutral way for a core schema to name a
 * colour. To zod it is just a string, because the vocabulary belongs to the
 * brand: `lib/theming/palette.ts` `AccentSlot` declares the keys, and
 * `resolveAccentColor` turns one into a hex at render time. Core cannot
 * enumerate the options (this field used to be a fixed three-value enum over
 * one brand's palette, sitting in the shared schema), so it validates the
 * shape and leaves the values to the brand.
 *
 * It documents INTENT at the field; what gives the field its editor control is
 * the field's NAME being listed in `ACCENT_FIELDS` (below, beside
 * `PROP_LABELS`). Chain it however you like — the mark cannot be chained away.
 */
export const AccentKey = z
  .string()
  .describe('Brand accent-slot key (see the brand theme’s accentSlots); resolved to a hex at render time.');

/**
 * A LITERAL colour (a hex string), as opposed to `AccentKey`'s indirection
 * through the brand palette. Same deal: to zod both are `z.string()`, and so is
 * burn's `mask` file path, so the EDITOR's distinction comes from
 * `COLOR_FIELDS`, not from this constant.
 *
 * Validation is deliberately unchanged from the plain `z.string()` it replaces
 * — this describes the field, it does not start rejecting values that used to
 * parse.
 */
export const ColorHex = z.string().describe('A literal colour (hex).');

/**
 * A colour field that accepts EITHER an {@link AccentKey} (a brand accent-slot
 * key) OR a {@link ColorHex} literal — the union of the two. To zod this is
 * still just `z.string()` (both alternatives already are, and see the note on
 * `subOptionForField` about why a `z.union` of two `ZodString`s is deliberately
 * NOT used here), so this exists to document intent, exactly as `AccentKey`
 * and `ColorHex` themselves do — the editor control and the render-time
 * resolution are what actually give the two meanings apart (see
 * `ACCENT_OR_COLOR_FIELDS` below, and `resolveAccentOrColor` in
 * `lib/theming/palette.ts`).
 *
 * `fade-to-color.color` and `wipe.color` are both this, not plain `AccentKey`:
 * a brand's colour is not always an accent in the BRAND's own model (PP's
 * `coal` is a background token, not an accent slot), and forcing it into
 * `accentSlots` to satisfy a core type that only accepted a key was the brand
 * leak this widening removes. A literal written directly in the brand's own
 * config (`color: '#RRGGBB'`) is exactly where a brand hex belongs; core still
 * names no colour of its own anywhere in this file.
 */
export const AccentOrColorHex = z
  .string()
  .describe('Brand accent-slot key OR a literal colour (hex). A literal is used as-is; an accent key resolves via the brand theme’s accentSlots at render time.');

/** One entry in the catalog: the kind's zod member plus the presentation
 *  metadata the zod schema cannot express (a human label, and the seed values
 *  `defaultTransition` uses where "first enum option" is the wrong choice). */
interface CatalogEntry {
  /** The discriminated-union member. `kind` is read back off this — never restated. */
  schema: z.ZodObject<z.ZodRawShape>;
  /** Editor-facing name (English — the editor UI is English). */
  label: string;
  /** Seed values for `defaultTransition`, for fields where the schema's own
   *  first enum option isn't the sensible default (or the field is optional and
   *  should still be seeded so the control isn't empty). */
  defaults?: Record<string, unknown>;
}

/** Identity, but declared with a REST parameter so the catalog keeps its TUPLE
 *  type and each entry keeps its PRECISE `ZodObject<…>` type. That is what lets
 *  `TransitionSchema` below infer the real discriminated union (and therefore
 *  `Transition`/`TransitionKind`) from a DERIVED list — a plain
 *  `CatalogEntry[]` annotation would widen every member to
 *  `ZodObject<ZodRawShape>` and collapse `Transition` to `{[k: string]: any}`. */
function catalog<T extends CatalogEntry[]>(...entries: T): T {
  return entries;
}

// Ordered as the editor dropdown reads best: no-op first, then the soft looks,
// then the directional/geometric ones. Order here IS the dropdown order and the
// union's member order — both derive from this list.
const CATALOG = catalog(
  { schema: z.object({ kind: z.literal(CUT_KIND) }), label: 'Cut' },
  // `dissolve` is the CANONICAL name for the A→B blend — the standard NLE word
  // for it, and what these two actually do. `fade` is its synonym and renders
  // identically; both are kept because `{kind:'fade'}` is baked into brand
  // `Root.tsx` literals, and REINTERPRETING a baked literal is the one risk
  // Task 2.3 exists to avoid. The `fade` → `dissolve` migration is written up
  // (parity-preserving, a safe rename) in docs/superpowers/phase4-migrations.md
  // and deliberately NOT applied. Reclaiming the name `fade` for something else
  // is a Phase 5 decision; do not do it here.
  { schema: z.object({ kind: z.literal('dissolve'), frames: TransitionFrames }), label: 'Dissolve' },
  { schema: z.object({ kind: z.literal('fade'), frames: TransitionFrames }), label: 'Fade' },
  {
    // THE MISSING PARAMETER, exposed. `color` accepts EITHER a brand
    // ACCENT-SLOT KEY OR a literal colour (hex) — `AccentOrColorHex`, same dual
    // convention as `wipe.color`. It used to be `AccentKey`-only; the widening
    // is what lets a brand for whom the colour is NOT an accent in its own
    // model (a background token, say) write the hex directly instead of
    // declaring a fake accent slot to satisfy this field's type. `color` is
    // still the field's NAME regardless: `ACCENT_OR_COLOR_FIELDS` (below) is
    // what gives it its dual editor control, and core still cannot enumerate a
    // brand's accent vocabulary — only the literal half is core-nameable, and
    // core names none.
    //
    // OPTIONAL, with no seed: with no colour there is nothing to dip through,
    // so the renderer falls back to the plain crossfade. Core has no colour
    // vocabulary to seed this from — it names NO colour anywhere in this
    // catalog; a brand that wants a specific dip writes a hex or declares an
    // accent slot in its own palette and writes that key here.
    //
    // This kind REPLACED a per-brand kind name: core's catalog used to carry
    // one brand's colour word as a kind of its own, which is what a missing
    // parameter looks like when there is no brand extension path. There is one
    // now (Task 1.2), so the word went back to the brand and the parameter
    // stayed here.
    schema: z.object({
      kind: z.literal('fade-to-color'),
      frames: TransitionFrames,
      color: AccentOrColorHex.optional().describe('Colour dipped through — a brand accent-slot key OR a literal (hex). Unset = a plain crossfade.'),
    }),
    label: 'Fade to colour',
  },
  {
    // Task 2.4: four presentation props existed only as `glitch.tsx`'s own
    // destructured defaults, unreachable from any config. Optional, straight
    // pass-through, no renaming.
    schema: z.object({
      kind: z.literal('glitch'),
      frames: TransitionFrames,
      intensity: z.number().min(0).max(1).optional().describe('Overall strength of the tearing, RGB split and scan lines. Default 0.8.'),
      slices: z.number().min(2).max(32).optional().describe('Roughly how many horizontal tear-bands (drives vertical noise frequency). Default 8.'),
      rgbShift: z.boolean().optional().describe('Include RGB channel separation. Default on.'),
      scanLines: z.boolean().optional().describe('Include a scan-lines overlay. Default on.'),
    }),
    label: 'Glitch',
    // Both booleans default ON in the presentation; a checkbox has no "unset"
    // state (see defaultTransition's note), so they must be seeded true or
    // the inspector would show "off" for something plainly on in the frame.
    defaults: { rgbShift: true, scanLines: true },
  },
  {
    // Chromatic aberration: two hue-rotated ghosts of the frame pull apart and
    // snap back. Both params are optional — `presentations/rgb-split.tsx`
    // destructures them with its own defaults, so `{kind, frames}` alone
    // already looks right.
    schema: z.object({
      kind: z.literal('rgb-split'),
      frames: TransitionFrames,
      direction: z
        .enum(['horizontal', 'vertical', 'diagonal'])
        .optional()
        .describe('Axis the colour ghosts separate along. Default horizontal.'),
      displacement: z
        .number()
        .min(0)
        .max(200)
        .optional()
        .describe('Peak ghost offset in px, at the midpoint of the transition. Default 50.'),
    }),
    label: 'RGB split',
  },
  {
    // CRT scanlines + a fixed two-ghost RGB shift. Deliberately one knob: the
    // presentation reads exactly one prop (`rgbShiftPx`); the scanline pitch
    // and the per-frame jitter are baked in.
    schema: z.object({
      kind: z.literal('scanline-glitch'),
      frames: TransitionFrames,
      rgbShiftPx: z
        .number()
        .min(0)
        .max(64)
        .optional()
        .describe('Peak horizontal separation of the two colour ghosts, in px. Default 16.'),
    }),
    label: 'Scanline glitch',
  },
  {
    schema: z.object({
      kind: z.literal('burn'),
      frames: TransitionFrames,
      // Optional brand-supplied look: cloud mask image, hot-edge glow colour, and
      // burn-edge shaping. Absent mask → plain opacity reveal. All four are
      // editable as of Phase 4 Task 1.1: `mask` as text, `glowColor` as a colour
      // (its name is listed in `COLOR_FIELDS` — see subOptionForField), the two
      // numbers as numeric fields.
      mask: z.string().optional().describe('Cloud-texture mask image (staticFile path).'),
      glowColor: ColorHex.optional().describe('Hot burn-edge glow colour (hex).'),
      edgeContrast: z.number().optional().describe('Burn-edge hardness. Default 14.'),
      glowBand: z.number().optional().describe('Glow lead distance in luma. Default 0.1.'),
    }),
    label: 'Burn',
  },
  {
    // Film light leak: a coloured gradient sweeps across while the frame
    // over-exposes, with optional lens-flare artifacts on top.
    schema: z.object({
      kind: z.literal('light-leak'),
      frames: TransitionFrames,
      temperature: z
        .enum(['warm', 'cool', 'rainbow'])
        .optional()
        .describe('Colour cast of the leak. Default warm.'),
      direction: z
        .enum(['left', 'right', 'top', 'bottom', 'center'])
        .optional()
        .describe('Edge the light enters from (`center` blooms outward). Default right.'),
      intensity: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe('Strength of the over-exposure and the flares. Default 0.8.'),
      flareArtifacts: z.boolean().optional().describe('Add lens-flare blobs and an anamorphic streak. Default on.'),
    }),
    label: 'Light leak',
    // See defaultTransition's note: only booleans get seeded, because a
    // checkbox has no "unset" state to be honest with.
    defaults: { flareArtifacts: true },
  },
  { schema: z.object({ kind: z.literal('slide'), frames: TransitionFrames, direction: Direction4 }), label: 'Slide' },
  { schema: z.object({ kind: z.literal('flip'), frames: TransitionFrames, direction: Direction4 }), label: 'Flip' },
  {
    // Task 2.4: `blurAmount` existed only as `whip-pan.tsx`'s own destructured
    // default (px of peak motion blur), unreachable from any config.
    schema: z.object({
      kind: z.literal('whip-pan'),
      frames: TransitionFrames,
      direction: Direction4,
      blurAmount: z.number().min(0).max(100).optional().describe('Peak motion-blur radius in px. Default 20.'),
    }),
    label: 'Whip pan',
  },
  {
    // Task 2.4: `zoomAmount` existed only as `zoom-through.tsx`'s own
    // destructured default (a raw scale multiplier, not a percent — same
    // convention as `zoom-blur.scaleAmount` below, whose 1-3 range this
    // mirrors), unreachable from any config.
    schema: z.object({
      kind: z.literal('zoom-through'),
      frames: TransitionFrames,
      // ONE NAME PER CONCEPT (Task 2.5). This field was `from`, while
      // `zoom-blur` below spelled the IDENTICAL concept `direction` — two
      // answers to one question, papered over by a rename table in the editor's
      // own test suite. `direction` is canonical here now, spelled and bounded
      // exactly as `zoom-blur`'s is.
      direction: z
        .enum(['in', 'out'])
        .optional()
        .describe('`in` zooms toward the viewer, `out` away. Default in.'),
      // DEPRECATED ALIAS, kept so a BAKED LITERAL keeps parsing and keeps
      // rendering what it always rendered. Reinterpreting or dropping an
      // authored value silently is the one thing this workstream must never do.
      // It has no editor control (see DEPRECATED_FIELDS) — offering two
      // controls for one concept would re-open the fork in the UI — and
      // `lib/render/at-cut-transitions.tsx` warns once when it is used.
      from: z
        .enum(['in', 'out'])
        .optional()
        .describe('DEPRECATED alias of `direction`. Kept for baked literals; use `direction`.'),
      zoomAmount: z.number().min(1).max(3).optional().describe('Peak scale multiplier. Default 1.8.'),
    }),
    label: 'Zoom',
  },
  {
    // Radial-blur punch. Distinct from `zoom-through`: that one pushes the
    // outgoing clip away and pulls the incoming one in; this one blurs and
    // over-scales a SINGLE frame around a chosen origin.
    schema: z.object({
      kind: z.literal('zoom-blur'),
      frames: TransitionFrames,
      direction: z.enum(['in', 'out']).optional().describe('`in` zooms toward the viewer, `out` away. Default in.'),
      blurAmount: z.number().min(0).max(100).optional().describe('Peak blur radius in px. Default 20.'),
      scaleAmount: z
        .number()
        .min(1)
        .max(3)
        .optional()
        .describe('Peak scale multiplier (its reciprocal is the other end of the move). Default 1.15.'),
      origin: z
        .enum(['center', 'top', 'bottom', 'left', 'right'])
        .optional()
        .describe('Point the zoom and the light streak radiate from. Default center.'),
    }),
    label: 'Zoom blur',
  },
  { schema: z.object({ kind: z.literal('clock-wipe'), frames: TransitionFrames }), label: 'Clock wipe' },
  { schema: z.object({ kind: z.literal('iris'), frames: TransitionFrames }), label: 'Iris' },
  {
    schema: z.object({
      kind: z.literal('wipe'),
      frames: TransitionFrames,
      // The sweep's colour, as EITHER a BRAND accent-slot key OR a literal
      // (hex) — `AccentOrColorHex`, the same dual widening `fade-to-color`
      // took. This field used to be a fixed three-value enum naming one
      // brand's palette colours, sitting in the shared schema and inherited by
      // every other brand; then an accent-key-only field, which still forced a
      // brand whose sweep colour is not an accent in its own model to declare
      // a fake slot. Optional: unset means the presentation's own neutral
      // sweep, which is the only honest default core can offer for a
      // vocabulary it doesn't own.
      color: AccentOrColorHex.optional().describe('Wipe sweep colour — a brand accent-slot key OR a literal (hex).'),
      direction: z.enum(['left', 'right']),
    }),
    label: 'Wipe',
    // No `color` seed: the keys are brand-defined, so core has none to name.
    // The accent control renders "—" for unset, which reads correctly.
  },
  {
    schema: z.object({
      kind: z.literal('gradient-wipe'),
      frames: TransitionFrames,
      direction: z
        .enum(['tl-br', 'tr-bl', 'bl-tr', 'br-tl'])
        .optional()
        .describe('Corner the incoming clip reveals FROM; band sweeps to the opposite corner. Default tl-br.'),
      softness: z
        .number()
        .min(0)
        .max(100)
        .optional()
        .describe('Feathered blend-band width, % of the diagonal. Larger = softer cross-blend. Default 40.'),
    }),
    label: 'Gradient wipe',
    // Both fields are optional in the schema (their renderer has its own
    // fallbacks) but the editor seeds them so the controls aren't blank.
    defaults: { direction: 'tl-br', softness: 40 },
  },
  {
    // Mosaic dissolve: the frame blurs into blocks over a randomised grid,
    // with optional CRT scanlines and glitch slices.
    schema: z.object({
      kind: z.literal('pixelate'),
      frames: TransitionFrames,
      maxBlockSize: z.number().min(8).max(200).optional().describe('Block size in px at peak pixelation. Default 60.'),
      // gridSize² divs are rendered, so the ceiling is a real performance
      // guard rather than taste: 32 is already 1024 elements per frame.
      gridSize: z.number().min(2).max(32).optional().describe('Overlay grid is gridSize × gridSize cells. Default 12.'),
      scanlines: z.boolean().optional().describe('Overlay CRT scanlines at peak. Default on.'),
      glitchArtifacts: z.boolean().optional().describe('Add displaced slices and an RGB split. Default on.'),
      randomness: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe('0 = cells reveal in a clean diagonal sweep, 1 = fully scrambled. Default 0.8.'),
    }),
    label: 'Pixelate',
    defaults: { scanlines: true, glitchArtifacts: true },
  },
  {
    // Grid reveal — the incoming clip appears cell by cell in one of nine
    // orders. (`CheckerboardProps.easing` is deliberately absent: it is a
    // FUNCTION, so it can be neither stored in a config nor picked in the
    // inspector. The presentation's own Easing.out(Easing.cubic) stands.)
    schema: z.object({
      kind: z.literal('checkerboard'),
      frames: TransitionFrames,
      gridSize: z.number().min(2).max(24).optional().describe('Reveal grid is gridSize × gridSize cells. Default 8.'),
      pattern: z
        .enum([
          'sequential', 'random', 'diagonal', 'alternating', 'spiral',
          'rows', 'columns', 'center-out', 'corners-in',
        ])
        .optional()
        .describe('Order the cells reveal in. Default diagonal.'),
      stagger: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe('0 = every cell animates at once, 1 = strictly one after another. Default 0.6.'),
      // PHASE 5 TASK 4 adds `'mask-scale'` — additive, `zod` stays pinned at
      // `3.22.3` exactly. It is OPTION 2 from the design doc's carve-out
      // (§3 row 20 / §7 Stage 4): re-specify `'scale'`'s reveal as MASK
      // geometry (a growing rect per cell, 1 mount) instead of a geometric
      // transform on the media itself (`'scale'`/`'flip'`, `gridSize²`
      // mounts via `ghosts`). Visually SIMILAR — a per-cell growing square —
      // but NOT identical: the media itself never scales, only the window
      // that reveals it grows, so it is a new, differently-named value
      // rather than a redefinition of `'scale'`. See
      // `lib/transitions/presentations/checkerboard.tsx`'s own doc comment
      // for the exact geometry and the migration note.
      squareAnimation: z
        .enum(['fade', 'scale', 'flip', 'mask-scale'])
        .optional()
        .describe('How an individual cell appears. Default fade. `mask-scale` is a cheaper (1-mount) approximation of `scale`: the reveal window grows instead of the media scaling.'),
    }),
    label: 'Checkerboard',
  },
);

// The catalog's schemas as a tuple — mapping over a tuple type preserves both
// its length and each member's precise type, which is what z.discriminatedUnion
// needs (it wants a non-empty tuple, and `.map` erases tuple-ness at runtime).
type SchemasOf<T extends readonly CatalogEntry[]> = { [K in keyof T]: T[K]['schema'] };
type CatalogMembers = SchemasOf<typeof CATALOG>;

/** The CORE zod discriminated union, assembled from the catalog. Every core kind
 *  is validated field by field here, exactly as before Phase 4. */
export const CoreTransitionSchema = z.discriminatedUnion(
  'kind',
  CATALOG.map((e) => e.schema) as unknown as CatalogMembers,
);

/** Every kind core itself declares. Read off the catalog, never restated. */
const CORE_KINDS: ReadonlySet<string> = new Set(CATALOG.map(kindOf));

/** True when `kind` is one of core's own catalog kinds. The one predicate that
 *  separates "core kind, fully validated" from "brand kind, shape-only" — used
 *  by `BrandTransitionSchema` below and by the render-side dev warning in
 *  `lib/render/transition-record.ts`. */
export function isCoreTransitionKind(kind: string): kind is TransitionKind {
  return CORE_KINDS.has(kind);
}

/**
 * A BRAND-authored transition: shape-only validation, because the parameters
 * belong to the brand's own presentation and core cannot enumerate them.
 * `.passthrough()` so those parameters survive the parse and reach the renderer
 * instead of being stripped.
 *
 * The `refine` is load-bearing, not belt-and-braces. Without it a CORE kind that
 * fails its OWN member (`{kind:'slide', frames:20}` — no `direction`) would fall
 * through to this branch, match on shape, and parse; core kinds would silently
 * lose per-field validation, which is the exact guarantee this split is supposed
 * to keep. A core kind must be judged by its core member or not at all.
 *
 * What this deliberately does NOT catch is a TYPO'd core kind (`'disolve'`):
 * it is, structurally, indistinguishable from a brand kind core has never heard
 * of, and refusing it would refuse brand kinds too. That guarantee moves to the
 * dev warning at `getTransitionRecord` — see `lib/render/transition-record.ts`.
 */
export const BrandTransitionSchema = z
  .object({
    kind: z
      .string()
      .refine((k) => !isCoreTransitionKind(k), {
        message: 'is a core transition kind and must satisfy that kind’s own schema',
      })
      .describe('Brand-authored transition kind (resolved through the brand theme’s transition registry).'),
    frames: TransitionFrames,
  })
  .passthrough();

/** What a `transitionIn`/`transitionOut` field accepts: a fully-validated core
 *  transition, OR a shape-checked brand one — either of them carrying the shared
 *  TIMING fields (`alignment`). Core is tried first, so a core kind never
 *  reaches the permissive branch.
 *
 *  The intersection is how ONE declaration of `alignment` reaches BOTH branches.
 *  It survives the strip: the core branch is a plain (non-passthrough) object,
 *  so it drops `alignment` from its own result, and zod's intersection then
 *  merges that result with `{ alignment }` from the timing side. A transition
 *  with no `alignment` merges with `{}` and comes back byte-for-byte what it
 *  was before this field existed. */
export const TransitionSchema = z.intersection(
  z.union([CoreTransitionSchema, BrandTransitionSchema]),
  TransitionTimingSchema,
);

/** A core transition, exactly as the catalog defines it. */
export type CoreTransition = z.infer<typeof CoreTransitionSchema>;

/** A brand transition: a kind, a length, and whatever else the brand's own
 *  presentation reads (passthrough — zod keeps the extra keys at runtime even
 *  though the inferred type cannot name them). */
export type BrandTransition = z.infer<typeof BrandTransitionSchema>;

/** The shared timing fields, as a type. @see TransitionTimingSchema */
export type TransitionTiming = z.infer<typeof TransitionTimingSchema>;

/** A transition, exactly as the schema defines it. Widened in Phase 4 to include
 *  brand kinds — so anything that must NARROW to a core member should say
 *  `CoreTransition`, not `Transition`.
 *
 *  The timing fields are distributed over the union DELIBERATELY rather than
 *  written `(CoreTransition | BrandTransition) & TransitionTiming`: an
 *  intersection whose left side is a union narrows unreliably, and every brand
 *  that writes `t.kind === 'burn' ? t.mask : …` depends on that narrowing. */
type WithTiming<T> = T extends unknown ? T & TransitionTiming : never;
export type Transition = WithTiming<CoreTransition | BrandTransition>;

/** Every transition kind CORE declares — derived, so a `Record<TransitionKind, …>`
 *  elsewhere becomes a compiler-enforced "handle every kind" obligation.
 *  Deliberately read off `CoreTransition`, NOT off `Transition`: the widened
 *  union's `kind` is `string`, and a `Record<string, …>` demands nothing at all,
 *  which would silently retire the exhaustiveness check in
 *  `lib/render/at-cut-transitions.tsx`. */
export type TransitionKind = CoreTransition['kind'];

/** The keys of `T` that are REQUIRED, ignoring the two every member shares. */
type RequiredExtraKeys<T> = {
  [K in Exclude<keyof T, 'kind' | 'frames'>]-?: Record<string, never> extends Pick<T, K> ? never : K;
}[Exclude<keyof T, 'kind' | 'frames'>];

/** The members fully specified by `{ kind, frames }` — every field beyond those
 *  is optional (so `burn` qualifies: its mask/glow/shaping bag is all optional).
 *  `cut` is excluded: it has no `frames` at all, and `{ kind: 'cut', frames }`
 *  is not a valid transition. Used to type config fields that get turned into
 *  `{ kind, frames }` objects, so a kind needing a `direction`/`color`/`from`
 *  can't be named there and then silently produce an invalid transition. */
export type FramesOnlyTransition = Extract<CoreTransition, { frames: number }> extends infer M
  ? M extends CoreTransition
    ? [RequiredExtraKeys<M>] extends [never]
      ? M
      : never
    : never
  : never;

/** The `kind` of any `FramesOnlyTransition`. */
export type FramesOnlyTransitionKind = FramesOnlyTransition['kind'];

// A function DECLARATION, not a `const` arrow: `CORE_KINDS` above is built at
// module-eval time and would hit the temporal dead zone otherwise.
function kindOf(e: CatalogEntry): string {
  return (e.schema.shape.kind as z.ZodLiteral<string>).value;
}
const entryFor = (kind: string): CatalogEntry | undefined => CATALOG.find((e) => kindOf(e) === kind);

/** Every kind with its editor label, in catalog order. */
export const TRANSITION_CATALOG: ReadonlyArray<{ kind: TransitionKind; label: string }> = CATALOG.map((e) => ({
  kind: kindOf(e) as TransitionKind,
  label: e.label,
}));

/** True when the kind's schema declares a `frames` field. Only `cut` doesn't. */
export function kindNeedsFrames(kind: string): boolean {
  const e = entryFor(kind);
  return e ? 'frames' in e.schema.shape : !isCut(kind);
}

/** @deprecated Alias of `ParamChoice`. The transition axis and the effect axis
 *  share ONE vocabulary as of Phase 4 Task 1.1; this name survives only so the
 *  re-export in `lib/editor/app/transitions.ts` keeps resolving. */
export type SubOptionChoice = ParamChoice;

/** @deprecated Alias of `ParamField` — see `./param-field.ts`.
 *
 *  This interface used to be the transition axis' OWN parameter vocabulary
 *  (`enum | number | boolean | accent`, options as `{value,label}[]`), separate
 *  from and incompatible with the effect axis' `ParamField`
 *  (`number | string | boolean`, options as `string[]`). Neither was a superset,
 *  which is why burn's `mask` and `glowColor` had no control on EITHER path.
 *  Task 1.1 merged them; the field formerly called `kind` here is `type` on the
 *  merged descriptor, matching the effect axis' spelling and freeing `kind` for
 *  what it means everywhere else in this file. */
export type SubOption = ParamField;

// Unwraps ZodOptional/ZodDefault so a field's underlying type is inspectable.
function innerType(t: z.ZodTypeAny): z.ZodTypeAny {
  let cur: z.ZodTypeAny = t;
  while (cur instanceof z.ZodOptional || cur instanceof z.ZodDefault) cur = cur._def.innerType;
  return cur;
}

// 'edgeContrast' → 'Edge contrast', 'from' → 'From', 'gradient-wipe' → 'Gradient wipe'.
function humanize(s: string): string {
  const spaced = s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').toLowerCase().trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// Field NAMES whose humanized form would be unreadable — the sibling of
// VALUE_LABELS below, and used the same way: an override, not a second naming
// scheme. Keep it as short as it is; a field that needs an entry here is
// usually a field that could just have a better name.
const PROP_LABELS: Record<string, string> = {
  // humanize() would give 'Rgb shift px'.
  rgbShiftPx: 'RGB shift (px)',
};

// RENAMED FIELDS, as canonical → the older spellings it absorbs. A member keeps
// the old name ONLY so an already-baked literal keeps parsing and keeps
// rendering what it rendered before the rename. The old name is a real schema
// field — the renderer reads it — but it gets NO editor control and no seed,
// because a deprecated spelling shown next to its replacement is the same "two
// answers to one question" fork the rename was closing.
//
// ONE TABLE, deliberately. "Which fields are deprecated" and "which canonical
// field absorbs them" are the same fact; storing them separately in a task
// about single sources of truth would be indefensible.
//
// A NAME LIST, for the same reason `ACCENT_FIELDS` is one: nothing in a zod
// shape can carry the mark through a `.optional()` / `.describe()` clone.
// Keep it as short as it is; every entry is a debt.
const FIELD_ALIASES: Record<string, Record<string, readonly string[]>> = {
  // Phase 4 Task 2.5 — `direction` is canonical, matching `zoom-blur`.
  'zoom-through': { direction: ['from'] },
};

const aliasesOf = (kind: string, prop: string): readonly string[] => FIELD_ALIASES[kind]?.[prop] ?? [];

/** True when `prop` is a deprecated alias on `kind`'s member: parsed and
 *  rendered, but never offered as a control or seeded into a fresh object. */
export function isDeprecatedTransitionField(kind: string, prop: string): boolean {
  return Object.values(FIELD_ALIASES[kind] ?? {}).some((olds) => olds.includes(prop));
}

/** The value an editor should DISPLAY for `prop`: the canonical field when it
 *  is set, else the first deprecated alias that is — which is exactly the
 *  precedence the renderer applies (`t.direction ?? t.from`).
 *
 *  Without this, hiding the alias from `subOptionsFor` would make the inspector
 *  show an EMPTY control for a literal that renders a real value: the editor
 *  describing a reel that does not exist. Same class as the coerced brand kind
 *  (Task 1.2b) and the dropped `alignment` (Task 1.4). */
export function transitionFieldValue(t: DraftTransition, prop: string): unknown {
  if (t[prop] !== undefined) return t[prop];
  for (const old of aliasesOf(String(t.kind), prop)) {
    if (t[old] !== undefined) return t[old];
  }
  return undefined;
}

/** Commits `value` to the CANONICAL field and DROPS the aliases it absorbs —
 *  migrate-on-edit. The literal stops being ambiguous the moment anyone touches
 *  that control, and a stale alias can never outlive a value that disagrees
 *  with it. Untouched fields (including aliases of OTHER props) are preserved:
 *  migration is a consequence of editing the aliased field, not a side effect
 *  of opening the section. */
export function withTransitionField(t: DraftTransition, prop: string, value: unknown): DraftTransition {
  const next: DraftTransition = { ...t, [prop]: value };
  for (const old of aliasesOf(String(t.kind), prop)) delete next[old];
  return next;
}

// Field NAMES whose string value is a BRAND ACCENT-SLOT KEY rather than free
// text (see `AccentKey`), which `resolveAccentColor` turns into a hex at
// render time. The editor gives these a palette picker, filled from the
// brand's own accent slots, and NOTHING ELSE — no free-text escape hatch. Core
// has no catalog field of this pure-accent-only shape today (`color` moved to
// `ACCENT_OR_COLOR_FIELDS` below when it went dual); the set stays as
// infrastructure for the next one, and for a brand's own `EditorMeta`
// declarations, which read `type: 'accent'` directly rather than through this
// set at all — see `lib/editor/app/LayeredInspector.tsx`'s `renderParamControl`.
//
// WHY A NAME LIST AND NOT THE SCHEMA. To zod an accent key, a hex literal and
// burn's `mask` file path are all `z.string()` — nothing in the shape tells
// them apart, so the mark has to live somewhere. It used to live in a
// `WeakSet<z.ZodTypeAny>` fed by a patched `.describe()`, and that failed the
// worst way available: `.min()`, `.nullable()`, `.readonly()`, `.catch()` and
// `.transform()` all clone or wrap the schema without going through
// `.describe()`, so any of them silently dropped the mark and the field got NO
// control at all — no compile error, no test failure, no warning. A NAME cannot
// be lost by a zod clone. See `lib/editor/src/accent-field-mark.test.ts`.
//
// SCOPE: consulted only by `subOptionForField`, which only ever sees fields of
// core's own CATALOG members (`subOptionsFor` returns `[]` for a brand kind), so
// this is core's closed field vocabulary — not a global rule about the word
// "color". The completeness and non-string guards live in that same test file.
export const ACCENT_FIELDS: ReadonlySet<string> = new Set([]);

/** Field NAMES holding a LITERAL colour (a hex string) — sibling of
 *  {@link ACCENT_FIELDS}, same mechanism, same reasons. @see ColorHex */
export const COLOR_FIELDS: ReadonlySet<string> = new Set(['glowColor']);

/**
 * Field NAMES that accept EITHER a brand accent-slot key OR a literal colour
 * (hex) — the DUAL widening (`AccentOrColorHex`) `fade-to-color.color` and
 * `wipe.color` both moved to. Deliberately its own set, disjoint from both
 * {@link ACCENT_FIELDS} and {@link COLOR_FIELDS}, rather than folding into
 * `ACCENT_FIELDS`: the field is literally named `color`, which is the exact
 * name-collision seam Task 1.6 warned about, and `color` is ALSO the name a
 * brand's own `EditorMeta` declarations use for a pure accent-only control
 * (see `lib/editor/src/param-control-unified.test.tsx`'s `tint` example,
 * declared with `type: 'accent'` directly — a different mechanism entirely,
 * untouched by this set). Reusing `type: 'accent'` for both would have made
 * EVERY declared accent field dual whether the brand wanted that or not — a
 * silent behaviour change for a mechanism this set does not own. A distinct
 * type (`'accent-or-color'`) and a distinct set keep the two apart.
 */
export const ACCENT_OR_COLOR_FIELDS: ReadonlySet<string> = new Set(['color']);

/** True when `prop` names a brand accent-slot key (accent-ONLY — no literal
 *  escape hatch). THE one place that decides it — same rule as
 *  {@link isTransitionAlignment} and {@link isCut}: one exported decider, no
 *  site keeping its own copy of the list. */
export function isAccentField(prop: string): boolean {
  return ACCENT_FIELDS.has(prop);
}

/** True when `prop` names a literal-colour field. @see isAccentField */
export function isColorField(prop: string): boolean {
  return COLOR_FIELDS.has(prop);
}

/** True when `prop` names a DUAL colour field (accent key OR literal).
 *  @see isAccentField */
export function isAccentOrColorField(prop: string): boolean {
  return ACCENT_OR_COLOR_FIELDS.has(prop);
}

// Enum VALUES whose humanized form would be unreadable. Keyed by the raw value;
// the corner codes are unique across the vocabulary so a flat map is safe.
const VALUE_LABELS: Record<string, string> = {
  'tl-br': 'Top-left → bottom-right',
  'tr-bl': 'Top-right → bottom-left',
  'bl-tr': 'Bottom-left → top-right',
  'br-tl': 'Bottom-right → top-left',
};

// The schema's own bounds, as NLE parameter metadata. `minValue`/`maxValue` are
// null on an unbounded number, and a `.min()` with no `.max()` yields one of
// each — so each is emitted independently, and neither key appears when the
// schema does not constrain it.
function numericBounds(t: z.ZodNumber): Pick<ParamField, 'min' | 'max' | 'step'> {
  const out: Pick<ParamField, 'min' | 'max' | 'step'> = {};
  const { minValue, maxValue } = t;
  if (typeof minValue === 'number' && Number.isFinite(minValue)) out.min = minValue;
  if (typeof maxValue === 'number' && Number.isFinite(maxValue)) out.max = maxValue;
  const step = numericStep(t, out.min, out.max);
  if (step !== undefined) out.step = step;
  return out;
}

// A `step` to go WITH the bounds. Emitting min/max without one is worse than
// emitting neither: `<input type=number>` defaults `step` to 1, and 1 does not
// divide a 0–1 range into anything — `light-leak.intensity` arrived bounded
// `0..1` with a spinner that could only produce 0 or 1, and a typed `0.5` was
// `:invalid` by step-mismatch. Bounding a field made it LESS usable.
//
// The rule, in order:
//   - `.int()` → 1. The schema says whole numbers; a finer step would offer
//     values it will reject.
//   - a finite span → `10 ** ceil(log10(span) - 2)`, clamped to [0.01, 1]:
//     the coarsest power of ten that still divides the range into between ~10
//     and ~100 stops. `light-leak.intensity` (0–1) → 0.01;
//     `pixelate.gridSize` (2–32) → 1; `dissolve.blurAmount` (0–100) → 1;
//     `pixelate.maxBlockSize` (8–200) → 1 (the clamp; 10 would be too coarse
//     to type past).
//   - unbounded → nothing, so the caller's own default still applies. There is
//     no range to reason from, and inventing a step is not better than the
//     control's own.
function numericStep(t: z.ZodNumber, min?: number, max?: number): number | undefined {
  if (t.isInt) return 1;
  if (min === undefined || max === undefined) return undefined;
  const span = Math.abs(max - min);
  if (!Number.isFinite(span) || span <= 0) return undefined;
  // 10 ** ceil(log10(span) - 2) is the coarsest power of ten leaving ≥ 100
  // stops; the clamp keeps it inside what a human wants to type.
  const raw = 10 ** Math.ceil(Math.log10(span) - 2);
  return Math.min(1, Math.max(0.01, raw));
}

// The schema's declared fallback, when it has one. Read off the OUTERMOST
// ZodDefault rather than the unwrapped inner type, since that is where zod
// stores it. Informational only — nothing writes it into a config.
function declaredDefault(field: z.ZodTypeAny): Pick<ParamField, 'default'> {
  let cur: z.ZodTypeAny = field;
  while (cur instanceof z.ZodOptional) cur = cur._def.innerType;
  if (cur instanceof z.ZodDefault) return { default: cur._def.defaultValue() };
  return {};
}

/**
 * The control ONE schema field maps to, or `null` when the field gets no
 * control. Enums become dropdowns over exactly the schema's options; numbers
 * become numeric fields (carrying the schema's own min/max); booleans become
 * checkboxes; strings become text, or a colour swatch when the schema says the
 * string is a colour. Only genuinely unrenderable shapes — a nested object, a
 * record, an array — still map to `null`.
 *
 * CHANGED IN PHASE 4 (Task 1.1). Strings used to return `null`: the transition
 * axis' vocabulary had no `string` member, so burn's `mask` and `glowColor` —
 * real, authored-in-config properties — had no control anywhere in the editor.
 * The merged `ParamField` has one, and the `z.ZodString` branch below is what
 * makes those two renderable. That branch IS the capability; the tests that
 * cover it are the ones that go red when it is removed.
 *
 * Exported (rather than inlined into `subOptionsFor`) so the mapping can be
 * pinned by test for a field SHAPE no catalog kind carries yet — the boolean
 * case has no kind behind it until the pixelate/checkerboard/scanline kinds
 * land, and a rule that only becomes testable after something depends on it is
 * a rule that gets discovered broken.
 */
export function subOptionForField(prop: string, field: z.ZodTypeAny): ParamField | null {
  const t = innerType(field);
  const label = PROP_LABELS[prop] ?? humanize(prop);
  const def = declaredDefault(field);
  // NAME, not shape: an accent key IS a string, and so is burn's `mask`, and so
  // is its `glowColor` — the shape cannot tell them apart, so the declaration
  // does (see `ACCENT_FIELDS` / `COLOR_FIELDS` / `ACCENT_OR_COLOR_FIELDS`
  // above). Deliberately BEFORE the `instanceof` ladder and independent of
  // `innerType`: `.transform()` produces a `ZodEffects` that `innerType`
  // cannot see through at all, and the whole point of this task is that no
  // chain can cost a field its control.
  if (isAccentOrColorField(prop)) return { prop, label, type: 'accent-or-color', ...def };
  if (isAccentField(prop)) return { prop, label, type: 'accent', ...def };
  if (isColorField(prop)) return { prop, label, type: 'color', ...def };
  if (t instanceof z.ZodEnum) {
    const values = (t as z.ZodEnum<[string, ...string[]]>).options;
    return {
      prop,
      label,
      type: 'enum',
      options: values.map((value) => ({ value, label: VALUE_LABELS[value] ?? humanize(value) })),
      ...def,
    };
  }
  if (t instanceof z.ZodNumber) return { prop, label, type: 'number', ...numericBounds(t), ...def };
  if (t instanceof z.ZodBoolean) return { prop, label, type: 'boolean', ...def };
  if (t instanceof z.ZodString) return { prop, label, type: 'string', ...def };
  return null;
}

/** The contextual controls a kind needs beyond `frames`, read STRUCTURALLY off
 *  that kind's own zod shape — so a field added to a member automatically gets
 *  a control and can never be described by a stale hand-written switch.
 *
 *  `kind` and `frames` are excluded (the picker renders those itself); every
 *  other field goes through `subOptionForField`. */
export function subOptionsFor(kind: string): ParamField[] {
  const e = entryFor(kind);
  if (!e) return [];
  const out: ParamField[] = [];
  for (const [prop, field] of Object.entries(e.schema.shape)) {
    if (prop === 'kind' || prop === 'frames') continue;
    if (isDeprecatedTransitionField(kind, prop)) continue;
    const opt = subOptionForField(prop, field as z.ZodTypeAny);
    if (opt) out.push(opt);
  }
  return out;
}

/** Default frame count for any frame-bearing kind (0.5s @ 30fps). */
export const DEFAULT_TRANSITION_FRAMES = 15;

/** A transition mid-edit. An editor writes one field at a time, so between
 *  keystrokes the object is legitimately not yet a valid `Transition` (a kind
 *  just switched to `slide` has no `direction` for an instant). UI code works
 *  in this permissive shape; `TransitionSchema` decides whether the settled
 *  result is real. */
export type DraftTransition = { kind: string; frames?: number; [key: string]: unknown };

/**
 * The value `defaultTransition` seeds ONE required field with, or `undefined`
 * when the field type has no sensible seed.
 *
 * Numbers seed at the schema's own lower bound rather than a flat 0: a required
 * `z.number().min(1)` (a cell size, a step count — the shape most numeric
 * transition params take) would otherwise get a default its own schema
 * REJECTS, and this is exactly what the picker hands the user on a kind
 * switch. Unbounded numbers still seed 0. Enums take their first option;
 * booleans seed `false` (off is the neutral state for a look toggle).
 *
 * Exported alongside `subOptionForField`, and for the same reason: the
 * min-aware and boolean rules have no catalog kind behind them yet.
 */
export function defaultValueForField(field: z.ZodTypeAny): unknown {
  const inner = innerType(field);
  if (inner instanceof z.ZodEnum) return (inner as z.ZodEnum<[string, ...string[]]>).options[0];
  if (inner instanceof z.ZodNumber) {
    const min = (inner as z.ZodNumber).minValue;
    return Number.isFinite(min) ? min : 0;
  }
  if (inner instanceof z.ZodBoolean) return false;
  return undefined;
}

/**
 * Builds a valid transition object for `kind`: `frames` (when the kind takes
 * it, `opts.frames` overriding the default so a caller can carry the current
 * length across a kind switch), plus a value for every REQUIRED field — the
 * catalog's explicit default where it has one, else the schema enum's first
 * option. Optional fields are only seeded when the catalog names them.
 *
 * An unknown kind still yields `{ kind, frames }` rather than throwing, so a
 * legacy persisted value round-trips through the picker instead of vanishing.
 *
 * WHICH OPTIONAL FIELDS A CATALOG ENTRY SHOULD NAME IN `defaults`: only those
 * whose CONTROL cannot represent "unset" honestly. A blank number field and a
 * dropdown showing "—" both read correctly as "the presentation's own default
 * applies". A checkbox has no such state — unchecked means `false` — so an
 * optional boolean that the presentation defaults to `true` (pixelate's
 * `scanlines`, light-leak's `flareArtifacts`) MUST be seeded `true`, or the
 * inspector shows "off" for something that is plainly on in the frame.
 */
export function defaultTransition(
  kind: string,
  opts?: { frames?: number; alignment?: unknown; enabled?: unknown },
): DraftTransition {
  const e = entryFor(kind);
  const frames = opts?.frames ?? DEFAULT_TRANSITION_FRAMES;
  // TIMING SURVIVES A KIND SWITCH. `frames` always did — the picker threads the
  // current length through so switching Dissolve→Fade doesn't silently snap
  // back to 15. `alignment` is a sibling of `frames`, not a per-kind look
  // parameter, so it must survive the same way: a boundary authored as
  // `{kind:'dissolve', frames:12, alignment:'end'}` used to lose its alignment
  // the instant anyone touched the Kind dropdown, with no control and no
  // warning to show where it went. Only a RECOGNISED value is carried, so a
  // stale or hand-typo'd one is dropped here rather than propagated into a
  // fresh object.
  //
  // `enabled` survives for the same reason and with the same asymmetry as
  // `alignment`: only a DISABLED node carries the field (absent means enabled),
  // so only `false` is worth threading — copying `true` would bake the default
  // into every literal the picker touches.
  const timing = (t: DraftTransition): DraftTransition => {
    if (isTransitionAlignment(opts?.alignment)) t.alignment = opts.alignment;
    if (opts?.enabled === false) t.enabled = false;
    return t;
  };
  if (!e) return timing({ kind, frames });

  const t: DraftTransition = { kind };
  if ('frames' in e.schema.shape) t.frames = frames;
  timing(t);

  for (const [prop, field] of Object.entries(e.schema.shape)) {
    if (prop === 'kind' || prop === 'frames') continue;
    // A deprecated alias is never seeded into a FRESH object — it exists only
    // for literals that already carry it.
    if (isDeprecatedTransitionField(kind, prop)) continue;
    if (e.defaults && prop in e.defaults) {
      t[prop] = e.defaults[prop];
      continue;
    }
    // Optional fields the catalog didn't name stay absent — their renderer has
    // its own fallback, and an unset control is honest about that.
    if ((field as z.ZodTypeAny).isOptional()) continue;
    const seed = defaultValueForField(field as z.ZodTypeAny);
    if (seed !== undefined) t[prop] = seed;
  }
  return t;
}

/** `Partial<T>`, except an EMPTY `T` yields `never` rather than `{}`. In a
 *  union that distinction is everything: `{}` means "any non-null value", so a
 *  single empty constituent makes the whole union accept anything (including a
 *  typo'd field). `never` simply drops out of the union instead. */
type NonEmptyPartial<T> = [keyof T] extends [never] ? never : Partial<T>;

/** The overrides `withTransitionOverrides` accepts for a transition of type `T`,
 *  DISTRIBUTED across the union so each member contributes its own fields.
 *
 *  The distribution is the whole point: `keyof` a union is only its COMMON
 *  keys, so a non-distributive `Partial<Omit<Transition, 'kind'>>` would
 *  collapse to `{}` and accept literally any object. `kind` is excluded — an
 *  override may not change the discriminant — and `cut` (nothing to override
 *  once `kind` is gone) contributes `never`, so it can't re-open the union.
 *
 *  DISTRIBUTES OVER `CoreTransition`, NOT `Transition`, and that is the whole
 *  guarantee this helper offers over a hand-spread. `BrandTransitionSchema` is
 *  `.passthrough()`, so `BrandTransition` infers WITH a string index signature;
 *  `NonEmptyPartial<Omit<…, 'kind'>>` of an index-signature type accepts any key
 *  at all, and a single such constituent makes the whole union accept anything —
 *  the exact `{}` failure the comment above describes, arriving by a different
 *  door. Catching a typo'd key is the only thing `withTransitionOverrides` does
 *  that `{ ...t, … }` doesn't, so losing it empties the helper.
 *
 *  The consequence, deliberately: a BRAND transition's own params cannot be
 *  overridden through this helper (core cannot name them, so it cannot check
 *  them). Overriding a brand kind's params is the brand's own business, in the
 *  brand's own types. */
export type TransitionOverrides<T extends Transition = CoreTransition> = T extends CoreTransition
  ? NonEmptyPartial<Omit<T, 'kind'>>
  : never;

/** The overrides accepted for the argument type `T`. When `T` contains no CORE
 *  member — a caller passing a literal `undefined`, or a `BrandTransition` —
 *  there is no member to read fields off, so fall back to the whole core
 *  vocabulary rather than `never`: passing `undefined` is supported and must not
 *  be un-callable. */
type OverridesFor<T> = [Extract<T, CoreTransition>] extends [never]
  ? TransitionOverrides<CoreTransition>
  : TransitionOverrides<Extract<T, CoreTransition>>;

/**
 * Returns a copy of `t` with `overrides` applied — the type-safe replacement
 * for spreading a transition object by hand.
 *
 * Why this exists: `{ ...maybeTransition, mask: … }` on a `Transition |
 * undefined` widens `kind` to OPTIONAL (`kind?: 'cut' | 'dissolve' | …`),
 * because spreading a possibly-undefined value makes every property optional.
 * The result is then no longer assignable to `VideoItem['transitionOut']` now
 * that the field carries `TransitionSchema` instead of `z.record`. This helper
 * preserves the discriminant and the precise member type, and passes
 * `undefined` straight through — the "no transition on this edge" case.
 *
 * Typical use (a brand injecting its own look onto a derived transition):
 *
 * ```ts
 * items.map((it) =>
 *   it.transitionOut?.kind === 'burn'
 *     ? { ...it, transitionOut: withTransitionOverrides(it.transitionOut, {
 *         mask: 'brand/burn-mask.png',
 *         glowColor: theme.colors.paper,
 *       }) }
 *     : it,
 * );
 * ```
 */
export function withTransitionOverrides<T extends Transition | undefined>(
  t: T,
  overrides: OverridesFor<T>,
): T {
  if (t === undefined) return undefined as T;
  // The cast is contained here: the public signature is what callers see, and
  // it guarantees `kind` survives (overrides can't carry one).
  return { ...t, ...overrides } as T;
}
