import { describe, it, expect } from 'vitest';
import { buildReelConfig, fps, width, height } from '../src/config/reel-config';

describe('web-program-intro reel-config', () => {
  it('exposes 16:9 composition dimensions', () => {
    expect(width).toBe(1920);
    expect(height).toBe(1080);
    expect(fps).toBe(30);
  });

  it('builds a config from a valid input', () => {
    const config = buildReelConfig({
      programNumber: 2,
      programSlug: 'mobilita',
      programTitle: 'Mobilita',
      segments: [
        { id: 'seg-001', type: 'clip', source: 'rec01.mp4', trimIn: 0, trimOut: 10 },
      ],
    });
    expect(config.segments).toHaveLength(1);
    expect(config.programSlug).toBe('mobilita');
  });
});
