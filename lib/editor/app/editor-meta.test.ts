import { describe, it, expect } from 'vitest';
import {
  CORE_EFFECTS,
  editorMetaFromTheme,
  effectCatalog,
  effectDefinition,
  humanizeKey,
  stableColor,
  LANE_PALETTE,
  sourceColors,
  type EditorMeta,
} from './editor-meta';
import { ACCENT_HUE, HUE_GUARD } from './lane-colors';
import type { CompositionTheme } from '../../theming/types';
import type { StyleEffectRenderer } from '../../theming/effects';
import type { LayeredReel, VideoItem } from '../../reel-config-base/layered-schema';

// A real, resolvable renderer — fix round 1: a renderer-less styleEffects
// entry must NOT be offered (see editor-meta.ts's styleEffectsFromTheme), so
// every fixture below needs one to test the ADVERTISED-AND-RENDERS case
// rather than accidentally re-testing the now-excluded renderer-less one.
const dummyStyleRenderer: StyleEffectRenderer = () => ({});

describe('effectCatalog', () => {
  // `grade` was removed from the core catalog: every video item already has
  // its own item-level Color section for the same seven parameters (see
  // LayeredInspector.tsx), so offering it a SECOND time as an addable effect
  // was pure redundancy — worse, the two silently fought over one render,
  // which is why the inspector needed a whole "disabled — this item has its
  // own grade effect" guard just to keep them from doubling up. `item.grade`
  // is the survivor; `ken-burns` is now the only effect core itself renders
  // and offers.
  it('is core-only (Ken Burns — the one effect core itself renders and offers) with no meta', () => {
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

function parseHsl(color: string): { h: number; s: number; l: number } {
  const m = /^hsl\((\d+), (\d+)%, (\d+)%\)$/.exec(color);
  expect(m, `${color} shape`).not.toBeNull();
  return { h: Number(m![1]), s: Number(m![2]), l: Number(m![3]) };
}

// Circular hue distance, wrapping at 0/360 — a naive `Math.abs(a - b)` gets
// this wrong for a pair that straddles the wrap point (e.g. 359 and 1 read
// as 358deg apart instead of the true 2deg), which is exactly the case
// `LANE_PALETTE`'s hue-0 entry needs checked correctly against whatever
// wraps around to sit next to it.
function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

describe('LANE_PALETTE', () => {
  const parsed = LANE_PALETTE.map((c) => parseHsl(c));

  it('has 18 entries', () => {
    expect(LANE_PALETTE).toHaveLength(18);
  });

  // What used to hold "by construction" for the deleted generator (every
  // candidate hue was constrained to clear the guard band before
  // farthest-point selection ever ran) now has to hold "by assertion" for a
  // hand-authored literal — this is that assertion, using the formula the
  // brief specifies: |hue - ACCENT_HUE| > HUE_GUARD, via the wrapping
  // `hueDistance` above rather than a bare subtraction.
  it('every entry clears the accent guard band', () => {
    for (const { h } of parsed) {
      const d = hueDistance(h, ACCENT_HUE);
      expect(d, `hue ${h} is ${d.toFixed(1)}deg from the accent (guard ${HUE_GUARD})`).toBeGreaterThan(HUE_GUARD);
    }
  });

  // `hueDistance`'s own correctness at the 0/360 seam — a naive
  // `Math.abs(a - b)` would say 1 and 359 are 358deg apart; they are
  // actually 2deg apart once the wheel wraps.
  it('wraps hue distance correctly at the 0/360 boundary', () => {
    expect(hueDistance(1, 359)).toBeCloseTo(2, 6);
    expect(hueDistance(0, 350)).toBeCloseTo(10, 6);
  });

  it('every entry is exactly S=52%, L=45% — the family rule shared with CORE_LANE_COLOR', () => {
    for (const { s, l } of parsed) {
      expect(s).toBe(52);
      expect(l).toBe(45);
    }
  });

  it('all 18 entries are distinct', () => {
    expect(new Set(LANE_PALETTE).size).toBe(LANE_PALETTE.length);
  });

  // Consecutive ARRAY entries are what `sourceColors`/`stableColor` actually
  // hand to neighbours (adjacent sources, adjacent unknown kinds), so this
  // checks array order, not sorted-hue order — including the wrap from the
  // last entry back to the first, since cycling (LANE_PALETTE[i %
  // length]) makes that pair adjacent too once a reel exceeds 18 sources.
  it('keeps every consecutive pair — including the wrap from last to first — at least 100deg apart in hue', () => {
    const hues = parsed.map((p) => p.h);
    let min = Infinity;
    let worst: [number, number] = [hues[0], hues[0]];
    for (let i = 0; i < hues.length; i += 1) {
      const a = hues[i];
      const b = hues[(i + 1) % hues.length];
      const d = hueDistance(a, b);
      if (d < min) {
        min = d;
        worst = [a, b];
      }
    }
    // Measured minimum for this exact array: 116deg, between hue 102 and hue
    // 218 (the pair straddling the accent guard band's below-guard edge).
    // Re-derive rather than trust this comment if LANE_PALETTE's order or
    // values ever change.
    expect(min, `${worst[0]} -> ${worst[1]}`).toBeGreaterThanOrEqual(100);
  });
});

describe('stableColor', () => {
  it('is deterministic per seed and differs between seeds', () => {
    expect(stableColor('overlay-chevron')).toBe(stableColor('overlay-chevron'));
    expect(stableColor('overlay-chevron')).not.toBe(stableColor('overlay-stat-callout'));
    expect(stableColor('x')).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/);
  });

  // Draws from the SAME curated palette `sourceColors` cycles through —
  // there is exactly one look in the editor, no second palette to drift
  // from the first. Since every `LANE_PALETTE` entry already clears the
  // guard band (asserted above), this transitively re-proves the old
  // "never generates a colour inside the guard band" guarantee too.
  it('always draws from LANE_PALETTE', () => {
    for (let i = 0; i < 300; i += 1) {
      expect(LANE_PALETTE).toContain(stableColor(`generated-kind-${i}`));
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
    expect(effectCatalog(meta).map((e) => e.type)).toEqual(['ken-burns', 'vintage']);
    expect(effectDefinition(meta, 'vintage')?.params?.[0].options).toEqual(['film', 'vhs']);
  });

  it('derives an effect with no params at all — registering it is what makes it addable', () => {
    const theme: CompositionTheme = { ...bare, effects: { vintage: {} } };
    expect(effectCatalog(editorMetaFromTheme(theme)).map((e) => e.type)).toEqual(['ken-burns', 'vintage']);
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
        // grade stays a reserved type (its STYLE-axis renderer is kept, inert,
        // for backwards compatibility — see CORE_EFFECTS's comment in
        // editor-meta.ts) — a brand's own wrapper-axis registration for it
        // must be just as inert as its ken-burns counterpart above.
        grade: { params: [{ prop: 'lut', type: 'string' }] },
        vintage: {},
      },
    };
    const meta = editorMetaFromTheme(theme);
    expect(meta.effects?.map((e) => e.type)).toEqual(['vintage']);
    // Core's own ken-burns entry is untouched: core RENDERS it (SegmentMedia),
    // so it stays offerable with core's own defaults, not the brand's params.
    const kb = effectDefinition(meta, 'ken-burns');
    expect(kb?.label).toBe('Ken Burns');
    expect(kb?.params).toBeUndefined();
    // `grade` has NO catalog entry at all any more (removed from CORE_EFFECTS
    // — item.grade's Color panel is the one place to author it now), so it
    // stays undefined here even though it is reserved and even though the
    // theme registered params for it.
    expect(effectDefinition(meta, 'grade')).toBeUndefined();
  });

  // Gap 1 (Task 4.4): a brand's STYLE-axis registration (`theme.styleEffects`)
  // renders via SegmentMedia but, before this task, had no editor catalog
  // entry — `effectsFromTheme` only reads `theme.effects` and skips anything
  // reserved, and a style registration makes its own type reserved.
  it('derives a brand STYLE-axis registration into the effect catalog, with its params', () => {
    const theme: CompositionTheme = {
      ...bare,
      styleEffects: {
        'vignette-pulse': { renderer: dummyStyleRenderer, params: [{ prop: 'intensity', type: 'number' }] },
      },
    };
    const meta = editorMetaFromTheme(theme);
    expect(effectCatalog(meta).map((e) => e.type)).toEqual(['ken-burns', 'vignette-pulse']);
    expect(effectDefinition(meta, 'vignette-pulse')?.params).toEqual([{ prop: 'intensity', type: 'number' }]);
  });

  it('derives a param-less brand STYLE-axis registration too — registering it is what makes it addable', () => {
    const theme: CompositionTheme = { ...bare, styleEffects: { 'light-sweep': { renderer: dummyStyleRenderer } } };
    const meta = editorMetaFromTheme(theme);
    expect(effectCatalog(meta).map((e) => e.type)).toEqual(['ken-burns', 'light-sweep']);
    expect(effectDefinition(meta, 'light-sweep')?.params).toBeUndefined();
  });

  // Fix round 1 (review Important): `Registration.renderer` is OPTIONAL, so a
  // `theme.styleEffects` entry can declare `params` with no renderer at all.
  // Before this pin, such an entry was offered and editable while
  // `applyStyleEffects` silently rendered nothing for it — a control the
  // author can set with no effect and no signal. Verified with a throwaway
  // probe before the fix (catalog contained the entry, `applyStyleEffects`
  // returned `{}`); this pin is that probe's assertion, permanently.
  it('does NOT offer a renderer-less styleEffects registration — it cannot render', () => {
    const theme: CompositionTheme = {
      ...bare,
      styleEffects: { 'film-burn': { params: [{ prop: 'amount', type: 'number' }] } }, // no renderer
    };
    const meta = editorMetaFromTheme(theme);
    expect(effectCatalog(meta).map((e) => e.type)).toEqual(['ken-burns']);
    expect(effectDefinition(meta, 'film-burn')).toBeUndefined();
  });

  it('does NOT re-derive core\'s own reserved style types (ken-burns, grade) from theme.styleEffects', () => {
    // Core registers both on styleEffects internally at render time. `ken-burns`
    // keeps its own labelled catalog entry (bespoke inspector UI), so the
    // theme's registration for it must not shadow that with a generic params
    // list. `grade` has no catalog entry at all any more (removed from
    // CORE_EFFECTS — item.grade's Color panel is the one place to author it),
    // and this proves the theme's registration for it doesn't sneak one back
    // in either: reserved AND catalog-less stays catalog-less.
    const theme: CompositionTheme = {
      ...bare,
      styleEffects: {
        'ken-burns': { params: [{ prop: 'beats', type: 'number' }] },
        grade: { params: [{ prop: 'lut', type: 'string' }] },
      } as never,
    };
    const meta = editorMetaFromTheme(theme);
    expect(effectCatalog(meta).map((e) => e.type)).toEqual(['ken-burns']);
    expect(effectDefinition(meta, 'ken-burns')?.label).toBe('Ken Burns');
    expect(effectDefinition(meta, 'ken-burns')?.params).toBeUndefined();
    expect(effectDefinition(meta, 'grade')).toBeUndefined();
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
    expect(cat.map((e) => e.type)).toEqual(['ken-burns', 'vintage']);
    expect(cat[1].label).toBe('Vintage');
    expect(cat[1].defaults).toEqual({ mode: 'film' });
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
    expect(effectCatalog(meta).map((e) => e.type)).toEqual(['ken-burns']);
  });
});

// ---------------------------------------------------------------------------
// Colour-by-source-file: a timeline block's fill answers "same take, or a
// different one" — a question a colour keyed on KIND cannot answer once a
// real reel narrows to a handful of kinds (see LayeredTimeline.tsx's
// `sourceColors` doc comment for the motivating case). `sourceColors` cycles
// `LANE_PALETTE` (see that describe block above) by sorted source order.
// ---------------------------------------------------------------------------

describe('sourceColors', () => {
  const clip = (id: string, source: string, startMs: number, endMs: number): VideoItem => ({
    id, kind: 'clip', startMs, endMs, source, sourceInMs: 0, sourceOutMs: endMs - startMs,
  });
  const multiClip = (id: string, startMs: number, endMs: number): VideoItem => ({
    id, kind: 'multi-clip', startMs, endMs, layout: 'split-h',
    sources: [
      { source: 'a.mp4', sourceInMs: 0, sourceOutMs: 1000 },
      { source: 'b.mp4', sourceInMs: 0, sourceOutMs: 1000 },
    ],
  });
  const card = (id: string, startMs: number, endMs: number): VideoItem => ({ id, kind: 'card', startMs, endMs, cardKind: 'stat' });
  const outro = (id: string, startMs: number, endMs: number): VideoItem => ({ id, kind: 'outro', startMs, endMs });

  function reel(items: VideoItem[]): LayeredReel {
    return {
      version: 'layered-1',
      meta: { topic: 't', totalDurationMs: 10000 },
      tracks: { video: items, audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [] },
    };
  }

  it('gives two items sharing a source the SAME colour, and a different source a DIFFERENT one', () => {
    const r = reel([
      clip('v1', 'TH-01.mp4', 0, 1000),
      clip('v2', 'TH-01.mp4', 1000, 2000),
      clip('v3', 'TH-02.mp4', 2000, 3000),
    ]);
    const colors = sourceColors(r);
    expect(colors['TH-01.mp4']).toBeDefined();
    expect(colors['TH-02.mp4']).toBeDefined();
    expect(colors['TH-01.mp4']).not.toBe(colors['TH-02.mp4']);
  });

  it('assigns colours by SORTED source order, not order of appearance — reordering the timeline does not recolour it', () => {
    const r1 = reel([clip('v1', 'b.mp4', 0, 1000), clip('v2', 'a.mp4', 1000, 2000), clip('v3', 'c.mp4', 2000, 3000)]);
    const r2 = reel([clip('v1', 'c.mp4', 0, 1000), clip('v2', 'a.mp4', 1000, 2000), clip('v3', 'b.mp4', 2000, 3000)]);
    expect(sourceColors(r1)).toEqual(sourceColors(r2));
  });

  it('excludes multi-clip, card, and outro — no single source (or none at all) to key on', () => {
    const r = reel([
      clip('v1', 'a.mp4', 0, 1000),
      multiClip('v2', 1000, 2000),
      card('v3', 2000, 3000),
      outro('v4', 3000, 4000),
    ]);
    expect(Object.keys(sourceColors(r))).toEqual(['a.mp4']);
  });

  // Cycling, not generating: LANE_PALETTE has 18 entries, so a reel with
  // more distinct sources than that reuses colours starting from entry 0
  // again — the user's explicit instruction ("prostě je tam jen střídat"),
  // not a defect. Zero-padded source names sort lexicographically in the
  // same order they're created, so `sorted[i]` below lines up with palette
  // index `i` directly.
  it('cycles once distinct sources exceed the palette size — entry 0 repeats at index 18, and it never throws', () => {
    const sources = Array.from({ length: 20 }, (_, i) => `src-${String(i).padStart(2, '0')}.mp4`);
    const items = sources.map((source, i) => clip(`v${i}`, source, i * 1000, (i + 1) * 1000));
    const r = reel(items);
    let colors: Record<string, string> = {};
    expect(() => {
      colors = sourceColors(r);
    }).not.toThrow();
    const sorted = [...sources].sort();
    expect(Object.keys(colors)).toHaveLength(20);
    expect(colors[sorted[0]]).toBe(LANE_PALETTE[0]);
    expect(colors[sorted[17]]).toBe(LANE_PALETTE[17]);
    expect(colors[sorted[18]]).toBe(LANE_PALETTE[0]);
    expect(colors[sorted[19]]).toBe(LANE_PALETTE[1]);
  });
});
