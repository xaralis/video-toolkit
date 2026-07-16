import { describe, expect, it } from 'vitest';
import { ReelConfigSchema } from './schema';

describe('ReelConfigSchema', () => {
  it('accepts minimal valid reel (clip + outro)', () => {
    const result = ReelConfigSchema.safeParse({
      topic: 'Demo',
      chevron: 'PROGRAM',
      segments: [
        { id: 'seg-001', type: 'clip', source: 'a.mp4', trimIn: 0, trimOut: 5 },
        { id: 'seg-002', type: 'outro' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a clip with quote-pull overlay using accent syntax', () => {
    const result = ReelConfigSchema.safeParse({
      topic: 'Demo',
      chevron: 'PROGRAM',
      segments: [
        {
          id: 'seg-001',
          type: 'clip',
          source: 'a.mp4',
          trimIn: 0,
          trimOut: 5,
          overlays: [
            {
              kind: 'quote-pull',
              text: '{lime:Bariéra} pro lidi.',
              placement: 'upper-third',
              appearAt: 600,
              durationMs: 3200,
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects segments array if empty', () => {
    const result = ReelConfigSchema.safeParse({
      topic: 'Demo',
      chevron: 'PROGRAM',
      segments: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects overlay with durationMs below 3000 (brand rule #19)', () => {
    const result = ReelConfigSchema.safeParse({
      topic: 'Demo',
      chevron: 'PROGRAM',
      segments: [
        {
          id: 'seg-001',
          type: 'clip',
          source: 'a.mp4',
          trimIn: 0,
          trimOut: 5,
          overlays: [
            {
              kind: 'quote-pull',
              text: 'short',
              placement: 'upper-third',
              appearAt: 0,
              durationMs: 1000,
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('accepts broll with inherit-from-clip audio mode', () => {
    const result = ReelConfigSchema.safeParse({
      topic: 'Demo',
      chevron: 'PROGRAM',
      segments: [
        { id: 'seg-001', type: 'clip', source: 'a.mp4', trimIn: 0, trimOut: 5 },
        {
          id: 'seg-002',
          type: 'broll',
          source: 'b.mp4',
          trimIn: 0,
          trimOut: 3,
          audioMode: 'inherit-from-clip',
          audioSource: 'a.mp4',
          audioStartSec: 5,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown segment type via discriminated union', () => {
    const result = ReelConfigSchema.safeParse({
      topic: 'Demo',
      chevron: 'PROGRAM',
      segments: [{ id: 'seg-001', type: 'unknown-kind' } as never],
    });
    expect(result.success).toBe(false);
  });
});
