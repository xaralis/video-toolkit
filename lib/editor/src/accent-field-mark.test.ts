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
//
// UPDATE (Phase 4, the `color` widening). `fade-to-color.color` and
// `wipe.color` moved from pure `AccentKey` to the DUAL `AccentOrColorHex`
// (accent-slot key OR a literal hex) — see `docs/superpowers/phase4-migrations.md`,
// the `fade-coal` entry, and the diagnosis report at
// `.superpowers/sdd/2026-07-26-phase4-node-contract/fade-to-color-edge-fix-report.md`.
// That moved `color` out of `ACCENT_FIELDS` (now empty of catalog members — it
// stays as infrastructure, see its own doc comment) into a THIRD, disjoint set,
// `ACCENT_OR_COLOR_FIELDS`, with its own `type: 'accent-or-color'`. It is
// deliberately a third set and not a widened `ACCENT_FIELDS`: a brand's own
// `EditorMeta` declarations reuse `type: 'accent'` directly for pure
// accent-only controls (see `lib/editor/src/param-control-unified.test.tsx`'s
// `tint` example), and widening `accent` itself would have made every one of
// those dual too — a silent behaviour change for a mechanism this file's mark
// does not own. All three of Task 1.6's original guards (chain-survival,
// completeness, non-string-field) are re-asserted below for the new set too.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ACCENT_FIELDS,
  ACCENT_OR_COLOR_FIELDS,
  AccentKey,
  AccentOrColorHex,
  COLOR_FIELDS,
  ColorHex,
  CoreTransitionSchema,
  TRANSITION_CATALOG,
  isAccentField,
  isAccentOrColorField,
  isColorField,
  subOptionForField,
  subOptionsFor,
} from '../../reel-config-base/transition-schema';

// The accent-valued fields core's catalog declares today (none — see the
// `ACCENT_FIELDS` doc comment), the DUAL fields, and the one literal-colour
// field. Written out rather than derived, so the completeness test below has
// something independent to compare the derived set against.
//
// `fade-to-color.color` joined in Phase 4 Task 2.3 as a pure accent field,
// then widened to DUAL in the `color` literal-widening task — the second live
// exercise of Task 1.6's known trade-off (a field gets its control because it
// is CALLED `color`, not because its schema says so), this time resolved by
// giving the dual form its OWN name-keyed set rather than folding it into
// `ACCENT_FIELDS`.
const EXPECTED_ACCENT: string[] = [];
const EXPECTED_COLOR = ['burn.glowColor'];
const EXPECTED_ACCENT_OR_COLOR = ['fade-to-color.color', 'wipe.color'];

/** Every `kind.prop` in the catalog whose control is `type`. */
function catalogFieldsOfType(type: string): string[] {
  const out: string[] = [];
  for (const { kind } of TRANSITION_CATALOG) {
    for (const f of subOptionsFor(kind)) if (f.type === type) out.push(`${kind}.${f.prop}`);
  }
  return out;
}

describe('the accent-or-color mark survives arbitrary zod chaining', () => {
  // THE REQUIRED PIN, on the DUAL field this time. Verified red before the
  // widening: `AccentOrColorHex.min(1)` (then just `AccentKey.min(1)`) clones
  // into a fresh ZodString, and the WeakSet-era mark would have dropped it the
  // same way it dropped every chain below.
  it('survives .min(1) — the exact chain the WeakSet dropped', () => {
    expect(subOptionForField('color', AccentOrColorHex.min(1))?.type).toBe('accent-or-color');
  });

  // The defect is a CATEGORY, not one method: anything that clones or wraps.
  it('survives .nullable(), .readonly(), .catch(), .transform() and combinations', () => {
    expect(subOptionForField('color', AccentOrColorHex.nullable())?.type).toBe('accent-or-color');
    expect(subOptionForField('color', AccentOrColorHex.readonly())?.type).toBe('accent-or-color');
    expect(subOptionForField('color', AccentOrColorHex.catch('brand'))?.type).toBe('accent-or-color');
    expect(subOptionForField('color', AccentOrColorHex.transform((s) => s))?.type).toBe('accent-or-color');
    expect(subOptionForField('color', AccentOrColorHex.min(1).max(40).optional().describe('x'))?.type).toBe('accent-or-color');
    expect(subOptionForField('color', AccentOrColorHex.describe('x').min(1).nullable().optional())?.type).toBe('accent-or-color');
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
  // Plain `AccentKey` still marks `color` as dual too: the SCHEMA passed in has
  // never been what decides the control (that is the whole point of a
  // name-keyed mark), so an old-style `AccentKey`-typed `color` field gets
  // exactly the same dual control as `AccentOrColorHex`.
  it('does not depend on deriving from the shared constant', () => {
    expect(subOptionForField('color', z.string().min(1).optional())?.type).toBe('accent-or-color');
    expect(subOptionForField('color', AccentKey.optional())?.type).toBe('accent-or-color');
    expect(subOptionForField('glowColor', z.string())?.type).toBe('color');
  });

  // …and an unlisted name is a plain string, whatever it is derived from. This
  // is the other half of the contract: the set is the whole vocabulary.
  it('leaves an unlisted field a plain string field', () => {
    expect(subOptionForField('mask', z.string().optional())?.type).toBe('string');
    expect(subOptionForField('mask', AccentOrColorHex.optional())?.type).toBe('string');
  });
});

describe('ACCENT_FIELDS / COLOR_FIELDS / ACCENT_OR_COLOR_FIELDS completeness', () => {
  // The declarative set's own failure mode: silently omitting a field the old
  // dynamic mark used to catch. This is the diff, asserted.
  it('marks exactly the fields the WeakSet marked, no more and no fewer', () => {
    expect(catalogFieldsOfType('accent')).toEqual(EXPECTED_ACCENT);
    expect(catalogFieldsOfType('color')).toEqual(EXPECTED_COLOR);
    expect(catalogFieldsOfType('accent-or-color')).toEqual(EXPECTED_ACCENT_OR_COLOR);
  });

  // A name in a set that no catalog field uses is dead weight that will
  // outlive the field it was written for — and, worse, will silently capture
  // the next field that happens to take that name.
  it('names no field the catalog does not declare', () => {
    const all = new Set(TRANSITION_CATALOG.flatMap(({ kind }) => subOptionsFor(kind).map((f) => f.prop)));
    for (const prop of [...ACCENT_FIELDS, ...COLOR_FIELDS, ...ACCENT_OR_COLOR_FIELDS]) expect(all, prop).toContain(prop);
  });

  // The lookup is by name and therefore type-blind (deliberately — that is what
  // makes it survive `.transform()`, which `innerType` cannot see through). So
  // the catalog must never name a NON-string field `color` or `glowColor`: it
  // would get a colour control over a number. Nothing in the type system says
  // so; this test does.
  it('never lets a listed name land on a non-string catalog field', () => {
    const listed = new Set([...ACCENT_FIELDS, ...COLOR_FIELDS, ...ACCENT_OR_COLOR_FIELDS]);
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
    for (const prop of ACCENT_OR_COLOR_FIELDS) expect(isAccentOrColorField(prop)).toBe(true);
    expect(isAccentField('mask')).toBe(false);
    expect(isColorField('mask')).toBe(false);
    expect(isAccentOrColorField('mask')).toBe(false);
    // Disjoint, pairwise: a field cannot be a palette-only key, a
    // literal-only hex, AND a dual field all at once.
    for (const prop of ACCENT_FIELDS) {
      expect(isColorField(prop)).toBe(false);
      expect(isAccentOrColorField(prop)).toBe(false);
    }
    for (const prop of COLOR_FIELDS) {
      expect(isAccentField(prop)).toBe(false);
      expect(isAccentOrColorField(prop)).toBe(false);
    }
    for (const prop of ACCENT_OR_COLOR_FIELDS) {
      expect(isAccentField(prop)).toBe(false);
      expect(isColorField(prop)).toBe(false);
    }
  });

  // `color` specifically: the field the widening touched, and the exact seam
  // Task 1.6's own report flagged as the next collision risk ("If a future
  // core kind adds a non-accent field literally named `color`, it silently
  // gets a palette picker"). It did — deliberately — and this is the answer:
  // a DIFFERENT type (`accent-or-color`), not a reinterpretation of `accent`.
  it('`color` is DUAL, not pure accent — the widened field, named explicitly', () => {
    expect(isAccentField('color')).toBe(false);
    expect(isAccentOrColorField('color')).toBe(true);
  });
});
