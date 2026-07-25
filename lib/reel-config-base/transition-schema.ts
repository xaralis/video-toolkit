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
// 30 fps assumption baked into copy text ("30 frames = 1 sec").
import { z } from 'zod';

export const TransitionFrames = z
  .number()
  .min(1)
  .max(60)
  .describe('Transition length in FRAMES (30fps reel → 30 frames = 1 sec). Rendered at the cut using handle frames from both sides.');

const Direction4 = z.enum(['left', 'right', 'up', 'down']);

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
  { schema: z.object({ kind: z.literal('fade-coal'), frames: TransitionFrames }), label: 'Fade to black' },
  { schema: z.object({ kind: z.literal('glitch'), frames: TransitionFrames }), label: 'Glitch' },
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
  { schema: z.object({ kind: z.literal('slide'), frames: TransitionFrames, direction: Direction4 }), label: 'Slide' },
  { schema: z.object({ kind: z.literal('flip'), frames: TransitionFrames, direction: Direction4 }), label: 'Flip' },
  { schema: z.object({ kind: z.literal('whip-pan'), frames: TransitionFrames, direction: Direction4 }), label: 'Whip pan' },
  {
    schema: z.object({ kind: z.literal('zoom-through'), frames: TransitionFrames, from: z.enum(['in', 'out']) }),
    label: 'Zoom',
  },
  { schema: z.object({ kind: z.literal('clock-wipe'), frames: TransitionFrames }), label: 'Clock wipe' },
  { schema: z.object({ kind: z.literal('iris'), frames: TransitionFrames }), label: 'Iris' },
  {
    schema: z.object({
      kind: z.literal('wipe'),
      frames: TransitionFrames,
      color: z.enum(['lime', 'teal', 'coal']).describe('Wipe sweep colour.'),
      direction: z.enum(['left', 'right']),
    }),
    label: 'Wipe',
    // Teal, not the enum's first option (lime): the sweep reads as a wipe
    // rather than a flash-frame against most footage.
    defaults: { color: 'teal' },
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

const kindOf = (e: CatalogEntry) => (e.schema.shape.kind as z.ZodLiteral<string>).value;
const entryFor = (kind: string): CatalogEntry | undefined => CATALOG.find((e) => kindOf(e) === kind);

/** Every kind with its editor label, in catalog order. */
export const TRANSITION_CATALOG: ReadonlyArray<{ kind: string; label: string }> = CATALOG.map((e) => ({
  kind: kindOf(e),
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

/** Describes one contextual control a transition kind needs beyond `frames`. */
export interface SubOption {
  prop: string;
  label: string;
  kind: 'enum' | 'number';
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

// Enum VALUES whose humanized form would be unreadable. Keyed by the raw value;
// the corner codes are unique across the vocabulary so a flat map is safe.
const VALUE_LABELS: Record<string, string> = {
  'tl-br': 'Top-left → bottom-right',
  'tr-bl': 'Top-right → bottom-left',
  'bl-tr': 'Bottom-left → top-right',
  'br-tl': 'Bottom-right → top-left',
};

/** The contextual controls a kind needs beyond `frames`, read STRUCTURALLY off
 *  that kind's own zod shape — so a field added to a member automatically gets
 *  a control and can never be described by a stale hand-written switch.
 *
 *  `kind` and `frames` are excluded (the picker renders those itself). Enums
 *  become dropdowns over exactly the schema's options; numbers become numeric
 *  fields. Every other type — notably burn's `mask`/`glowColor` strings — is
 *  skipped: there is no free-text sub-option control, and those two are
 *  brand-supplied rather than hand-tuned. */
export function subOptionsFor(kind: string): SubOption[] {
  const e = entryFor(kind);
  if (!e) return [];
  const out: SubOption[] = [];
  for (const [prop, field] of Object.entries(e.schema.shape)) {
    if (prop === 'kind' || prop === 'frames') continue;
    const t = innerType(field as z.ZodTypeAny);
    if (t instanceof z.ZodEnum) {
      const values = (t as z.ZodEnum<[string, ...string[]]>).options;
      out.push({
        prop,
        label: humanize(prop),
        kind: 'enum',
        options: values.map((value) => ({ value, label: VALUE_LABELS[value] ?? humanize(value) })),
      });
    } else if (t instanceof z.ZodNumber) {
      out.push({ prop, label: humanize(prop), kind: 'number' });
    }
  }
  return out;
}

/** Default frame count for any frame-bearing kind (0.5s @ 30fps). */
export const DEFAULT_TRANSITION_FRAMES = 15;

/** A transition mid-edit. An editor writes one field at a time, so between
 *  keystrokes the object is legitimately not yet a valid `Transition` (a kind
 *  just switched to `wipe` has no `color` for an instant). UI code works in
 *  this permissive shape; `TransitionSchema` decides whether the settled
 *  result is real. */
export type DraftTransition = { kind: string; frames?: number; [key: string]: unknown };

/**
 * Builds a valid transition object for `kind`: `frames` (when the kind takes
 * it, `opts.frames` overriding the default so a caller can carry the current
 * length across a kind switch), plus a value for every REQUIRED field — the
 * catalog's explicit default where it has one, else the schema enum's first
 * option. Optional fields are only seeded when the catalog names them.
 *
 * An unknown kind still yields `{ kind, frames }` rather than throwing, so a
 * legacy persisted value round-trips through the picker instead of vanishing.
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
    const inner = innerType(field as z.ZodTypeAny);
    if (inner instanceof z.ZodEnum) t[prop] = (inner as z.ZodEnum<[string, ...string[]]>).options[0];
    else if (inner instanceof z.ZodNumber) t[prop] = 0;
  }
  return t;
}
