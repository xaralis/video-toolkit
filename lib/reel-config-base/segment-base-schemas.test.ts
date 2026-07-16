import { describe, it, expect } from 'vitest';
import { ClipSegmentBaseSchema, BrollSegmentBaseSchema } from './segment-base-schemas';

describe('focal-offset on base segment schemas', () => {
  it('accepts focalX/focalY in 0..1 on a clip', () => {
    const r = ClipSegmentBaseSchema.parse({
      id: 'seg-001', type: 'clip', source: 'a.mp4', trimIn: 0, trimOut: 3,
      focalX: 0.74, focalY: 0.4,
    });
    expect(r.focalX).toBe(0.74);
    expect(r.focalY).toBe(0.4);
  });

  it('leaves focalX/focalY undefined when omitted (backward compatible)', () => {
    const r = ClipSegmentBaseSchema.parse({
      id: 'seg-001', type: 'clip', source: 'a.mp4', trimIn: 0, trimOut: 3,
    });
    expect(r.focalX).toBeUndefined();
    expect(r.focalY).toBeUndefined();
  });

  it('rejects focalX above 1', () => {
    expect(() =>
      ClipSegmentBaseSchema.parse({
        id: 's', type: 'clip', source: 'a.mp4', trimIn: 0, trimOut: 3, focalX: 1.5,
      }),
    ).toThrow();
  });

  it('accepts focalX on a broll segment', () => {
    const r = BrollSegmentBaseSchema.parse({
      id: 's', type: 'broll', source: 'b.mp4', trimIn: 0, trimOut: 3,
      audioMode: 'silent', focalX: 0.3,
    });
    expect(r.focalX).toBe(0.3);
  });

  it('rejects focalX below 0', () => {
    expect(() =>
      ClipSegmentBaseSchema.parse({
        id: 's', type: 'clip', source: 'a.mp4', trimIn: 0, trimOut: 3, focalX: -0.1,
      }),
    ).toThrow();
  });

  it('rejects focalY above 1 on a broll segment', () => {
    expect(() =>
      BrollSegmentBaseSchema.parse({
        id: 's', type: 'broll', source: 'b.mp4', trimIn: 0, trimOut: 3,
        audioMode: 'silent', focalY: 2,
      }),
    ).toThrow();
  });

  it('accepts the inclusive boundaries 0 and 1', () => {
    expect(
      ClipSegmentBaseSchema.parse({
        id: 's', type: 'clip', source: 'a.mp4', trimIn: 0, trimOut: 3, focalX: 0, focalY: 1,
      }).focalX,
    ).toBe(0);
  });
});
