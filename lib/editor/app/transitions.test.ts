import { describe, it, expect } from 'vitest';
import {
  TRANSITION_KINDS,
  DURATION_PRESETS,
  kindNeedsFrames,
  framesToSeconds,
  presetForFrames,
  subOptionsFor,
  defaultTransition,
} from './transitions';

describe('TRANSITION_KINDS', () => {
  it('lists all 8 kinds with human-readable labels', () => {
    expect(TRANSITION_KINDS).toHaveLength(8);
    const byKind = Object.fromEntries(TRANSITION_KINDS.map((k) => [k.kind, k.label]));
    expect(byKind['cut']).toBe('Cut');
    expect(byKind['dissolve']).toBe('Dissolve');
    expect(byKind['fade-coal']).toBe('Fade to black');
    expect(byKind['glitch']).toBe('Glitch');
    expect(byKind['whip-pan']).toBe('Whip pan');
    expect(byKind['zoom-through']).toBe('Zoom');
    expect(byKind['wipe']).toBe('Wipe');
    expect(byKind['gradient-wipe']).toBe('Gradient wipe');
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

  it('returns color + direction enums for wipe', () => {
    const opts = subOptionsFor('wipe');
    const byProp = Object.fromEntries(opts.map((o) => [o.prop, o]));
    expect(byProp.color.options?.map((o) => o.value).sort()).toEqual(['coal', 'lime', 'teal']);
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

  it('defaults wipe to 15 frames, color teal, direction left', () => {
    const t = defaultTransition('wipe');
    expect(t).toEqual({ kind: 'wipe', frames: 15, color: 'teal', direction: 'left' });
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
    expect(wipe.color).toBe('teal');
    expect(wipe.direction).toBe('left');
  });

  it('ignores a frames override for cut', () => {
    expect(defaultTransition('cut', { frames: 30 })).toEqual({ kind: 'cut' });
  });
});
