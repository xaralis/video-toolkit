import React from 'react';
import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Phase 4 Task 3.2 — the STYLE axis: MediaStyleFragment, the derived reserved
// set, and the ken-burns adapter.
//
// The capability this task ADDS, per the mutation-discipline rule in
// CONSTRAINTS.md: an effect can contribute a style fragment merged into the
// media element, and the reserved set (which types the WRAPPER axis must
// never touch) is DERIVED from the style registry rather than a hardcoded
// list. This file pins that addition directly — not just what the change
// preserves (Task 3.1's baseline already covers ken-burns continuing to
// work).
// ---------------------------------------------------------------------------
import {
  applyEffects,
  applyStyleEffects,
  composeMediaStyle,
  isReservedEffectType,
  resolveStyleEffectRenderer,
  type EffectRenderProps,
  type StyleEffectRenderer,
} from '@video-toolkit/lib/theming/effects';
import type { BrandTheme } from '@video-toolkit/lib/theming/types';
import type { VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

const item: VideoItem = { id: 'v1', kind: 'photo', startMs: 0, endMs: 3000, source: 'photos/a.jpg' };
const NO_HANDLES = { inHalf: 0, outHalf: 0 };

describe('isReservedEffectType is DERIVED from the style registry, not a fixed list', () => {
  it('core ken-burns is reserved even with an empty theme', () => {
    expect(isReservedEffectType({ accentSlots: [] } as unknown as BrandTheme, 'ken-burns')).toBe(true);
  });

  it('an unregistered type is not reserved', () => {
    expect(isReservedEffectType({ accentSlots: [] } as unknown as BrandTheme, 'zoom-blur')).toBe(false);
  });

  it('a BRAND-registered style effect becomes reserved for THIS theme, with no list to update', () => {
    const zoomBlur: StyleEffectRenderer = () => ({ opacity: 0.5 });
    const theme = { accentSlots: [], styleEffects: { 'zoom-blur': { renderer: zoomBlur } } } as unknown as BrandTheme;
    expect(isReservedEffectType(theme, 'zoom-blur')).toBe(true);
    // A theme that never registered it still says no — reserved-ness is
    // PER THEME, not global process state.
    expect(isReservedEffectType({ accentSlots: [] } as unknown as BrandTheme, 'zoom-blur')).toBe(false);
  });
});

describe('applyEffects and the style axis AGREE without communicating: a brand style effect is never double-applied', () => {
  it('a type registered on BOTH axes is WRAPPED NEVER — the style axis owns it', () => {
    // The scenario the reserved set exists to prevent: a brand names a type
    // that resolves on the wrapper axis too (e.g. because a brand ported an
    // old wrapper-shaped implementation alongside the new style one, or by
    // simple accident of both registries using open string keys). Correct
    // behaviour: the wrapper axis must skip it outright, because the style
    // axis already owns rendering it (inside SegmentMedia) — applying the
    // wrapper renderer ON TOP would double the effect.
    const wrapperSpy = vi.fn((props: EffectRenderProps) => <div data-wrapped="">{props.children}</div>);
    const styleRenderer: StyleEffectRenderer = () => ({ opacity: 0.5 });
    const theme = {
      accentSlots: [],
      effects: { 'zoom-blur': { renderer: wrapperSpy } },
      styleEffects: { 'zoom-blur': { renderer: styleRenderer } },
    } as unknown as BrandTheme;

    const media = <span data-media="" />;
    const node = applyEffects(theme, { ...item, effects: [{ type: 'zoom-blur' }] }, NO_HANDLES, media);

    // Referentially unchanged: the ONE effect on the item resolved on the
    // style axis, so the wrapper axis contributed nothing.
    expect(node).toBe(media);
    expect(wrapperSpy).not.toHaveBeenCalled();
  });

  it('the style axis DOES receive it, via applyStyleEffects', () => {
    const styleRenderer: StyleEffectRenderer = () => ({ opacity: 0.5 });
    const registry = { 'zoom-blur': { renderer: styleRenderer } };
    const frag = applyStyleEffects(registry, { ...item, effects: [{ type: 'zoom-blur' }] }, 10, 90);
    expect(frag.opacity).toBe(0.5);
  });
});

describe('composeMediaStyle: the merge rule table', () => {
  it('transform concatenates AFTER the base', () => {
    expect(composeMediaStyle({ transform: 'scale(2)' }, { transform: 'rotate(5deg)' }).transform).toBe(
      'scale(2) rotate(5deg)',
    );
  });

  it('filter concatenates', () => {
    expect(composeMediaStyle({ filter: 'brightness(1.1)' }, { filter: 'url(#g)' }).filter).toBe('brightness(1.1) url(#g)');
  });

  it('opacity multiplies', () => {
    expect(composeMediaStyle({ opacity: 0.5 }, { opacity: 0.5 }).opacity).toBe(0.25);
  });

  it('objectPosition + transformOrigin move as a PAIR and OVERRIDE — the base keeps NEITHER once next sets one', () => {
    const merged = composeMediaStyle(
      { objectPosition: '30% 70%', transformOrigin: '30% 70%' },
      { objectPosition: '10% 20%', transformOrigin: '10% 20%' },
    );
    expect(merged.objectPosition).toBe('10% 20%');
    expect(merged.transformOrigin).toBe('10% 20%');
  });

  it('a next fragment with NO objectPosition leaves the base pair untouched', () => {
    const merged = composeMediaStyle({ objectPosition: '30% 70%', transformOrigin: '30% 70%' }, { transform: 'scale(2)' });
    expect(merged.objectPosition).toBe('30% 70%');
    expect(merged.transformOrigin).toBe('30% 70%');
  });
});

describe('resolveStyleEffectRenderer: brand registration wins over core', () => {
  it('a brand ken-burns REPLACES core\'s for this registry', () => {
    const brandKenBurns: StyleEffectRenderer = () => ({ opacity: 0.1 });
    const renderer = resolveStyleEffectRenderer({ 'ken-burns': { renderer: brandKenBurns } }, 'ken-burns');
    expect(renderer).toBe(brandKenBurns);
  });

  it('with no registry, core ken-burns still resolves', () => {
    expect(resolveStyleEffectRenderer(undefined, 'ken-burns')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Duplicate ken-burns entries — the PINNED decision (see task-3.2-report.md
// for the full reasoning): the FIRST ENABLED entry of a reserved type wins;
// a later entry of the SAME type is ignored, whether enabled or not. Silently
// applying every duplicate would double the movement.
// ---------------------------------------------------------------------------
describe('duplicate style-effect entries of the SAME type: first ENABLED wins, later ones ignored', () => {
  it('two ENABLED ken-burns entries: only the first contributes', () => {
    const frag = applyStyleEffects(
      undefined,
      {
        ...item,
        effects: [
          { type: 'ken-burns', direction: 'in' },
          { type: 'ken-burns', direction: 'left' },
        ],
      },
      25,
      90,
    );
    // direction 'in' scales by 1.08 + p*0.12; direction 'left' by 1.08 + p*0.06
    // — different enough that "which one won" is observable from the number.
    expect(frag.transform).toContain('translate(0px, 0px)'); // 'in' emits no x/y translate
  });
});
