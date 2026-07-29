import { describe, it, expect } from 'vitest';
import {
  CORE_EFFECTS,
  editorMetaFromTheme,
  effectCatalog,
  effectDefinition,
  humanizeKey,
  stableColor,
  type EditorMeta,
} from './editor-meta';
import type { CompositionTheme } from '../../theming/types';

describe('effectCatalog', () => {
  it('is core-only (Ken Burns and grade — the two effects core itself renders) with no meta', () => {
    expect(effectCatalog().map((e) => e.type)).toEqual(['ken-burns', 'grade']);
    // No brand effect leaks into the core catalog.
    expect(effectCatalog().map((e) => e.type)).not.toContain('vintage');
  });

  it('appends a brand effect after the core ones', () => {
    const cat = effectCatalog({ effects: [{ type: 'vintage', defaults: { mode: 'film' } }] });
    expect(cat.map((e) => e.type)).toEqual(['ken-burns', 'grade', 'vintage']);
  });

  it('lets a brand entry replace a core one of the same type, in place', () => {
    const cat = effectCatalog({
      effects: [{ type: 'ken-burns', label: 'Pan & zoom', defaults: { direction: 'in' } }, { type: 'grain' }],
    });
    expect(cat.map((e) => e.type)).toEqual(['ken-burns', 'grade', 'grain']);
    expect(cat[0].label).toBe('Pan & zoom');
    expect(cat[0].defaults).toEqual({ direction: 'in' });
  });

  it('does not mutate CORE_EFFECTS across calls', () => {
    effectCatalog({ effects: [{ type: 'vintage' }] });
    expect(CORE_EFFECTS.map((e) => e.type)).toEqual(['ken-burns', 'grade']);
  });

  it('effectDefinition finds a brand-declared type', () => {
    const meta = { effects: [{ type: 'vintage', params: [{ prop: 'mode', options: ['film', 'vhs'] }] }] };
    expect(effectDefinition(meta, 'vintage')?.params?.[0].options).toEqual(['film', 'vhs']);
    expect(effectDefinition(meta, 'nope')).toBeUndefined();
  });
});

describe('humanizeKey', () => {
  it('splits camelCase and dashes into one sentence-cased phrase', () => {
    expect(humanizeKey('logoDelaySec')).toBe('Logo delay sec');
    expect(humanizeKey('stat-callout')).toBe('Stat callout');
    expect(humanizeKey('text')).toBe('Text');
    expect(humanizeKey('update_badge')).toBe('Update badge');
  });
});

describe('stableColor', () => {
  it('is deterministic per seed and differs between seeds', () => {
    expect(stableColor('overlay-chevron')).toBe(stableColor('overlay-chevron'));
    expect(stableColor('overlay-chevron')).not.toBe(stableColor('overlay-stat-callout'));
    expect(stableColor('x')).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/);
  });

  // `a !== b` passes vacuously on a 6° hue gap — two blocks that a user reads as
  // the same colour. Assert a real perceptual gap over the kinds a brand has.
  it('separates every pair of real lane kinds by a visible margin', () => {
    const kinds = [
      'overlay-chevron', 'overlay-lottie', 'overlay-update-badge', 'overlay-text',
      'overlay-title', 'overlay-stat-callout', 'overlay-quote-pull', 'overlay-source-tag',
      'overlay-party-logos', 'overlay-caption', 'overlay-legal', 'video-photo',
      'brand-watermark', 'overlay-ticker', 'overlay-cta', 'overlay-lower-third',
    ];
    const parse = (seed: string) => {
      const m = /^hsl\((\d+), (\d+)%, (\d+)%\)$/.exec(stableColor(seed));
      expect(m, `stableColor(${seed}) shape`).not.toBeNull();
      return { h: Number(m![1]), s: Number(m![2]), l: Number(m![3]) };
    };
    const cols = kinds.map(parse);
    // Weighted: 1° of hue is the cheapest unit of difference; a lightness step
    // reads far stronger than a hue step, saturation in between.
    const dist = (a: typeof cols[0], b: typeof cols[0]) => {
      const dh = Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h));
      return dh + 4 * Math.abs(a.l - b.l) + 2 * Math.abs(a.s - b.s);
    };
    for (let i = 0; i < cols.length; i += 1) {
      for (let j = i + 1; j < cols.length; j += 1) {
        expect(dist(cols[i], cols[j]), `${kinds[i]} vs ${kinds[j]}`).toBeGreaterThanOrEqual(24);
      }
    }
  });
});

// A brand used to declare each kind TWICE — once as a theme registration (so it
// renders) and once in EditorMeta (so it is editable). These pin that ONE
// declaration now serves both, and that an explicit EditorMeta still wins.
describe('editorMetaFromTheme', () => {
  const bare: CompositionTheme = { background: '#000', accentSlots: [] };

  it('derives videoProps from a video registration’s params', () => {
    const theme: CompositionTheme = {
      ...bare,
      video: { outro: { params: [{ prop: 'style', options: ['organic', 'fade'] }] } },
    };
    expect(editorMetaFromTheme(theme).videoProps?.outro).toEqual([
      { prop: 'style', options: ['organic', 'fade'] },
    ]);
  });

  it('adds a registered effect to the catalog ON TOP of the core one', () => {
    const theme: CompositionTheme = {
      ...bare,
      effects: { vintage: { params: [{ prop: 'mode', options: ['film', 'vhs'] }] } },
    };
    const meta = editorMetaFromTheme(theme);
    expect(effectCatalog(meta).map((e) => e.type)).toEqual(['ken-burns', 'grade', 'vintage']);
    expect(effectDefinition(meta, 'vintage')?.params?.[0].options).toEqual(['film', 'vhs']);
  });

  it('derives an effect with no params at all — registering it is what makes it addable', () => {
    const theme: CompositionTheme = { ...bare, effects: { vintage: {} } };
    expect(effectCatalog(editorMetaFromTheme(theme)).map((e) => e.type)).toEqual(['ken-burns', 'grade', 'vintage']);
  });

  it('derives overlayProps from an overlay registration’s params', () => {
    const theme: CompositionTheme = {
      ...bare,
      overlays: { chevron: { params: [{ prop: 'weight', type: 'number' }] } },
    };
    expect(editorMetaFromTheme(theme).overlayProps?.chevron).toEqual([{ prop: 'weight', type: 'number' }]);
  });

  it('reads the deprecated overlayItems tier too — one registry, one derivation', () => {
    const theme: CompositionTheme = {
      ...bare,
      overlayItems: { ticker: { params: [{ prop: 'speed', type: 'number' }] } },
    };
    expect(editorMetaFromTheme(theme).overlayProps?.ticker).toEqual([{ prop: 'speed', type: 'number' }]);
  });

  // RESERVED_EFFECT_TYPES is skipped by applyEffects BEFORE resolution, so a
  // brand's effect-axis ken-burns never draws. Offering its params in the
  // editor would advertise a control that cannot take effect.
  it('does not derive a RESERVED effect type from the theme (ken-burns AND grade are inert on this axis)', () => {
    const theme: CompositionTheme = {
      ...bare,
      effects: {
        'ken-burns': { params: [{ prop: 'beats', type: 'number' }] },
        // grade joined the reserved set at Phase 4 Task 3.4 — a brand's own
        // wrapper-axis registration for it must be just as inert as its
        // ken-burns counterpart above.
        grade: { params: [{ prop: 'lut', type: 'string' }] },
        vintage: {},
      },
    };
    const meta = editorMetaFromTheme(theme);
    expect(meta.effects?.map((e) => e.type)).toEqual(['vintage']);
    // Core's own ken-burns/grade entries are untouched: core RENDERS both
    // (SegmentMedia), so they stay offerable with core's own defaults, not
    // the brand's params.
    const kb = effectDefinition(meta, 'ken-burns');
    expect(kb?.label).toBe('Ken Burns');
    expect(kb?.params).toBeUndefined();
    const gr = effectDefinition(meta, 'grade');
    expect(gr?.label).toBe('Grade');
    expect(gr?.params).toBeUndefined();
  });

  it('lets an explicit videoProps entry override that kind while others stay theme-derived', () => {
    const theme: CompositionTheme = {
      ...bare,
      video: {
        outro: { params: [{ prop: 'style', options: ['organic'] }] },
        card: { params: [{ prop: 'tone', options: ['dark'] }] },
      },
    };
    const explicit: EditorMeta = { videoProps: { outro: [{ prop: 'style', options: ['host-only'] }] } };
    const meta = editorMetaFromTheme(theme, explicit);
    expect(meta.videoProps?.outro).toEqual([{ prop: 'style', options: ['host-only'] }]);
    expect(meta.videoProps?.card).toEqual([{ prop: 'tone', options: ['dark'] }]);
  });

  it('lets an explicit effect entry win over the theme-derived one of the same type', () => {
    const theme: CompositionTheme = { ...bare, effects: { vintage: { params: [{ prop: 'mode' }] } } };
    const meta = editorMetaFromTheme(theme, { effects: [{ type: 'vintage', label: 'Vintage', defaults: { mode: 'film' } }] });
    const cat = effectCatalog(meta);
    expect(cat.map((e) => e.type)).toEqual(['ken-burns', 'grade', 'vintage']);
    expect(cat[2].label).toBe('Vintage');
    expect(cat[2].defaults).toEqual({ mode: 'film' });
  });

  it('passes laneColors and overlayLabels through untouched — they have no theme source', () => {
    const explicit: EditorMeta = {
      laneColors: { 'overlay-chevron': '#123456' },
      overlayLabels: { chevron: 'Chevron' },
    };
    const meta = editorMetaFromTheme(bare, explicit);
    expect(meta.laneColors).toEqual({ 'overlay-chevron': '#123456' });
    expect(meta.overlayLabels).toEqual({ chevron: 'Chevron' });
  });

  it('a theme declaring no params anywhere produces the neutral core default', () => {
    const meta = editorMetaFromTheme({ ...bare, video: { outro: {} }, overlays: { chevron: {} } });
    expect(meta.videoProps).toEqual({});
    expect(meta.overlayProps).toEqual({});
    // No declared fields for any kind, and the catalog is exactly core's.
    expect(meta.videoProps?.outro).toBeUndefined();
    expect(meta.overlayProps?.chevron).toBeUndefined();
    expect(effectCatalog(meta).map((e) => e.type)).toEqual(['ken-burns', 'grade']);
  });
});
