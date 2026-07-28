// Phase 4 Task 1.6 — the accent/colour mark must survive ARBITRARY zod chaining.
//
// THE DEFECT THIS PINS. The mark used to live in a `WeakSet<z.ZodTypeAny>`
// populated by a patched `.describe()`, and `innerType` unwrapped only
// `ZodOptional`/`ZodDefault`. So every chain method that CLONES or WRAPS the
// schema without going through `.describe()` — `.min()`, `.nullable()`,
// `.readonly()`, `.catch()`, `.transform()` — silently dropped the mark, and the
// field then got NO editor control at all: not the wrong control, not an error,
// nothing. `wipe.color` survived only because it happened to be written
// `AccentKey.optional().describe(…)`, the one order the WeakSet tolerated.
//
// The fix is declarative: `ACCENT_FIELDS` / `COLOR_FIELDS` beside `PROP_LABELS`,
// keyed by field NAME, consulted through `isAccentField` / `isColorField`. A
// name cannot be lost by a zod clone, so the chain is irrelevant by construction.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ACCENT_FIELDS,
  AccentKey,
  COLOR_FIELDS,
  ColorHex,
  CoreTransitionSchema,
  TRANSITION_CATALOG,
  isAccentField,
  isColorField,
  subOptionForField,
  subOptionsFor,
} from '../../reel-config-base/transition-schema';

// The one accent-valued field core's catalog declares today, and the one
// literal-colour field. Written out rather than derived, so the completeness
// test below has something independent to compare the derived set against.
const EXPECTED_ACCENT = ['wipe.color'];
const EXPECTED_COLOR = ['burn.glowColor'];

/** Every `kind.prop` in the catalog whose control is `type`. */
function catalogFieldsOfType(type: string): string[] {
  const out: string[] = [];
  for (const { kind } of TRANSITION_CATALOG) {
    for (const f of subOptionsFor(kind)) if (f.type === type) out.push(`${kind}.${f.prop}`);
  }
  return out;
}

describe('the accent mark survives arbitrary zod chaining', () => {
  // THE REQUIRED PIN. Verified red against the WeakSet implementation:
  // `AccentKey.min(1)` clones into a fresh ZodString that was never in the set,
  // so this returned `{type:'string'}` (and, before Task 1.1 gave strings a
  // control at all, `null`).
  it('survives .min(1) — the exact chain the WeakSet dropped', () => {
    expect(subOptionForField('color', AccentKey.min(1))?.type).toBe('accent');
  });

  // The defect is a CATEGORY, not one method: anything that clones or wraps.
  it('survives .nullable(), .readonly(), .catch(), .transform() and combinations', () => {
    expect(subOptionForField('color', AccentKey.nullable())?.type).toBe('accent');
    expect(subOptionForField('color', AccentKey.readonly())?.type).toBe('accent');
    expect(subOptionForField('color', AccentKey.catch('brand'))?.type).toBe('accent');
    expect(subOptionForField('color', AccentKey.transform((s) => s))?.type).toBe('accent');
    expect(subOptionForField('color', AccentKey.min(1).max(40).optional().describe('x'))?.type).toBe('accent');
    expect(subOptionForField('color', AccentKey.describe('x').min(1).nullable().optional())?.type).toBe('accent');
  });

  // Same guarantee on the colour axis — `ColorHex` was marked by the same
  // machinery and lost the mark for the same reasons.
  it('holds for a literal-colour field too', () => {
    expect(subOptionForField('glowColor', ColorHex.min(1))?.type).toBe('color');
    expect(subOptionForField('glowColor', ColorHex.nullable())?.type).toBe('color');
    expect(subOptionForField('glowColor', ColorHex.transform((s) => s))?.type).toBe('color');
  });

  // The mark is now on the NAME, so it does not even need the shared constant —
  // which is the point: a field cannot lose it by being written differently.
  it('does not depend on deriving from the shared constant', () => {
    expect(subOptionForField('color', z.string().min(1).optional())?.type).toBe('accent');
    expect(subOptionForField('glowColor', z.string())?.type).toBe('color');
  });

  // …and an unlisted name is a plain string, whatever it is derived from. This
  // is the other half of the contract: the set is the whole vocabulary.
  it('leaves an unlisted field a plain string field', () => {
    expect(subOptionForField('mask', z.string().optional())?.type).toBe('string');
    expect(subOptionForField('mask', AccentKey.optional())?.type).toBe('string');
  });
});

describe('ACCENT_FIELDS / COLOR_FIELDS completeness', () => {
  // The declarative set's own failure mode: silently omitting a field the old
  // dynamic mark used to catch. This is the diff, asserted.
  it('marks exactly the fields the WeakSet marked, no more and no fewer', () => {
    expect(catalogFieldsOfType('accent')).toEqual(EXPECTED_ACCENT);
    expect(catalogFieldsOfType('color')).toEqual(EXPECTED_COLOR);
  });

  // A name in the set that no catalog field uses is dead weight that will
  // outlive the field it was written for — and, worse, will silently capture
  // the next field that happens to take that name.
  it('names no field the catalog does not declare', () => {
    const all = new Set(TRANSITION_CATALOG.flatMap(({ kind }) => subOptionsFor(kind).map((f) => f.prop)));
    for (const prop of [...ACCENT_FIELDS, ...COLOR_FIELDS]) expect(all, prop).toContain(prop);
  });

  // The lookup is by name and therefore type-blind (deliberately — that is what
  // makes it survive `.transform()`, which `innerType` cannot see through). So
  // the catalog must never name a NON-string field `color` or `glowColor`: it
  // would get a colour control over a number. Nothing in the type system says
  // so; this test does.
  it('never lets a listed name land on a non-string catalog field', () => {
    const listed = new Set([...ACCENT_FIELDS, ...COLOR_FIELDS]);
    for (const member of CoreTransitionSchema.options) {
      for (const [prop, field] of Object.entries(member.shape as Record<string, z.ZodTypeAny>)) {
        if (!listed.has(prop)) continue;
        let cur: z.ZodTypeAny = field;
        while ('innerType' in cur._def) cur = (cur._def as { innerType: z.ZodTypeAny }).innerType;
        expect(cur, `${(member.shape.kind as z.ZodLiteral<string>).value}.${prop}`).toBeInstanceOf(z.ZodString);
      }
    }
  });

  it('exposes ONE decider per axis, and the sets agree with it', () => {
    for (const prop of ACCENT_FIELDS) expect(isAccentField(prop)).toBe(true);
    for (const prop of COLOR_FIELDS) expect(isColorField(prop)).toBe(true);
    expect(isAccentField('mask')).toBe(false);
    expect(isColorField('mask')).toBe(false);
    // Disjoint: a field cannot be both a palette key and a hex literal.
    for (const prop of ACCENT_FIELDS) expect(isColorField(prop)).toBe(false);
  });
});
