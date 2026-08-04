import { describe, it, expect } from 'vitest';
import {
  CORE_EFFECTS,
  editorMetaFromTheme,
  effectCatalog,
  effectDefinition,
  humanizeKey,
  stableColor,
  getStableColorPalette,
  type EditorMeta,
} from './editor-meta';
import { CORE_LANE_COLOR } from './LayeredTimeline';
import { ACCENT_HUE, HUE_GUARD, ARC, hslToRgb, redmean } from './lane-colors';
import type { CompositionTheme } from '../../theming/types';
import type { StyleEffectRenderer } from '../../theming/effects';

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

describe('stableColor', () => {
  it('is deterministic per seed and differs between seeds', () => {
    expect(stableColor('overlay-chevron')).toBe(stableColor('overlay-chevron'));
    expect(stableColor('overlay-chevron')).not.toBe(stableColor('overlay-stat-callout'));
    expect(stableColor('x')).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/);
  });

  // The actual root-cause fix: separation used to be checked over ONE fixed
  // 16-kind list, which passed by construction for that list — an
  // independent audit (random salts, random kind names) found the SAME
  // generator gave worse-than-baseline separation and a tripled duplicate
  // rate for kinds outside it. `STABLE_COLOR_PALETTE` (editor-meta.ts) is now
  // built by farthest-point sampling, a real geometric construction, so this
  // checks EVERY pair of the whole palette — not a sample, not a fixture —
  // which is the guarantee the old test only claimed to have. The palette is
  // built LAZILY (see `getStableColorPalette` in editor-meta.ts, so import
  // doesn't pay its ~77ms construction cost) — calling the accessor here
  // forces that build for this test.
  it('STABLE_COLOR_PALETTE separates every one of its own entries from every other', () => {
    const rgbs = getStableColorPalette().map((c) => hslToRgb(c.h, c.s, c.l));
    // Measured minimum over all C(2048,2) = 2,096,128 pairs of this exact
    // palette (PALETTE_SIZE=2048, built once, lazily, on first use — see
    // buildPalette in editor-meta.ts, over the widened sat 20-90% / light
    // 15-80% box) is ~22.52 (palette[941] vs palette[2047]) — re-derived after
    // `ARC` widened from a narrow 190-280 cool arc to the whole wheel minus
    // the accent's guard band (lane-colors.ts); the wider hue space leaves
    // farthest-point sampling more room, so this floor ROSE from the prior
    // ~11.65. 20 keeps a real margin under that without being so tight that
    // an unrelated, still-reasonable change to PALETTE_SIZE or the sat/light
    // ranges flakes this — re-measure (log `min` below) and re-derive both
    // together if either changes. This is checked on the SAME rounded h/s/l
    // values `stableColor` actually emits (palette entries are rounded
    // before farthest-point selection runs, not after — see `buildPalette`),
    // so the floor covers what ships, not a continuous approximation of it.
    const PALETTE_FLOOR = 20;
    // A single assertion at the end, not one per pair: 2,096,128 `expect()`
    // calls (with an eagerly-built label string each) made this test take
    // >10s: plain-JS min-tracking, then one assert, is the same guarantee at
    // negligible cost. `!(d >= min)`, not `d < min`: the latter is FALSE for
    // a NaN `d` (any comparison with NaN is false), so a NaN redmean distance
    // — e.g. from a NaN saturation or lightness slipping into the palette —
    // would silently never update `min` and never fail this test. `!(d >=
    // min)` is true for NaN (since `NaN >= min` is false), so it's caught.
    let min = Infinity;
    let worstPair: [number, number] = [0, 0];
    for (let i = 0; i < rgbs.length; i += 1) {
      for (let j = i + 1; j < rgbs.length; j += 1) {
        const d = redmean(rgbs[i], rgbs[j]);
        if (!(d >= min)) {
          min = d;
          worstPair = [i, j];
        }
      }
    }
    expect(min, `palette[${worstPair[0]}] vs palette[${worstPair[1]}]`).toBeGreaterThanOrEqual(PALETTE_FLOOR);
  });

  // Mutation-tested: reverting the palette's hue construction to a plain
  // `hash % 360` (the pre-harmonisation behaviour) still passed the OLD
  // version of this file's separation test, and under that mutant most
  // generated colours land outside the arc and several land INSIDE the
  // accent guard band — the exact rule-1 violation this task exists to
  // prevent. The palette loop below checks the EXACT rounded h/s/l every
  // `STABLE_COLOR_PALETTE` entry carries (rounding happens once, before
  // farthest-point selection — see `buildPalette` — not as a display step
  // afterwards), so this is exhaustive over literally every colour
  // `stableColor` can ever emit, not a sample of it; the 300-seed black-box
  // loop through `stableColor` itself is kept alongside it only to prove the
  // hash-to-index wrapper doesn't introduce its own bug independent of the
  // palette (e.g. an off-by-one), not to add coverage the exhaustive loop
  // lacks.
  it('never generates a colour outside the arc, or inside the accent guard band', () => {
    const guardLo = ACCENT_HUE - HUE_GUARD;
    const guardHi = ACCENT_HUE + HUE_GUARD;
    for (const { h } of getStableColorPalette()) {
      expect(h, `palette hue ${h}`).toBeGreaterThanOrEqual(ARC[0]);
      expect(h, `palette hue ${h}`).toBeLessThanOrEqual(ARC[1]);
      expect(h < guardLo || h > guardHi, `palette hue ${h} inside guard band [${guardLo}, ${guardHi}]`).toBe(true);
    }
    for (let i = 0; i < 300; i += 1) {
      const { h } = parseHsl(stableColor(`generated-kind-${i}`));
      expect(h).toBeGreaterThanOrEqual(ARC[0]);
      expect(h).toBeLessThanOrEqual(ARC[1]);
      expect(h < guardLo || h > guardHi).toBe(true);
    }
  });

  // A brand's overlay kinds never reach `stableColor` if core already colours
  // them (`colorFor` in LayeredTimeline.tsx tries `CORE_LANE_COLOR` first) —
  // a prior version of this file's fixture included `video-photo` and
  // `brand-watermark`, both CORE_LANE_COLOR keys, so its measured "floor" was
  // partly defended by pairs that can never actually occur through
  // `stableColor`. This pool is exclusively kinds NOT in CORE_LANE_COLOR.
  const REACHABLE_KIND_POOL = [
    'overlay-chevron', 'overlay-lottie', 'overlay-update-badge', 'overlay-text', 'overlay-title',
    'overlay-stat-callout', 'overlay-quote-pull', 'overlay-source-tag', 'overlay-party-logos',
    'overlay-caption', 'overlay-legal', 'overlay-ticker', 'overlay-cta', 'overlay-lower-third',
    'overlay-progress', 'overlay-social-handle', 'overlay-countdown', 'overlay-map-pin',
    'overlay-price-tag', 'overlay-testimonial', 'overlay-badge', 'overlay-alert', 'overlay-poll',
    'overlay-rating', 'overlay-weather', 'overlay-score', 'overlay-caption-2', 'overlay-emoji-burst',
  ];
  for (const kind of REACHABLE_KIND_POOL) {
    if (kind in CORE_LANE_COLOR) throw new Error(`${kind} is a CORE_LANE_COLOR key — stableColor never sees it`);
  }

  // The pre-harmonisation generator (`hue = mix32(hash) % 360` at one of 3
  // saturations / 4 lightnesses), kept here ONLY as a fixed comparison
  // baseline — not a design to return to, but a concrete answer to "does the
  // new generator actually do better than the old one on kinds it wasn't
  // tuned against."
  function oldGenerator(seed: string): { h: number; s: number; l: number } {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) hash = (Math.imul(hash, 31) + seed.charCodeAt(i)) >>> 0;
    let m = hash >>> 0;
    m ^= m >>> 16;
    m = Math.imul(m, 0x85ebca6b) >>> 0;
    m ^= m >>> 13;
    m = Math.imul(m, 0xc2b2ae35) >>> 0;
    m ^= m >>> 16;
    m >>>= 0;
    const SAT = [34, 42, 50];
    const LIG = [28, 36, 44, 52];
    return { h: m % 360, s: SAT[(m >>> 20) % SAT.length], l: LIG[(m >>> 12) % LIG.length] };
  }

  function minPairwiseDistance(cols: { h: number; s: number; l: number }[]): number {
    const rgbs = cols.map((c) => hslToRgb(c.h, c.s, c.l));
    let min = Infinity;
    for (let i = 0; i < rgbs.length; i += 1) {
      for (let j = i + 1; j < rgbs.length; j += 1) min = Math.min(min, redmean(rgbs[i], rgbs[j]));
    }
    return min;
  }

  // UNFILTERED — a prior version of this test skipped any kind whose new
  // colour already duplicated an earlier one before comparing, which
  // filtered out the new generator's dominant failure mode while leaving the
  // old generator's intact, then declared the new one better. That was not
  // evidence, and this test does not repeat the mistake: it does NOT assert
  // "new beats old" on a single arbitrary list, because that claim isn't
  // well-founded — a single dozen-name draw is a coin flip (whichever
  // generator's hash happens to spread THIS list's names further apart
  // wins), not a structural comparison, and forcing it to pass would mean
  // re-picking the list or the count until it did.
  //
  // Measured, honestly, on the raw first 12 names of the pool below with no
  // selection, after `ARC` widened to the whole wheel minus the accent's
  // guard band (lane-colors.ts): new = 56.84, old = 51.13 (the old
  // generator's own numbers don't depend on ARC, so its figure is
  // unchanged). The new generator happens to beat the old one on this
  // particular list now — that flipped from the prior narrow-arc measurement
  // (new = 34.55, old = 51.13) — but this test still does not assert "new
  // beats old", on purpose: a single dozen-name draw is a coin flip either
  // way, not a structural comparison. The real, structural claim — the one
  // `STABLE_COLOR_PALETTE`'s exhaustive test above proves — is that
  // separation between two DIFFERENT palette entries is ALWAYS at least
  // ~22.52 (measured exhaustively over all 2096128 pairs), a guarantee the
  // old generator's three uncoordinated hash draws never had at any list
  // size. What this test actually checks, honestly: the new generator does
  // not degenerate to an exact duplicate on this realistic, disclosed list
  // (a real, bounded risk — see `PALETTE_SIZE`'s comment in editor-meta.ts
  // for the measured rate).
  it('does not collapse a realistic (reachable-only) kind list into a duplicate colour', () => {
    const drawn = REACHABLE_KIND_POOL.slice(0, 12);
    const newMin = minPairwiseDistance(drawn.map((k) => parseHsl(stableColor(k))));
    const oldMin = minPairwiseDistance(drawn.map(oldGenerator));
    expect(newMin, `two of these 12 kinds rendered as the exact same colour (old generator's min for the same list: ${oldMin})`).toBeGreaterThan(0);
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
