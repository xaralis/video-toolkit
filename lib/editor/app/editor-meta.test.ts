import { describe, it, expect } from 'vitest';
import { CORE_EFFECTS, effectCatalog, effectDefinition, humanizeKey, stableColor } from './editor-meta';

describe('effectCatalog', () => {
  it('is core-only (Ken Burns — the one effect core itself renders) with no meta', () => {
    expect(effectCatalog().map((e) => e.type)).toEqual(['ken-burns']);
    // No brand effect leaks into the core catalog.
    expect(effectCatalog().map((e) => e.type)).not.toContain('vintage');
  });

  it('appends a brand effect after the core ones', () => {
    const cat = effectCatalog({ effects: [{ type: 'vintage', defaults: { mode: 'film' } }] });
    expect(cat.map((e) => e.type)).toEqual(['ken-burns', 'vintage']);
  });

  it('lets a brand entry replace a core one of the same type, in place', () => {
    const cat = effectCatalog({
      effects: [{ type: 'ken-burns', label: 'Pan & zoom', defaults: { direction: 'in' } }, { type: 'grain' }],
    });
    expect(cat.map((e) => e.type)).toEqual(['ken-burns', 'grain']);
    expect(cat[0].label).toBe('Pan & zoom');
    expect(cat[0].defaults).toEqual({ direction: 'in' });
  });

  it('does not mutate CORE_EFFECTS across calls', () => {
    effectCatalog({ effects: [{ type: 'vintage' }] });
    expect(CORE_EFFECTS.map((e) => e.type)).toEqual(['ken-burns']);
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
