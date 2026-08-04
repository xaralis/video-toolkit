import { describe, it, expect } from 'vitest';
import { ClipSegmentBaseSchema, BrollSegmentBaseSchema } from '@video-toolkit/lib/reel-config-base/segment-base-schemas';

// Zod STRIPS unknown keys on parse. A `fit` authored into a project's
// defaultProps therefore never reaches deriveLayered unless the config-level
// segment schema declares it — the field would vanish one step before the
// forwarding table that derive-layered.test.ts pins, with nothing red.
describe('config segment schemas — media fit survives the parse', () => {
  it('keeps fit and the backdrop knobs on a clip segment', () => {
    const parsed = ClipSegmentBaseSchema.parse({
      id: 'seg-001', type: 'clip', source: 'a.mp4', trimIn: 0, trimOut: 3,
      fit: 'blur-pad', backdropBlur: 12, backdropDim: 0.3,
    });
    expect(parsed).toMatchObject({ fit: 'blur-pad', backdropBlur: 12, backdropDim: 0.3 });
  });

  it('keeps fit and the backdrop knobs on a broll segment', () => {
    const parsed = BrollSegmentBaseSchema.parse({
      id: 'seg-002', type: 'broll', source: 'b.mp4', trimIn: 0, trimOut: 3, audioMode: 'silent',
      fit: 'blur-pad', backdropBlur: 12, backdropDim: 0.3,
    });
    expect(parsed).toMatchObject({ fit: 'blur-pad', backdropBlur: 12, backdropDim: 0.3 });
  });

  it('rejects a genuinely unknown fit mode rather than silently dropping it', () => {
    // 'contain' now parses (it is a real fit, not merely the legacy
    // 'blur-pad' alias) — re-pointed at a value that is unknown under BOTH
    // names, so this still pins the guarantee that the forwarding seam can't
    // silently drop an unrecognised field.
    expect(() => BrollSegmentBaseSchema.parse({
      id: 'seg-002', type: 'broll', source: 'b.mp4', trimIn: 0, trimOut: 3, audioMode: 'silent', fit: 'stretch',
    })).toThrow();
  });

  it('accepts fit:"contain" (no longer unknown) plus the pad/place fields on a clip segment', () => {
    const parsed = ClipSegmentBaseSchema.parse({
      id: 'seg-001', type: 'clip', source: 'a.mp4', trimIn: 0, trimOut: 3,
      fit: 'contain', pad: 'color', padColor: '#112233', placeX: 0.2, placeY: 0.8,
    });
    expect(parsed).toMatchObject({
      fit: 'contain', pad: 'color', padColor: '#112233', placeX: 0.2, placeY: 0.8,
    });
  });

  it('accepts fit:"contain" plus the pad/place fields on a broll segment', () => {
    const parsed = BrollSegmentBaseSchema.parse({
      id: 'seg-002', type: 'broll', source: 'b.mp4', trimIn: 0, trimOut: 3, audioMode: 'silent',
      fit: 'contain', pad: 'none', placeX: 0.3, placeY: 0.7,
    });
    expect(parsed).toMatchObject({ fit: 'contain', pad: 'none', placeX: 0.3, placeY: 0.7 });
  });

  it('still accepts the deprecated fit:"blur-pad" alias', () => {
    const parsed = ClipSegmentBaseSchema.parse({
      id: 'seg-001', type: 'clip', source: 'a.mp4', trimIn: 0, trimOut: 3, fit: 'blur-pad',
    });
    expect(parsed.fit).toBe('blur-pad');
  });

  it('rejects placeX/placeY outside 0..1', () => {
    expect(() => ClipSegmentBaseSchema.parse({
      id: 'seg-001', type: 'clip', source: 'a.mp4', trimIn: 0, trimOut: 3, placeX: 1.5,
    })).toThrow();
  });
});
