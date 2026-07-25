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
  TransitionSchema,
  AccentKey,
  subOptionForField,
  defaultValueForField,
} from '@video-toolkit/lib/reel-config-base/transition-schema';

// The zod union's own members, read straight off the schema — the yardstick
// every derived list below is measured against.
const SCHEMA_MEMBERS = TransitionSchema.options as ReadonlyArray<z.ZodObject<z.ZodRawShape>>;
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
        if (opt.kind !== 'enum') continue;
        const field = inner(shapeFor(kind)[opt.prop]);
        expect(field, `${kind}.${opt.prop}`).toBeInstanceOf(z.ZodEnum);
        expect(opt.options?.map((o) => o.value)).toEqual((field as z.ZodEnum<[string, ...string[]]>).options);
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
  it('lists all 20 kinds with human-readable labels', () => {
    expect(TRANSITION_KINDS).toHaveLength(20);
    const byKind = Object.fromEntries(TRANSITION_KINDS.map((k) => [k.kind, k.label]));
    expect(byKind['cut']).toBe('Cut');
    expect(byKind['dissolve']).toBe('Dissolve');
    expect(byKind['fade-coal']).toBe('Fade to black');
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
  it('lists exactly the tunable options each new kind’s schema declares', () => {
    for (const [name, kind] of [
      ['rgbSplit', 'rgb-split'],
      ['zoomBlur', 'zoom-blur'],
      ['lightLeak', 'light-leak'],
      ['pixelate', 'pixelate'],
      ['checkerboard', 'checkerboard'],
      ['scanlineGlitch', 'scanline-glitch'],
    ] as const) {
      const entry = registry.transitions[name] as { options?: string[] };
      expect(entry.options, name).toEqual(subOptionsFor(kind).map((o) => o.prop));
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
  it('returns no sub-options for cut, dissolve, fade-coal, and glitch', () => {
    expect(subOptionsFor('cut')).toEqual([]);
    expect(subOptionsFor('dissolve')).toEqual([]);
    expect(subOptionsFor('fade-coal')).toEqual([]);
    expect(subOptionsFor('glitch')).toEqual([]);
  });

  it('returns a direction enum with 4 options for whip-pan', () => {
    const opts = subOptionsFor('whip-pan');
    expect(opts).toHaveLength(1);
    expect(opts[0].prop).toBe('direction');
    expect(opts[0].kind).toBe('enum');
    expect(opts[0].options).toHaveLength(4);
    expect(opts[0].options?.map((o) => o.value).sort()).toEqual(['down', 'left', 'right', 'up']);
  });

  it('returns a from enum with in/out for zoom-through', () => {
    const opts = subOptionsFor('zoom-through');
    expect(opts).toHaveLength(1);
    expect(opts[0].prop).toBe('from');
    expect(opts[0].options?.map((o) => o.value).sort()).toEqual(['in', 'out']);
  });

  // wipe's colour is a BRAND accent-slot key, not a fixed palette: core no
  // longer names one brand's colours, so the control is an 'accent' picker
  // whose options come from the brand's own accentSlots at edit time.
  it('returns an accent colour picker + a direction enum for wipe', () => {
    const opts = subOptionsFor('wipe');
    const byProp = Object.fromEntries(opts.map((o) => [o.prop, o]));
    expect(byProp.color.kind).toBe('accent');
    expect(byProp.color.options).toBeUndefined();
    expect(byProp.direction.kind).toBe('enum');
    expect(byProp.direction.options?.map((o) => o.value).sort()).toEqual(['left', 'right']);
  });

  it('returns direction enum + softness number for gradient-wipe', () => {
    const opts = subOptionsFor('gradient-wipe');
    const byProp = Object.fromEntries(opts.map((o) => [o.prop, o]));
    expect(byProp.direction.kind).toBe('enum');
    expect(byProp.direction.options?.map((o) => o.value).sort()).toEqual([
      'bl-tr',
      'br-tl',
      'tl-br',
      'tr-bl',
    ]);
    expect(byProp.softness.kind).toBe('number');
    expect(byProp.softness.options).toBeUndefined();
  });

  it('returns a direction enum with 4 options for slide and flip', () => {
    for (const kind of ['slide', 'flip']) {
      const opts = subOptionsFor(kind);
      expect(opts).toHaveLength(1);
      expect(opts[0].prop).toBe('direction');
      expect(opts[0].kind).toBe('enum');
      expect(opts[0].options).toHaveLength(4);
      expect(opts[0].options?.map((o) => o.value).sort()).toEqual(['down', 'left', 'right', 'up']);
    }
  });

  it('returns no sub-options for fade, clock-wipe, and iris', () => {
    expect(subOptionsFor('fade')).toEqual([]);
    expect(subOptionsFor('clock-wipe')).toEqual([]);
    expect(subOptionsFor('iris')).toEqual([]);
  });

  // DECISION, pinned deliberately. Burn's shape carries four optional fields.
  // Two are numeric look-shaping knobs a person may want to tune, so they get
  // controls; `mask` and `glowColor` are STRINGS and stay uncontrolled — they
  // are brand-supplied (a staticFile path and a theme colour injected by the
  // brand's own composition), not hand-tuned in the inspector, and there is no
  // free-text sub-option control to render them with. Before the unified
  // catalog, burn surfaced nothing at all; exposing the two numbers is the
  // intended delta. Change this list only on purpose.
  it('surfaces burn’s two numeric knobs and neither of its brand-supplied strings', () => {
    expect(subOptionsFor('burn').map((o) => o.prop)).toEqual(['edgeContrast', 'glowBand']);
    expect(subOptionsFor('burn').map((o) => o.kind)).toEqual(['number', 'number']);
  });

  // The six wired in by Task 4. Each list is exactly the params its
  // presentation destructures — pinned so a param can't be invented here nor
  // quietly dropped from the presentation.
  it('returns direction enum + displacement number for rgb-split', () => {
    const byProp = Object.fromEntries(subOptionsFor('rgb-split').map((o) => [o.prop, o]));
    expect(Object.keys(byProp)).toEqual(['direction', 'displacement']);
    expect(byProp.direction.options?.map((o) => o.value)).toEqual(['horizontal', 'vertical', 'diagonal']);
    expect(byProp.displacement.kind).toBe('number');
  });

  it('returns direction/blurAmount/scaleAmount/origin for zoom-blur', () => {
    const opts = subOptionsFor('zoom-blur');
    expect(opts.map((o) => o.prop)).toEqual(['direction', 'blurAmount', 'scaleAmount', 'origin']);
    expect(opts.map((o) => o.kind)).toEqual(['enum', 'number', 'number', 'enum']);
    const byProp = Object.fromEntries(opts.map((o) => [o.prop, o]));
    expect(byProp.direction.options?.map((o) => o.value)).toEqual(['in', 'out']);
    expect(byProp.origin.options?.map((o) => o.value)).toEqual(['center', 'top', 'bottom', 'left', 'right']);
  });

  it('returns temperature/direction/intensity and a BOOLEAN flareArtifacts for light-leak', () => {
    const opts = subOptionsFor('light-leak');
    expect(opts.map((o) => o.prop)).toEqual(['temperature', 'direction', 'intensity', 'flareArtifacts']);
    expect(opts.map((o) => o.kind)).toEqual(['enum', 'enum', 'number', 'boolean']);
    const byProp = Object.fromEntries(opts.map((o) => [o.prop, o]));
    expect(byProp.temperature.options?.map((o) => o.value)).toEqual(['warm', 'cool', 'rainbow']);
    expect(byProp.flareArtifacts.options).toBeUndefined();
  });

  it('returns two booleans among pixelate’s five knobs', () => {
    const opts = subOptionsFor('pixelate');
    expect(opts.map((o) => o.prop)).toEqual([
      'maxBlockSize', 'gridSize', 'scanlines', 'glitchArtifacts', 'randomness',
    ]);
    expect(opts.map((o) => o.kind)).toEqual(['number', 'number', 'boolean', 'boolean', 'number']);
  });

  it('returns checkerboard’s nine reveal patterns and its square animation', () => {
    const opts = subOptionsFor('checkerboard');
    expect(opts.map((o) => o.prop)).toEqual(['gridSize', 'pattern', 'stagger', 'squareAnimation']);
    const byProp = Object.fromEntries(opts.map((o) => [o.prop, o]));
    expect(byProp.pattern.options?.map((o) => o.value)).toEqual([
      'sequential', 'random', 'diagonal', 'alternating', 'spiral',
      'rows', 'columns', 'center-out', 'corners-in',
    ]);
    expect(byProp.squareAnimation.options?.map((o) => o.value)).toEqual(['fade', 'scale', 'flip']);
  });

  it('returns scanline-glitch’s single shift knob under a readable label', () => {
    const opts = subOptionsFor('scanline-glitch');
    expect(opts).toHaveLength(1);
    expect(opts[0].prop).toBe('rgbShiftPx');
    expect(opts[0].kind).toBe('number');
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
      kind: 'boolean',
    });
  });

  it('maps an OPTIONAL boolean to a checkbox too', () => {
    expect(subOptionForField('softEdges', z.boolean().optional())?.kind).toBe('boolean');
    expect(subOptionForField('softEdges', z.boolean().optional())?.label).toBe('Soft edges');
  });

  it('maps numbers to numeric fields and enums to dropdowns', () => {
    expect(subOptionForField('cellSize', z.number().min(1))?.kind).toBe('number');
    const e = subOptionForField('from', z.enum(['in', 'out']));
    expect(e?.kind).toBe('enum');
    expect(e?.options?.map((o) => o.value)).toEqual(['in', 'out']);
  });

  it('gives strings and other types no control at all', () => {
    expect(subOptionForField('mask', z.string())).toBeNull();
    expect(subOptionForField('bag', z.record(z.string(), z.unknown()))).toBeNull();
  });

  // AccentKey is a plain string to zod, so it is recognised by IDENTITY, not by
  // shape — that is exactly what distinguishes "a brand accent-slot key" from
  // burn's `mask` path, which is also a string and must stay uncontrolled.
  it('maps an AccentKey field to an accent picker, options left to the brand', () => {
    expect(subOptionForField('color', AccentKey)).toEqual({
      prop: 'color',
      label: 'Color',
      kind: 'accent',
    });
    expect(subOptionForField('color', AccentKey.optional())?.kind).toBe('accent');
    // A look-alike plain string is still uncontrolled.
    expect(subOptionForField('color', z.string().optional())).toBeNull();
  });

  // Regression: zod's `.describe()` clones into a NEW instance
  // (`new This({...this._def, description})`), so a naive `t === AccentKey`
  // identity check only survives `.optional()` BEFORE `.describe()` — the
  // order every existing catalog field happens to use. The equally natural
  // reverse order (`.describe()` then `.optional()`) used to silently produce
  // no control at all (not even an error). AccentKey must recognise both.
  it('still maps to an accent picker when .describe() comes before .optional()', () => {
    const field = AccentKey.describe('A differently-worded description').optional();
    expect(subOptionForField('color', field)?.kind).toBe('accent');
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

  it('defaults dissolve/fade-coal/glitch to 15 frames', () => {
    expect(defaultTransition('dissolve')).toEqual({ kind: 'dissolve', frames: 15 });
    expect(defaultTransition('fade-coal')).toEqual({ kind: 'fade-coal', frames: 15 });
    expect(defaultTransition('glitch')).toEqual({ kind: 'glitch', frames: 15 });
  });

  it('defaults whip-pan to 15 frames and direction left', () => {
    expect(defaultTransition('whip-pan')).toEqual({
      kind: 'whip-pan',
      frames: 15,
      direction: 'left',
    });
  });

  it('defaults zoom-through to 15 frames and from in', () => {
    expect(defaultTransition('zoom-through')).toEqual({
      kind: 'zoom-through',
      frames: 15,
      from: 'in',
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
