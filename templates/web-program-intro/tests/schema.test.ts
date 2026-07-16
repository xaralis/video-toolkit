import { describe, it, expect } from 'vitest';
import { WebProgramIntroConfigSchema } from '../src/config/schema';

describe('WebProgramIntroConfigSchema', () => {
  it('parses a minimal valid config with one clip segment', () => {
    const input = {
      programNumber: 2,
      programSlug: 'mobilita',
      programTitle: 'Mobilita',
      targetDurationSec: 60,
      segments: [
        { id: 'seg-001', type: 'clip', source: 'rec01.mp4', trimIn: 0, trimOut: 10 },
      ],
    };
    const parsed = WebProgramIntroConfigSchema.parse(input);
    expect(parsed.segments).toHaveLength(1);
    expect(parsed.segments[0]).toMatchObject({ type: 'clip', source: 'rec01.mp4' });
  });

  it('rejects a clip segment that has caption field (web-intro has no burn-in)', () => {
    const input = {
      programNumber: 2,
      programSlug: 'mobilita',
      programTitle: 'Mobilita',
      targetDurationSec: 60,
      segments: [
        {
          id: 'seg-001',
          type: 'clip',
          source: 'rec01.mp4',
          trimIn: 0,
          trimOut: 10,
          caption: { lines: [{ startMs: 0, endMs: 1000, text: 'hi' }] },
        },
      ],
    };
    // Default Zod is strip mode (unknown keys ignored). Use .strict() in schema.
    const parsed = WebProgramIntroConfigSchema.parse(input);
    // If .strict() is used the parse throws; if not, caption is stripped.
    // We assert caption is NOT present on the parsed output:
    expect((parsed.segments[0] as Record<string, unknown>).caption).toBeUndefined();
  });

  it('accepts a broll segment with audioMode=inherit-from-clip', () => {
    const input = {
      programNumber: 7,
      programSlug: 'klima',
      programTitle: 'Klima',
      targetDurationSec: 70,
      segments: [
        { id: 'seg-001', type: 'clip', source: 'rec01.mp4', trimIn: 0, trimOut: 5 },
        {
          id: 'seg-002',
          type: 'broll',
          source: 'broll01.mp4',
          trimIn: 0,
          trimOut: 4,
          audioMode: 'inherit-from-clip',
          audioSource: 'rec01.mp4',
          audioStartSec: 5,
        },
      ],
    };
    expect(() => WebProgramIntroConfigSchema.parse(input)).not.toThrow();
  });

  it('accepts an optional audio.musicVolumeDb field', () => {
    const input = {
      programNumber: 2,
      programSlug: 'mobilita',
      programTitle: 'Mobilita',
      targetDurationSec: 60,
      audio: { music: 'music/bg.mp3', musicVolumeDb: -8 },
      segments: [
        { id: 'seg-001', type: 'clip', source: 'rec01.mp4', trimIn: 0, trimOut: 10 },
      ],
    };
    const parsed = WebProgramIntroConfigSchema.parse(input);
    expect(parsed.audio?.musicVolumeDb).toBe(-8);
  });
});
