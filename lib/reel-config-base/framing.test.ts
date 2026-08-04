import { describe, it, expect } from 'vitest';
import { FIT_MODES, PAD_KINDS, FRAMING_DEFAULTS, MAX_ZOOM, resolveFraming, hasCropChanges, hasFitChanges } from './framing';
import { MAX_ZOOM as MAX_ZOOM_FROM_CROP_GESTURES } from '../editor/host/crop-gestures';

describe('FIT_MODES / PAD_KINDS / FRAMING_DEFAULTS / MAX_ZOOM', () => {
  it('lists the two real fit modes (blur-pad is a legacy alias, not a third mode)', () => {
    expect(FIT_MODES).toEqual(['cover', 'contain']);
  });
  it('lists the three pad kinds', () => {
    expect(PAD_KINDS).toEqual(['blur', 'color', 'none']);
  });
  it('matches the brief exactly', () => {
    expect(FRAMING_DEFAULTS).toEqual({
      fit: 'cover',
      pad: 'blur',
      backdropBlur: 32,
      backdropDim: 0.45,
      placeX: 0.5,
      placeY: 0.5,
      focalX: 0.5,
      focalY: 0.5,
      cropWidth: 1,
    });
  });
  it('caps zoom at 6', () => {
    expect(MAX_ZOOM).toBe(6);
  });
  it('is still importable from crop-gestures.ts (re-export), same value', () => {
    expect(MAX_ZOOM_FROM_CROP_GESTURES).toBe(MAX_ZOOM);
  });
});

describe('resolveFraming', () => {
  it('resolves an item with no framing fields at all to the defaults', () => {
    expect(resolveFraming({})).toEqual({
      fit: 'cover',
      pad: 'blur',
      blur: 32,
      dim: 0.45,
      placeX: 0.5,
      placeY: 0.5,
    });
  });

  it('is tolerant of a non-object item (undefined/null/scalar), resolving to the defaults rather than throwing', () => {
    for (const bad of [undefined, null, 'nope', 42, true]) {
      expect(() => resolveFraming(bad)).not.toThrow();
      expect(resolveFraming(bad)).toEqual({
        fit: 'cover', pad: 'blur', blur: 32, dim: 0.45, placeX: 0.5, placeY: 0.5,
      });
    }
  });

  it('absorbs the legacy fit:"blur-pad" alias as { fit: "contain", pad: "blur" }', () => {
    expect(resolveFraming({ fit: 'blur-pad' })).toMatchObject({ fit: 'contain', pad: 'blur' });
  });

  it('the legacy alias wins over any other pad the item happens to carry', () => {
    // blur-pad predates `pad` existing at all, but resolveFraming is still
    // defined to be unconditional here — the alias IS "contain + blur".
    expect(resolveFraming({ fit: 'blur-pad', pad: 'color', padColor: '#fff' })).toMatchObject({
      fit: 'contain', pad: 'blur',
    });
  });

  it('resolves fit:"contain" with an explicit pad kind', () => {
    expect(resolveFraming({ fit: 'contain', pad: 'color', padColor: '#112233' })).toMatchObject({
      fit: 'contain', pad: 'color', padColor: '#112233',
    });
    expect(resolveFraming({ fit: 'contain', pad: 'none' })).toMatchObject({ fit: 'contain', pad: 'none' });
  });

  it('an unknown fit value reads as cover, never throws', () => {
    expect(resolveFraming({ fit: 'stretch' })).toMatchObject({ fit: 'cover' });
  });

  it('an unknown pad value reads as blur', () => {
    expect(resolveFraming({ fit: 'contain', pad: 'sparkle' })).toMatchObject({ fit: 'contain', pad: 'blur' });
  });

  it('a non-string padColor is dropped rather than surfaced', () => {
    expect(resolveFraming({ padColor: 123 })).not.toHaveProperty('padColor');
  });

  it('padColor is absent (transparent) when never authored', () => {
    expect(resolveFraming({ fit: 'contain', pad: 'color' })).not.toHaveProperty('padColor');
  });

  it('pad is returned unconditionally even under fit:"cover", where the renderer has no use for it', () => {
    expect(resolveFraming({ fit: 'cover', pad: 'color', padColor: '#000' })).toMatchObject({
      fit: 'cover', pad: 'color', padColor: '#000',
    });
  });

  it.each([
    ['backdropBlur', 'blur', 32],
    ['backdropDim', 'dim', 0.45],
    ['placeX', 'placeX', 0.5],
    ['placeY', 'placeY', 0.5],
  ] as const)('a non-finite %s reads as its default', (field, resolvedKey, def) => {
    for (const bad of [NaN, Infinity, -Infinity, 'x', null, undefined, {}]) {
      expect(resolveFraming({ [field]: bad })).toMatchObject({ [resolvedKey]: def });
    }
  });

  it('carries finite numeric backdrop/place values through unchanged', () => {
    expect(resolveFraming({ backdropBlur: 10, backdropDim: 0.2, placeX: 0.1, placeY: 0.9 })).toMatchObject({
      blur: 10, dim: 0.2, placeX: 0.1, placeY: 0.9,
    });
  });
});

describe('hasCropChanges', () => {
  it('is false for a non-object item', () => {
    expect(hasCropChanges(undefined)).toBe(false);
    expect(hasCropChanges(null)).toBe(false);
  });

  it('is false for an item with no framing fields at all', () => {
    expect(hasCropChanges({})).toBe(false);
  });

  it('is false when crop and focal are explicitly stored AT their defaults — the case a key-presence check gets wrong', () => {
    expect(hasCropChanges({ crop: { width: 1, x: 0.5, y: 0.5 }, focalX: 0.5, focalY: 0.5 })).toBe(false);
  });

  it('is true when crop.width differs from 1 (zoomed in)', () => {
    expect(hasCropChanges({ crop: { width: 0.5 } })).toBe(true);
  });

  it('is true when crop.x differs from 0.5', () => {
    expect(hasCropChanges({ crop: { width: 1, x: 0.2 } })).toBe(true);
  });

  it('is true when crop.y differs from 0.5', () => {
    expect(hasCropChanges({ crop: { width: 1, y: 0.8 } })).toBe(true);
  });

  it('is true when top-level focalX differs from 0.5, with no crop at all', () => {
    expect(hasCropChanges({ focalX: 0.9 })).toBe(true);
  });

  it('is true when top-level focalY differs from 0.5, with no crop at all', () => {
    expect(hasCropChanges({ focalY: 0.1 })).toBe(true);
  });
});

describe('hasFitChanges', () => {
  it('is false for a non-object item', () => {
    expect(hasFitChanges(undefined)).toBe(false);
  });

  it('is false for an item with no framing fields at all', () => {
    expect(hasFitChanges({})).toBe(false);
  });

  it('is false when every field is explicitly stored AT its default — the case a key-presence check gets wrong', () => {
    expect(
      hasFitChanges({
        fit: 'cover', pad: 'blur', placeX: 0.5, placeY: 0.5, backdropBlur: 32, backdropDim: 0.45,
      }),
    ).toBe(false);
  });

  it('is true when fit is "contain"', () => {
    expect(hasFitChanges({ fit: 'contain' })).toBe(true);
  });

  it('is true when fit is the legacy "blur-pad" alias', () => {
    expect(hasFitChanges({ fit: 'blur-pad' })).toBe(true);
  });

  it('is true when pad differs from "blur"', () => {
    expect(hasFitChanges({ pad: 'color' })).toBe(true);
    expect(hasFitChanges({ pad: 'none' })).toBe(true);
  });

  it('is true whenever padColor is present at all, since its default is absence', () => {
    expect(hasFitChanges({ padColor: '#000000' })).toBe(true);
  });

  it('is true when placeX or placeY differs from 0.5', () => {
    expect(hasFitChanges({ placeX: 0.1 })).toBe(true);
    expect(hasFitChanges({ placeY: 0.9 })).toBe(true);
  });

  it('is true when backdropBlur or backdropDim differs from its default', () => {
    expect(hasFitChanges({ backdropBlur: 10 })).toBe(true);
    expect(hasFitChanges({ backdropDim: 0.1 })).toBe(true);
  });
});
