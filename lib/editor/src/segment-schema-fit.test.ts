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

  it('rejects an unknown fit mode rather than silently dropping it', () => {
    expect(() => BrollSegmentBaseSchema.parse({
      id: 'seg-002', type: 'broll', source: 'b.mp4', trimIn: 0, trimOut: 3, audioMode: 'silent', fit: 'contain',
    })).toThrow();
  });
});
