import { describe, expect, it } from 'vitest';
import { buildReelConfig } from './reel-config';

describe('buildReelConfig', () => {
  it('passes through a minimal valid input unchanged', () => {
    const input = {
      topic: 'Demo',
      chevron: 'PROGRAM',
      segments: [
        { id: 'seg-001', type: 'clip' as const, source: 'a.mp4', trimIn: 0, trimOut: 5 },
        { id: 'seg-002', type: 'outro' as const },
      ],
    };
    const config = buildReelConfig(input);
    expect(config.topic).toBe('Demo');
    expect(config.chevron).toBe('PROGRAM');
    expect(config.segments.length).toBe(2);
    expect(config.segments[0]).toMatchObject({ id: 'seg-001', type: 'clip', source: 'a.mp4' });
  });

  it('preserves overlay structure verbatim', () => {
    const input = {
      topic: 'X',
      chevron: 'Y',
      segments: [
        {
          id: 'seg-001',
          type: 'clip' as const,
          source: 'a.mp4',
          trimIn: 0,
          trimOut: 5,
          overlays: [
            {
              kind: 'quote-pull' as const,
              text: 'Hello.',
              placement: 'upper-third' as const,
              appearAt: 0,
              durationMs: 3000,
            },
          ],
        },
      ],
    };
    const config = buildReelConfig(input);
    expect(config.segments[0]).toHaveProperty('overlays');
    const seg = config.segments[0] as { overlays: unknown[] };
    expect(seg.overlays).toHaveLength(1);
  });

  it('preserves audio block when set', () => {
    const config = buildReelConfig({
      topic: 'X',
      chevron: 'Y',
      audio: { music: 'audio/bg.mp3', musicVolumeDb: -6 },
      segments: [{ id: 'seg-001', type: 'outro' as const }],
    });
    expect(config.audio).toEqual({ music: 'audio/bg.mp3', musicVolumeDb: -6 });
  });
});
