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
    expect(stableColor('x')).toMatch(/^hsl\(\d+, 42%, 34%\)$/);
  });
});
