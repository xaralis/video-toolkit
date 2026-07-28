import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  TRANSITION_KINDS,
  DURATION_PRESETS,
  kindNeedsFrames,
  framesToSeconds,
  presetForFrames,
  subOptionsFor,
  defaultTransition,
} from './transitions';
import {
  CoreTransitionSchema,
  TransitionSchema,
  AccentKey,
  subOptionForField,
  defaultValueForField,
  ColorHex,
} from '@video-toolkit/lib/reel-config-base/transition-schema';
import { paramChoices, type ParamOption } from '@video-toolkit/lib/reel-config-base/param-field';

// The values of an `options` list, whichever of the two declaration styles it
// uses (bare strings or `{value,label}`). Since Phase 4 Task 1.1 both axes share
// ONE descriptor, and `paramChoices` is the normaliser.
const optValues = (o?: readonly ParamOption[]) => paramChoices(o)?.map((c) => c.value);

// The CORE union's own members, read straight off the schema — the yardstick
// every derived list below is measured against. Read off `CoreTransitionSchema`
// rather than `TransitionSchema`: since Phase 4 the latter is a two-branch
// `z.union`, whose `.options` are the two BRANCHES, not the catalog's kinds.
const SCHEMA_MEMBERS = CoreTransitionSchema.options as ReadonlyArray<z.ZodObject<z.ZodRawShape>>;
const SCHEMA_KINDS = SCHEMA_MEMBERS.map((m) => (m.shape.kind as z.ZodLiteral<string>).value);
const shapeFor = (kind: string) =>
  SCHEMA_MEMBERS.find((m) => (m.shape.kind as z.ZodLiteral<string>).value === kind)!.shape;

// Unwraps ZodOptional/ZodDefault so a prop's underlying type can be inspected.
function inner(t: z.ZodTypeAny): z.ZodTypeAny {
  let cur = t;
  while (cur instanceof z.ZodOptional || cur instanceof z.ZodDefault) cur = cur._def.innerType;
  return cur;
}

// These are the anti-drift tests: they assert the editor catalog is DERIVED
// from TransitionSchema rather than hand-maintained beside it. A kind added to
// the schema alone (or a sub-option renamed on one side only) fails here.
describe('catalog is derived from TransitionSchema', () => {
  it('lists exactly the schema’s kinds, in the schema’s order', () => {
    expect(TRANSITION_KINDS.map((k) => k.kind)).toEqual(SCHEMA_KINDS);
  });

  it('gives every schema kind a non-empty label', () => {
    for (const { kind, label } of TRANSITION_KINDS) {
      expect(typeof label, kind).toBe('string');
      expect(label.length, kind).toBeGreaterThan(0);
    }
  });

  it('needs frames exactly when the kind’s schema has a frames field', () => {
    for (const kind of SCHEMA_KINDS) {
      expect(kindNeedsFrames(kind), kind).toBe('frames' in shapeFor(kind));
    }
  });

  it('builds a default for every kind that the schema accepts', () => {
    for (const kind of SCHEMA_KINDS) {
      const parsed = TransitionSchema.safeParse(defaultTransition(kind));
      const why = parsed.success ? '' : JSON.stringify(parsed.error.issues);
      expect(parsed.success, `${kind}: ${why}`).toBe(true);
    }
  });

  it('offers only sub-options the kind’s schema actually declares', () => {
    for (const kind of SCHEMA_KINDS) {
      const shape = shapeFor(kind);
      for (const opt of subOptionsFor(kind)) {
        expect(Object.keys(shape), `${kind}.${opt.prop}`).toContain(opt.prop);
        expect(opt.prop, kind).not.toBe('frames');
      }
    }
  });

  it('mirrors each enum sub-option’s values from the schema enum', () => {
    for (const kind of SCHEMA_KINDS) {
      for (const opt of subOptionsFor(kind)) {
        if (opt.type !== 'enum') continue;
        const field = inner(shapeFor(kind)[opt.prop]);
        expect(field, `${kind}.${opt.prop}`).toBeInstanceOf(z.ZodEnum);
        expect(optValues(opt.options)).toEqual((field as z.ZodEnum<[string, ...string[]]>).options);
      }
    }
  });

  it('surfaces every required non-frames field of a kind as a sub-option', () => {
    for (const kind of SCHEMA_KINDS) {
      const props = subOptionsFor(kind).map((o) => o.prop);
      for (const [prop, field] of Object.entries(shapeFor(kind))) {
        if (prop === 'kind' || prop === 'frames') continue;
        if (field.isOptional()) continue;
        expect(props, `${kind}.${prop}`).toContain(prop);
      }
    }
  });
});

describe('TRANSITION_KINDS', () => {
  it('lists all 21 kinds with human-readable labels', () => {
    // 20 until Phase 4 Task 2.3 added `fade-to-color` — the parameterised
    // successor to `fade-coal`, whose deprecated label is pinned below.
    expect(TRANSITION_KINDS).toHaveLength(21);
    const byKind = Object.fromEntries(TRANSITION_KINDS.map((k) => [k.kind, k.label]));
    expect(byKind['cut']).toBe('Cut');
    expect(byKind['dissolve']).toBe('Dissolve');
    // Deprecated in Task 2.3: it never dipped to black, so the label stopped
    // promising it and points at the kind that can.
    expect(byKind['fade-coal']).toBe('Fade to black (deprecated — use Fade to colour)');
    expect(byKind['fade-to-color']).toBe('Fade to colour');
    expect(byKind['glitch']).toBe('Glitch');
    expect(byKind['whip-pan']).toBe('Whip pan');
    expect(byKind['zoom-through']).toBe('Zoom');
    expect(byKind['wipe']).toBe('Wipe');
    expect(byKind['gradient-wipe']).toBe('Gradient wipe');
    expect(byKind['fade']).toBe('Fade');
    expect(byKind['slide']).toBe('Slide');
    expect(byKind['flip']).toBe('Flip');
    expect(byKind['clock-wipe']).toBe('Clock wipe');
    expect(byKind['iris']).toBe('Iris');
    // The six that used to exist only as presentation files.
    expect(byKind['rgb-split']).toBe('RGB split');
    expect(byKind['scanline-glitch']).toBe('Scanline glitch');
    expect(byKind['light-leak']).toBe('Light leak');
    expect(byKind['zoom-blur']).toBe('Zoom blur');
    expect(byKind['pixelate']).toBe('Pixelate');
    expect(byKind['checkerboard']).toBe('Checkerboard');
  });
});

// The condition this task fixed: six presentations shipped in lib/transitions,
// were exported from the barrel and were documented in the registry, yet no
// transition KIND named them — so nothing in the editor or in any config could
// ever reach them. The registry is the toolkit's catalogue-of-record, so it is
// also the right place to pin the invariant: a documented transition that no
// kind names is, by definition, unreachable.
describe('no transition in the registry is unreachable', () => {
  // Resolved via dirname(fileURLToPath(...)) rather than `new URL(…,
  // import.meta.url)` — Vite rewrites that exact pattern into an http asset URL.
  const registryPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../_internal/toolkit-registry.json');
  const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as {
    transitions: Record<string, { kind?: string }>;
  };
  const KINDS = new Set(TRANSITION_KINDS.map((k) => k.kind));

  it('gives every registry transition a `kind` that the catalog offers', () => {
    for (const [name, entry] of Object.entries(registry.transitions)) {
      if (name.startsWith('_')) continue; // `_note` — prose for a human reader, not an entry
      expect(entry.kind, `registry.transitions.${name} has no kind`).toBeTruthy();
      expect([...KINDS], `registry.transitions.${name}.kind`).toContain(entry.kind);
    }
  });

  it('documents the six formerly-orphan presentations against their new kinds', () => {
    const byName = registry.transitions;
    expect(byName.rgbSplit.kind).toBe('rgb-split');
    expect(byName.zoomBlur.kind).toBe('zoom-blur');
    expect(byName.lightLeak.kind).toBe('light-leak');
    expect(byName.pixelate.kind).toBe('pixelate');
    expect(byName.checkerboard.kind).toBe('checkerboard');
    expect(byName.scanlineGlitch.kind).toBe('scanline-glitch');
  });

  // The registry's option lists are what a person reads before reaching for a
  // transition; three of them named props their presentation never accepted
  // (scanlineGlitch's `scanlineHeight`/`glitchIntensity` among them). Pin them
  // to the schema, which is now derived from the presentations' real signatures.
  //
  // Originally pinned six hardcoded kinds (2026-07 Task 2.4) — the ones that
  // task itself touched. That left every OTHER registry entry unchecked, which
  // is exactly how `zoomThrough.options` kept naming the deprecated `from`
  // for a full task cycle after Task 2.5 renamed the field to `direction`:
  // Task 2.4 edited the entry, Task 2.5 changed the fact, and no gate read
  // both. Widened (Workstream 2 final-review fix wave) to iterate every
  // registry entry that names a core catalog kind — i.e. the whole map, since
  // `it('gives every registry transition a `kind` that the catalog offers')`
  // above already guarantees that's all of them — so a future task that edits
  // a schema without walking back to the registry goes red here instead of
  // shipping a stale `options` list silently.
  it('lists exactly the tunable options each registry kind’s schema declares', () => {
    for (const [name, entry] of Object.entries(registry.transitions)) {
      if (name.startsWith('_')) continue; // `_note` — prose for a human reader, not an entry
      const { kind, options } = entry as { kind?: string; options?: string[] };
      if (!kind || !options) continue;
      expect(options, name).toEqual(subOptionsFor(kind).map((o) => o.prop));
    }
  });
});

describe('kindNeedsFrames', () => {
  it('is false for cut', () => {
    expect(kindNeedsFrames('cut')).toBe(false);
  });

  it('is true for every other kind', () => {
    for (const { kind } of TRANSITION_KINDS) {
      if (kind === 'cut') continue;
      expect(kindNeedsFrames(kind)).toBe(true);
    }
  });
});

describe('DURATION_PRESETS', () => {
  it('defines short/medium/long with the expected frame counts', () => {
    const byKey = Object.fromEntries(DURATION_PRESETS.map((p) => [p.key, p.frames]));
    expect(byKey.short).toBe(8);
    expect(byKey.medium).toBe(15);
    expect(byKey.long).toBe(30);
  });

  it('gives each preset a human-readable label', () => {
    for (const preset of DURATION_PRESETS) {
      expect(typeof preset.label).toBe('string');
      expect(preset.label.length).toBeGreaterThan(0);
    }
  });
});

describe('framesToSeconds', () => {
  it('converts 15 frames at 30fps to 0.5s', () => {
    expect(framesToSeconds(15, 30)).toBe(0.5);
  });

  it('converts 30 frames at 30fps to 1s', () => {
    expect(framesToSeconds(30, 30)).toBe(1);
  });

  it('converts 8 frames at 30fps to ~0.267s', () => {
    expect(framesToSeconds(8, 30)).toBeCloseTo(0.2667, 3);
  });
});

describe('presetForFrames', () => {
  it('matches medium at 15 frames', () => {
    expect(presetForFrames(15)).toBe('medium');
  });

  it('matches short at 8 frames', () => {
    expect(presetForFrames(8)).toBe('short');
  });

  it('matches long at 30 frames', () => {
    expect(presetForFrames(30)).toBe('long');
  });

  // Rule: presetForFrames only recognizes an EXACT match against a preset's
  // frame count. Anything else (including an in-between custom value like 12)
  // is "custom" and reports null, so the UI can show a distinct
  // "custom" state rather than falsely highlighting the nearest preset.
  it('reports null for a custom in-between frame count', () => {
    expect(presetForFrames(12)).toBeNull();
  });

  it('reports null for a frame count outside all presets', () => {
    expect(presetForFrames(60)).toBeNull();
    expect(presetForFrames(1)).toBeNull();
  });
});

describe('subOptionsFor', () => {
  it('returns no sub-options for cut, dissolve, and fade-coal', () => {
    // `fade-coal` deliberately keeps NO colour control of its own: it is the
    // deprecated alias, and a control there would invite authors to configure
    // a kind they should be migrating off. `fade-to-color` carries the knob.
    expect(subOptionsFor('cut')).toEqual([]);
    expect(subOptionsFor('dissolve')).toEqual([]);
    expect(subOptionsFor('fade-coal')).toEqual([]);
  });

  // Task 2.4: four presentation props that existed only as glitch.tsx's own
  // destructured defaults, unreachable from any config until this task.
  it('returns four knobs for glitch: intensity, slices, and two toggles', () => {
    const opts = subOptionsFor('glitch');
    const byProp = Object.fromEntries(opts.map((o) => [o.prop, o]));
    expect(Object.keys(byProp).sort()).toEqual(['intensity', 'rgbShift', 'scanLines', 'slices']);
    expect(byProp.intensity.type).toBe('number');
    expect(byProp.intensity.min).toBe(0);
    expect(byProp.intensity.max).toBe(1);
    expect(byProp.slices.type).toBe('number');
    expect(byProp.slices.min).toBe(2);
    expect(byProp.slices.max).toBe(32);
    expect(byProp.rgbShift.type).toBe('boolean');
    expect(byProp.scanLines.type).toBe('boolean');
  });

  it('returns a direction enum with 4 options, plus blurAmount, for whip-pan', () => {
    const opts = subOptionsFor('whip-pan');
    const byProp = Object.fromEntries(opts.map((o) => [o.prop, o]));
    expect(Object.keys(byProp).sort()).toEqual(['blurAmount', 'direction']);
    expect(byProp.direction.type).toBe('enum');
    expect(byProp.direction.options).toHaveLength(4);
    expect(optValues(byProp.direction.options)!.sort()).toEqual(['down', 'left', 'right', 'up']);
    expect(byProp.blurAmount.type).toBe('number');
    expect(byProp.blurAmount.min).toBe(0);
    expect(byProp.blurAmount.max).toBe(100);
  });

  // `direction`, not `from` (Task 2.5): one name per concept, and the
  // deprecated alias is deliberately NOT offered as a second control.
  it('returns a direction enum with in/out, plus zoomAmount, for zoom-through', () => {
    const opts = subOptionsFor('zoom-through');
    const byProp = Object.fromEntries(opts.map((o) => [o.prop, o]));
    expect(Object.keys(byProp).sort()).toEqual(['direction', 'zoomAmount']);
    expect(optValues(byProp.direction.options)!.sort()).toEqual(['in', 'out']);
    expect(byProp.zoomAmount.type).toBe('number');
    expect(byProp.zoomAmount.min).toBe(1);
    expect(byProp.zoomAmount.max).toBe(3);
  });

  // wipe's colour is a BRAND accent-slot key, not a fixed palette: core no
  // longer names one brand's colours, so the control is an 'accent' picker
  // whose options come from the brand's own accentSlots at edit time.
  it('returns an accent colour picker + a direction enum for wipe', () => {
    const opts = subOptionsFor('wipe');
    const byProp = Object.fromEntries(opts.map((o) => [o.prop, o]));
    expect(byProp.color.type).toBe('accent');
    expect(byProp.color.options).toBeUndefined();
    expect(byProp.direction.type).toBe('enum');
    expect(optValues(byProp.direction.options)!.sort()).toEqual(['left', 'right']);
  });

  it('returns direction enum + softness number for gradient-wipe', () => {
    const opts = subOptionsFor('gradient-wipe');
    const byProp = Object.fromEntries(opts.map((o) => [o.prop, o]));
    expect(byProp.direction.type).toBe('enum');
    expect(optValues(byProp.direction.options)!.sort()).toEqual([
      'bl-tr',
      'br-tl',
      'tl-br',
      'tr-bl',
    ]);
    expect(byProp.softness.type).toBe('number');
    expect(byProp.softness.options).toBeUndefined();
  });

  it('returns a direction enum with 4 options for slide and flip', () => {
    for (const kind of ['slide', 'flip']) {
      const opts = subOptionsFor(kind);
      expect(opts).toHaveLength(1);
      expect(opts[0].prop).toBe('direction');
      expect(opts[0].type).toBe('enum');
      expect(opts[0].options).toHaveLength(4);
      expect(optValues(opts[0].options)!.sort()).toEqual(['down', 'left', 'right', 'up']);
    }
  });

  it('returns no sub-options for fade, clock-wipe, and iris', () => {
    expect(subOptionsFor('fade')).toEqual([]);
    expect(subOptionsFor('clock-wipe')).toEqual([]);
    expect(subOptionsFor('iris')).toEqual([]);
  });

  // THE CAPABILITY Phase 4 Task 1.1 ADDS, pinned. This test used to assert the
  // OPPOSITE — that burn surfaced only its two numeric knobs and that `mask`
  // and `glowColor` stayed uncontrolled, "because there is no free-text
  // sub-option control to render them with". There wasn't, and that was the
  // defect: two real, authored-in-config properties that the inspector simply
  // could not show, because the transition axis' parameter vocabulary had no
  // `string` while the effect axis' had no `accent`, and neither was a superset
  // of the other. One merged descriptor closes it. The assertion inverted
  // deliberately; the ZodString branch of `subOptionForField` is what carries it.
  it('surfaces ALL FOUR of burn’s fields, strings included', () => {
    expect(subOptionsFor('burn').map((o) => o.prop)).toEqual(['mask', 'glowColor', 'edgeContrast', 'glowBand']);
    expect(subOptionsFor('burn').map((o) => o.type)).toEqual(['string', 'color', 'number', 'number']);
  });

  // `glowColor` is a colour and `mask` is a path. Both are `z.string()` to zod,
  // so the difference is DECLARED — `COLOR_FIELDS` in transition-schema.ts,
  // beside `PROP_LABELS` — rather than inferred from the shape.
  it('distinguishes burn’s colour from its file path by declaration', () => {
    const byProp = Object.fromEntries(subOptionsFor('burn').map((o) => [o.prop, o]));
    expect(byProp.glowColor.type).toBe('color');
    expect(byProp.mask.type).toBe('string');
    // Same shape to zod: both parse a plain string, and the marking changed no
    // validation. If it had, every baked brand literal carrying a mask/glow
    // would be at risk.
    expect(ColorHex.safeParse('#ff8800').success).toBe(true);
    expect(ColorHex.safeParse('not-a-hex').success).toBe(true);
    expect(ColorHex.safeParse(42).success).toBe(false);
  });

  // Every string field is reachable, not just burn's: this is a rule about the
  // descriptor, not a special case for one kind.
  it('gives every kind’s string field a control, and never a number one', () => {
    for (const kind of SCHEMA_KINDS) {
      const shape = shapeFor(kind);
      for (const opt of subOptionsFor(kind)) {
        const f = inner(shape[opt.prop]);
        if (f instanceof z.ZodString) expect(opt.type, `${kind}.${opt.prop}`).toMatch(/^(string|color|accent)$/);
      }
    }
  });

  // The six wired in by Task 4. Each list is exactly the params its
  // presentation destructures — pinned so a param can't be invented here nor
  // quietly dropped from the presentation.
  it('returns direction enum + displacement number for rgb-split', () => {
    const byProp = Object.fromEntries(subOptionsFor('rgb-split').map((o) => [o.prop, o]));
    expect(Object.keys(byProp)).toEqual(['direction', 'displacement']);
    expect(optValues(byProp.direction.options)).toEqual(['horizontal', 'vertical', 'diagonal']);
    expect(byProp.displacement.type).toBe('number');
  });

  it('returns direction/blurAmount/scaleAmount/origin for zoom-blur', () => {
    const opts = subOptionsFor('zoom-blur');
    expect(opts.map((o) => o.prop)).toEqual(['direction', 'blurAmount', 'scaleAmount', 'origin']);
    expect(opts.map((o) => o.type)).toEqual(['enum', 'number', 'number', 'enum']);
    const byProp = Object.fromEntries(opts.map((o) => [o.prop, o]));
    expect(optValues(byProp.direction.options)).toEqual(['in', 'out']);
    expect(optValues(byProp.origin.options)).toEqual(['center', 'top', 'bottom', 'left', 'right']);
  });

  it('returns temperature/direction/intensity and a BOOLEAN flareArtifacts for light-leak', () => {
    const opts = subOptionsFor('light-leak');
    expect(opts.map((o) => o.prop)).toEqual(['temperature', 'direction', 'intensity', 'flareArtifacts']);
    expect(opts.map((o) => o.type)).toEqual(['enum', 'enum', 'number', 'boolean']);
    const byProp = Object.fromEntries(opts.map((o) => [o.prop, o]));
    expect(optValues(byProp.temperature.options)).toEqual(['warm', 'cool', 'rainbow']);
    expect(byProp.flareArtifacts.options).toBeUndefined();
  });

  it('returns two booleans among pixelate’s five knobs', () => {
    const opts = subOptionsFor('pixelate');
    expect(opts.map((o) => o.prop)).toEqual([
      'maxBlockSize', 'gridSize', 'scanlines', 'glitchArtifacts', 'randomness',
    ]);
    expect(opts.map((o) => o.type)).toEqual(['number', 'number', 'boolean', 'boolean', 'number']);
  });

  it('returns checkerboard’s nine reveal patterns and its square animation', () => {
    const opts = subOptionsFor('checkerboard');
    expect(opts.map((o) => o.prop)).toEqual(['gridSize', 'pattern', 'stagger', 'squareAnimation']);
    const byProp = Object.fromEntries(opts.map((o) => [o.prop, o]));
    expect(optValues(byProp.pattern.options)).toEqual([
      'sequential', 'random', 'diagonal', 'alternating', 'spiral',
      'rows', 'columns', 'center-out', 'corners-in',
    ]);
    expect(optValues(byProp.squareAnimation.options)).toEqual(['fade', 'scale', 'flip']);
  });

  it('returns scanline-glitch’s single shift knob under a readable label', () => {
    const opts = subOptionsFor('scanline-glitch');
    expect(opts).toHaveLength(1);
    expect(opts[0].prop).toBe('rgbShiftPx');
    expect(opts[0].type).toBe('number');
    // humanize() alone would render this 'Rgb shift px'.
    expect(opts[0].label).toBe('RGB shift (px)');
  });
});

// The per-field readers behind subOptionsFor/defaultTransition. Tested directly
// because their boolean and lower-bound rules have no catalog kind behind them
// yet — the transition kinds that need them (pixelate, checkerboard,
// scanlineGlitch) land next, and a rule nothing exercises is a rule that gets
// discovered broken.
describe('subOptionForField', () => {
  it('maps a boolean field to a checkbox sub-option with no options list', () => {
    expect(subOptionForField('invert', z.boolean())).toEqual({
      prop: 'invert',
      label: 'Invert',
      type: 'boolean',
    });
  });

  it('maps an OPTIONAL boolean to a checkbox too', () => {
    expect(subOptionForField('softEdges', z.boolean().optional())?.type).toBe('boolean');
    expect(subOptionForField('softEdges', z.boolean().optional())?.label).toBe('Soft edges');
  });

  it('maps numbers to numeric fields and enums to dropdowns', () => {
    expect(subOptionForField('cellSize', z.number().min(1))?.type).toBe('number');
    const e = subOptionForField('from', z.enum(['in', 'out']));
    expect(e?.type).toBe('enum');
    expect(optValues(e?.options)).toEqual(['in', 'out']);
  });

  // Inverted by Task 1.1 for the string half — see the burn tests above. What
  // still gets NO control is what genuinely cannot be edited as a single field.
  it('gives a plain string a TEXT control, and unrenderable shapes none at all', () => {
    expect(subOptionForField('mask', z.string())).toEqual({ prop: 'mask', label: 'Mask', type: 'string' });
    expect(subOptionForField('bag', z.record(z.string(), z.unknown()))).toBeNull();
    expect(subOptionForField('stops', z.array(z.number()))).toBeNull();
    expect(subOptionForField('nested', z.object({ a: z.number() }))).toBeNull();
  });

  // The NLE metadata on the merged descriptor is populated from the schema
  // itself, so a bounded param arrives at the editor bounded. Emitted
  // independently: a `.min()` with no `.max()` must not invent a max.
  it('carries the schema\u2019s own bounds, step and default onto the descriptor', () => {
    // A bounded field gets a `step` DERIVED from its range. min/max alone was
    // worse than neither: `<input type=number>` defaults step to 1, so a 0\u20131
    // field could only spin 0 \u2194 1 and a typed `0.5` was a step mismatch.
    expect(subOptionForField('intensity', z.number().min(0).max(1))).toEqual({
      prop: 'intensity',
      label: 'Intensity',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.01,
    });
    // A range needs BOTH ends to be reasoned from, and `.int()` says the
    // schema wants whole numbers whatever the range.
    expect(subOptionForField('cells', z.number().min(2))).toEqual({ prop: 'cells', label: 'Cells', type: 'number', min: 2 });
    expect(subOptionForField('free', z.number())).toEqual({ prop: 'free', label: 'Free', type: 'number' });
    expect(subOptionForField('count', z.number().int().min(0).max(1))).toMatchObject({ step: 1 });
    // The clamp at the wide end: a 0\u20131000 span would give 10 without it.
    expect(subOptionForField('px', z.number().min(0).max(1000))).toMatchObject({ step: 1 });
    expect(subOptionForField('softness', z.number().default(12))?.default).toBe(12);
    expect(subOptionForField('softness', z.number().default(12).optional())?.default).toBe(12);
    expect(subOptionForField('softness', z.number())?.default).toBeUndefined();
  });

  // CHANGED IN PHASE 4 (Task 1.6). A colour field is now declared by NAME —
  // `COLOR_FIELDS` in transition-schema.ts, beside `PROP_LABELS` — not by
  // deriving from the shared `ColorHex` instance. The instance survives as
  // documentation of intent (and its validation is unchanged); what it no
  // longer does is carry a WeakSet mark that `.min()`/`.nullable()`/
  // `.transform()` could silently strip. Chain-independence is pinned in
  // lib/editor/src/accent-field-mark.test.ts.
  it('recognises a ColorHex field by its declared name, in any chain order', () => {
    expect(subOptionForField('glowColor', ColorHex.optional())?.type).toBe('color');
    expect(subOptionForField('glowColor', ColorHex.describe('x').optional())?.type).toBe('color');
    expect(subOptionForField('glowColor', ColorHex.optional().describe('x'))?.type).toBe('color');
    // An UNDECLARED name is text, not a colour — however it was written.
    expect(subOptionForField('glow', ColorHex.optional())?.type).toBe('string');
    expect(subOptionForField('glow', z.string().optional())?.type).toBe('string');
  });

  it('maps an accent field to an accent picker, options left to the brand', () => {
    expect(subOptionForField('color', AccentKey)).toEqual({
      prop: 'color',
      label: 'Color',
      type: 'accent',
    });
    expect(subOptionForField('color', AccentKey.optional())?.type).toBe('accent');
    // burn's `mask` is also a string and must stay a plain TEXT field — that is
    // the distinction the declaration carries. Since Task 1.1 it is "which
    // control", not "control or nothing", which makes it worth restating.
    expect(subOptionForField('mask', z.string().optional())?.type).toBe('string');
  });

  // Regression, kept: zod's `.describe()` clones into a NEW instance
  // (`new This({...this._def, description})`), so the identity/WeakSet marks
  // this replaced only survived `.optional()` BEFORE `.describe()` — the order
  // every existing catalog field happens to use. The reverse order used to
  // silently produce no control at all (not even an error).
  it('still maps to an accent picker when .describe() comes before .optional()', () => {
    const field = AccentKey.describe('A differently-worded description').optional();
    expect(subOptionForField('color', field)?.type).toBe('accent');
  });
});

describe('defaultValueForField', () => {
  // The reason this rule exists: a required `z.number().min(1)` seeded with a
  // flat 0 hands the user a value its own schema rejects, the moment they
  // switch to that kind.
  it('seeds a bounded number at the schema’s own lower bound, not 0', () => {
    expect(defaultValueForField(z.number().min(1))).toBe(1);
    expect(defaultValueForField(z.number().min(4).max(64))).toBe(4);
    const bounded = z.number().min(1);
    expect(bounded.safeParse(defaultValueForField(bounded)).success).toBe(true);
  });

  it('still seeds an unbounded number at 0', () => {
    expect(defaultValueForField(z.number())).toBe(0);
  });

  it('seeds a boolean false — "off" is the neutral state for a look toggle', () => {
    expect(defaultValueForField(z.boolean())).toBe(false);
  });

  it('seeds an enum with its first option', () => {
    expect(defaultValueForField(z.enum(['out', 'in']))).toBe('out');
  });

  it('has no seed for a type it cannot default', () => {
    expect(defaultValueForField(z.string())).toBeUndefined();
  });
});

describe('defaultTransition', () => {
  it('returns a bare cut with no frames', () => {
    expect(defaultTransition('cut')).toEqual({ kind: 'cut' });
  });

  it('defaults dissolve/fade-coal to 15 frames', () => {
    expect(defaultTransition('dissolve')).toEqual({ kind: 'dissolve', frames: 15 });
    expect(defaultTransition('fade-coal')).toEqual({ kind: 'fade-coal', frames: 15 });
  });

  // Task 2.4: glitch's two toggles are seeded true (the presentation's own
  // default) — a checkbox has no honest "unset" state, unlike the numeric
  // knobs below, which stay absent so the presentation's own default applies.
  it('defaults glitch to 15 frames, rgbShift true, scanLines true, no intensity/slices', () => {
    expect(defaultTransition('glitch')).toEqual({
      kind: 'glitch',
      frames: 15,
      rgbShift: true,
      scanLines: true,
    });
  });

  it('defaults whip-pan to 15 frames and direction left', () => {
    expect(defaultTransition('whip-pan')).toEqual({
      kind: 'whip-pan',
      frames: 15,
      direction: 'left',
    });
  });

  // Nothing but `frames` (Task 2.5). `direction` became OPTIONAL when it
  // replaced the required `from` — a baked `{from:'in'}` literal has to keep
  // parsing, and a member cannot require the field it is aliasing. That matches
  // `zoom-blur`, whose `direction` has always been optional and unseeded, and
  // it is honest: unset means the presentation's own `'in'`, which is exactly
  // what the old seed said out loud. The DEPRECATED `from` is never seeded.
  it('defaults zoom-through to 15 frames, with neither direction nor the deprecated from', () => {
    expect(defaultTransition('zoom-through')).toEqual({
      kind: 'zoom-through',
      frames: 15,
    });
  });

  // No `color`: the accent key is optional and brand-defined, so core has no
  // honest seed for it. Unset = "the presentation's neutral sweep".
  it('defaults wipe to 15 frames, direction left, and NO colour key', () => {
    const t = defaultTransition('wipe');
    expect(t).toEqual({ kind: 'wipe', frames: 15, direction: 'left' });
  });

  it('defaults gradient-wipe to 15 frames, direction tl-br, softness 40', () => {
    const t = defaultTransition('gradient-wipe');
    expect(t).toEqual({ kind: 'gradient-wipe', frames: 15, direction: 'tl-br', softness: 40 });
  });

  it('honors an explicit frames override for a frame-bearing kind', () => {
    expect(defaultTransition('dissolve', { frames: 30 })).toEqual({
      kind: 'dissolve',
      frames: 30,
    });
    const wipe = defaultTransition('wipe', { frames: 8 });
    expect(wipe.frames).toBe(8);
    expect(wipe.color).toBeUndefined();
    expect(wipe.direction).toBe('left');
  });

  it('ignores a frames override for cut', () => {
    expect(defaultTransition('cut', { frames: 30 })).toEqual({ kind: 'cut' });
  });

  it('defaults slide and flip to direction left', () => {
    expect(defaultTransition('slide', { frames: 12 })).toEqual({
      kind: 'slide',
      frames: 12,
      direction: 'left',
    });
    expect(defaultTransition('flip', { frames: 12 })).toEqual({
      kind: 'flip',
      frames: 12,
      direction: 'left',
    });
  });

  it('defaults fade, clock-wipe, and iris to frames only', () => {
    expect(defaultTransition('fade', { frames: 12 })).toEqual({ kind: 'fade', frames: 12 });
    expect(defaultTransition('clock-wipe', { frames: 12 })).toEqual({ kind: 'clock-wipe', frames: 12 });
    expect(defaultTransition('iris', { frames: 12 })).toEqual({ kind: 'iris', frames: 12 });
  });

  // DECISION, pinned deliberately. Every param of the six new kinds is OPTIONAL
  // — `{kind:'pixelate', frames:12}` alone must render something good, because
  // the presentation carries its own defaults. So the catalog seeds NOTHING
  // that the control can already represent honestly: an unset number field is
  // blank and an unset dropdown shows "—", both of which correctly read as
  // "the renderer's own default".
  //
  // Booleans are the one exception, and the reason is the control: a checkbox
  // has no blank state, so an unset `scanlines` renders UNCHECKED while the
  // presentation actually defaults it ON. That is the inspector lying about
  // the frame the user is looking at. Every boolean whose presentation default
  // is `true` is therefore seeded `true`.
  it('seeds a frames-only default for the new kinds that have no boolean knob', () => {
    expect(defaultTransition('rgb-split', { frames: 12 })).toEqual({ kind: 'rgb-split', frames: 12 });
    expect(defaultTransition('zoom-blur', { frames: 12 })).toEqual({ kind: 'zoom-blur', frames: 12 });
    expect(defaultTransition('checkerboard', { frames: 12 })).toEqual({ kind: 'checkerboard', frames: 12 });
    expect(defaultTransition('scanline-glitch', { frames: 12 })).toEqual({ kind: 'scanline-glitch', frames: 12 });
  });

  it('seeds the ON-by-default booleans so the checkbox matches what renders', () => {
    expect(defaultTransition('pixelate', { frames: 12 })).toEqual({
      kind: 'pixelate', frames: 12, scanlines: true, glitchArtifacts: true,
    });
    expect(defaultTransition('light-leak', { frames: 12 })).toEqual({
      kind: 'light-leak', frames: 12, flareArtifacts: true,
    });
  });
});
