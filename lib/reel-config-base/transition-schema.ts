// THE transition catalog — the single source of truth for what a transition is.
//
// A transition used to be defined four times over: this zod union, the editor's
// hand-written `TRANSITION_KINDS` + `subOptionsFor` + `defaultTransition`, the
// `presentationFor` switch, and `transition-record.ts`'s structural type. They
// drifted (the editor's list ran ahead of the union for a whole phase). This
// file now owns the vocabulary the way `lib/theming/placement.ts` owns
// PLACEMENTS: ONE ordered catalog, from which everything else is derived —
//
//   TransitionSchema     = the zod union, built from the catalog's members
//   Transition           = z.infer of that union (see ./base-types)
//   TRANSITION_KINDS     = catalog kinds + labels (lib/editor/app/transitions)
//   subOptionsFor(kind)  = read STRUCTURALLY off the kind's own zod shape
//   defaultTransition()  = catalog defaults, checked against the schema by test
//   presentationFor      = a Record keyed by TransitionKind, so the compiler
//                          demands a mapping for every kind (lib/render)
//
// ADDING A KIND: append one entry below. The union, the editor dropdown, its
// sub-option controls and its defaults all follow; the only other edit the
// compiler will demand is the render mapping in lib/render/at-cut-transitions.
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

export const TransitionFrames = z
  .number()
  .min(1)
  .max(60)
  .describe('Transition length in FRAMES (30fps reel → 30 frames = 1 sec). Rendered at the cut using handle frames from both sides.');

const Direction4 = z.enum(['left', 'right', 'up', 'down']);

// Schemas recognised as "an accent-slot key" by `subOptionForField`, keyed by
// membership rather than reference identity to `AccentKey` itself. Identity
// alone is not enough: zod's `.describe()` clones into a NEW instance
// (`new This({...this._def, description})` — see node_modules/zod/lib/types.js),
// so `AccentKey.describe('x')` is no longer `=== AccentKey`. `.optional()`/
// `.default()` do NOT reclone (they wrap the original as `innerType`), which is
// why the identity check used to look like it worked — it only survived
// because every existing catalog field happened to call `.optional()` before
// `.describe()`, never after. `markAsAccentKey` closes that gap by patching
// the marked instance's own `describe` so every clone it produces (in any
// chain, any order, any depth) gets added to the set too.
const ACCENT_SCHEMAS = new WeakSet<z.ZodTypeAny>();

function markAsAccentKey<T extends z.ZodTypeAny>(schema: T): T {
  ACCENT_SCHEMAS.add(schema);
  const originalDescribe = schema.describe.bind(schema);
  // Cast through `unknown`: the patched method's real signature (returning
  // whatever `originalDescribe` returns, marked) is narrower than the base
  // `describe(description: string): this` zod declares, which is all the
  // rest of this module ever calls it through.
  (schema as z.ZodTypeAny).describe = ((description: string) =>
    markAsAccentKey(originalDescribe(description))) as unknown as z.ZodTypeAny['describe'];
  return schema;
}

/**
 * A BRAND accent-slot key — the brand-neutral way for a core schema to name a
 * colour. To zod it is just a string, because the vocabulary belongs to the
 * brand: `lib/theming/palette.ts` `AccentSlot` declares the keys, and
 * `resolveAccentColor` turns one into a hex at render time. Core cannot
 * enumerate the options (this field used to be a fixed three-value enum over
 * one brand's palette, sitting in the shared schema), so it validates the
 * shape and leaves the values to the brand.
 *
 * This is a SINGLE SHARED INSTANCE on purpose: `subOptionForField` recognises
 * an accent field by SET MEMBERSHIP (see `ACCENT_SCHEMAS` above), since
 * nothing in a plain `z.string()` shape distinguishes "a palette key" from
 * burn's `mask` file path. Always derive a field from this constant —
 * `.optional()`, `.describe()`, and any chain/order of the two are all safe;
 * never re-declare an equivalent `z.string()`.
 */
export const AccentKey = markAsAccentKey(
  z.string().describe('Brand accent-slot key (see the brand theme’s accentSlots); resolved to a hex at render time.'),
);

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
  { schema: z.object({ kind: z.literal('cut') }), label: 'Cut' },
  { schema: z.object({ kind: z.literal('dissolve'), frames: TransitionFrames }), label: 'Dissolve' },
  { schema: z.object({ kind: z.literal('fade'), frames: TransitionFrames }), label: 'Fade' },
  // NAME NOTE: `fade-coal` is a leftover from one brand's colour vocabulary
  // ("coal" was its near-black). Behaviourally it is brand-neutral — it is a
  // plain fade, and what shows through is whatever `theme.background` is — and
  // its editor label already says "Fade to black". Renaming the KIND would
  // change every baked `Root.tsx` literal that uses it, so it stands; if it is
  // ever renamed, that is a render-affecting brand migration, not a cleanup.
  { schema: z.object({ kind: z.literal('fade-coal'), frames: TransitionFrames }), label: 'Fade to black' },
  { schema: z.object({ kind: z.literal('glitch'), frames: TransitionFrames }), label: 'Glitch' },
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
      // burn-edge shaping. Absent mask → plain opacity reveal. The two string
      // fields get no editor control (no free-text sub-option kind exists — see
      // subOptionsFor); the two numbers do.
      mask: z.string().optional().describe('Cloud-texture mask image (staticFile path).'),
      glowColor: z.string().optional().describe('Hot burn-edge glow colour (hex).'),
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
  { schema: z.object({ kind: z.literal('whip-pan'), frames: TransitionFrames, direction: Direction4 }), label: 'Whip pan' },
  {
    schema: z.object({ kind: z.literal('zoom-through'), frames: TransitionFrames, from: z.enum(['in', 'out']) }),
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
      // The sweep's colour, as a BRAND accent-slot key rather than a fixed
      // enum — this field used to be a fixed three-value enum naming one
      // brand's palette colours, sitting in the shared schema and inherited by
      // every other brand. Optional: unset means the presentation's own
      // neutral sweep, which is the only honest default core can offer for a
      // vocabulary it doesn't own.
      color: AccentKey.optional().describe('Wipe sweep colour, as a brand accent-slot key.'),
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
      squareAnimation: z
        .enum(['fade', 'scale', 'flip'])
        .optional()
        .describe('How an individual cell appears. Default fade.'),
    }),
    label: 'Checkerboard',
  },
);

// The catalog's schemas as a tuple — mapping over a tuple type preserves both
// its length and each member's precise type, which is what z.discriminatedUnion
// needs (it wants a non-empty tuple, and `.map` erases tuple-ness at runtime).
type SchemasOf<T extends readonly CatalogEntry[]> = { [K in keyof T]: T[K]['schema'] };
type CatalogMembers = SchemasOf<typeof CATALOG>;

/** The zod discriminated union, assembled from the catalog. */
export const TransitionSchema = z.discriminatedUnion('kind', CATALOG.map((e) => e.schema) as unknown as CatalogMembers);

/** A transition, exactly as the schema defines it. */
export type Transition = z.infer<typeof TransitionSchema>;

/** Every transition kind in the vocabulary — derived, so a `Record<TransitionKind, …>`
 *  elsewhere becomes a compiler-enforced "handle every kind" obligation. */
export type TransitionKind = Transition['kind'];

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
export type FramesOnlyTransition = Extract<Transition, { frames: number }> extends infer M
  ? M extends Transition
    ? [RequiredExtraKeys<M>] extends [never]
      ? M
      : never
    : never
  : never;

/** The `kind` of any `FramesOnlyTransition`. */
export type FramesOnlyTransitionKind = FramesOnlyTransition['kind'];

const kindOf = (e: CatalogEntry) => (e.schema.shape.kind as z.ZodLiteral<string>).value;
const entryFor = (kind: string): CatalogEntry | undefined => CATALOG.find((e) => kindOf(e) === kind);

/** Every kind with its editor label, in catalog order. */
export const TRANSITION_CATALOG: ReadonlyArray<{ kind: TransitionKind; label: string }> = CATALOG.map((e) => ({
  kind: kindOf(e) as TransitionKind,
  label: e.label,
}));

/** True when the kind's schema declares a `frames` field. Only `cut` doesn't. */
export function kindNeedsFrames(kind: string): boolean {
  const e = entryFor(kind);
  return e ? 'frames' in e.schema.shape : kind !== 'cut';
}

/** A single enum option (value + human label) for a `subOptionsFor` field. */
export interface SubOptionChoice {
  value: string;
  label: string;
}

/** Describes one contextual control a transition kind needs beyond `frames`.
 *  `enum` → dropdown (see `options`), `number` → numeric field, `boolean` →
 *  checkbox, `accent` → dropdown over the BRAND's accent slots. Anything else
 *  in a member's shape gets no control (see `subOptionsFor`).
 *
 *  `accent` is the one kind that carries no `options`: core doesn't know the
 *  brand's palette, so the editor fills the choices from the accentSlots it
 *  was handed. */
export interface SubOption {
  prop: string;
  label: string;
  kind: 'enum' | 'number' | 'boolean' | 'accent';
  options?: SubOptionChoice[];
}

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

// Enum VALUES whose humanized form would be unreadable. Keyed by the raw value;
// the corner codes are unique across the vocabulary so a flat map is safe.
const VALUE_LABELS: Record<string, string> = {
  'tl-br': 'Top-left → bottom-right',
  'tr-bl': 'Top-right → bottom-left',
  'bl-tr': 'Bottom-left → top-right',
  'br-tl': 'Bottom-right → top-left',
};

/**
 * The control ONE schema field maps to, or `null` when the field gets no
 * control. Enums become dropdowns over exactly the schema's options; numbers
 * become numeric fields; booleans become checkboxes. Every other type —
 * notably burn's `mask`/`glowColor` strings — is skipped: there is no free-text
 * sub-option control, and those two are brand-supplied rather than hand-tuned.
 *
 * Exported (rather than inlined into `subOptionsFor`) so the mapping can be
 * pinned by test for a field SHAPE no catalog kind carries yet — the boolean
 * case has no kind behind it until the pixelate/checkerboard/scanline kinds
 * land, and a rule that only becomes testable after something depends on it is
 * a rule that gets discovered broken.
 */
export function subOptionForField(prop: string, field: z.ZodTypeAny): SubOption | null {
  const t = innerType(field);
  const label = PROP_LABELS[prop] ?? humanize(prop);
  // Set membership, not shape: an accent key IS a string, and so is burn's
  // `mask`. Only a schema derived from the shared `AccentKey` (see
  // `ACCENT_SCHEMAS`/`markAsAccentKey` above) means "pick one of the brand's slots".
  if (ACCENT_SCHEMAS.has(t)) return { prop, label, kind: 'accent' };
  if (t instanceof z.ZodEnum) {
    const values = (t as z.ZodEnum<[string, ...string[]]>).options;
    return {
      prop,
      label,
      kind: 'enum',
      options: values.map((value) => ({ value, label: VALUE_LABELS[value] ?? humanize(value) })),
    };
  }
  if (t instanceof z.ZodNumber) return { prop, label, kind: 'number' };
  if (t instanceof z.ZodBoolean) return { prop, label, kind: 'boolean' };
  return null;
}

/** The contextual controls a kind needs beyond `frames`, read STRUCTURALLY off
 *  that kind's own zod shape — so a field added to a member automatically gets
 *  a control and can never be described by a stale hand-written switch.
 *
 *  `kind` and `frames` are excluded (the picker renders those itself); every
 *  other field goes through `subOptionForField`. */
export function subOptionsFor(kind: string): SubOption[] {
  const e = entryFor(kind);
  if (!e) return [];
  const out: SubOption[] = [];
  for (const [prop, field] of Object.entries(e.schema.shape)) {
    if (prop === 'kind' || prop === 'frames') continue;
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
  if (inner instanceof z.ZodNumber) return (inner as z.ZodNumber).minValue ?? 0;
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
export function defaultTransition(kind: string, opts?: { frames?: number }): DraftTransition {
  const e = entryFor(kind);
  const frames = opts?.frames ?? DEFAULT_TRANSITION_FRAMES;
  if (!e) return { kind, frames };

  const t: DraftTransition = { kind };
  if ('frames' in e.schema.shape) t.frames = frames;

  for (const [prop, field] of Object.entries(e.schema.shape)) {
    if (prop === 'kind' || prop === 'frames') continue;
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
 *  once `kind` is gone) contributes `never`, so it can't re-open the union. */
export type TransitionOverrides<T extends Transition = Transition> = T extends Transition
  ? NonEmptyPartial<Omit<T, 'kind'>>
  : never;

/** The overrides accepted for the argument type `T`. When `T` is `undefined`
 *  alone (a caller passing a literal `undefined`) there is no member to read
 *  fields off, so fall back to the whole vocabulary rather than `never` —
 *  passing `undefined` is supported, and must not be un-callable. */
type OverridesFor<T> = [Extract<T, Transition>] extends [never]
  ? TransitionOverrides<Transition>
  : TransitionOverrides<Extract<T, Transition>>;

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
