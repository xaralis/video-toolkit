import { describe, it, expect } from 'vitest';
import { contentEndMs } from '@video-toolkit/lib/reel-config-base/content-end';
import type { VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

const clip = (id: string, startMs: number, endMs: number, extra: Partial<VideoItem> = {}): VideoItem =>
  ({ id, kind: 'clip', startMs, endMs, source: `${id}.mp4`, sourceInMs: 0, sourceOutMs: endMs - startMs, ...extra }) as VideoItem;

describe('contentEndMs', () => {
  it('is the last item end when there is no outro', () => {
    expect(contentEndMs([clip('v1', 0, 5000), clip('v2', 5000, 12000)], 30)).toBe(12000);
  });

  it('ignores a trailing outro', () => {
    const outro = { id: 'o', kind: 'outro', startMs: 12000, endMs: 15000 } as unknown as VideoItem;
    expect(contentEndMs([clip('v1', 0, 12000), outro], 30)).toBe(12000);
  });

  it('subtracts the last content item transitionOut overlap', () => {
    const v = clip('v1', 0, 12000, { transitionOut: { kind: 'fade', frames: 15 } } as Partial<VideoItem>);
    const outro = { id: 'o', kind: 'outro', startMs: 12000, endMs: 15000 } as unknown as VideoItem;
    // 15 frames @ 30fps = 500ms
    expect(contentEndMs([v, outro], 30)).toBe(11500);
  });

  it('returns undefined when every item is an outro', () => {
    const outro = { id: 'o', kind: 'outro', startMs: 0, endMs: 3000 } as unknown as VideoItem;
    expect(contentEndMs([outro], 30)).toBeUndefined();
  });

  it('returns undefined for an empty track', () => {
    expect(contentEndMs([], 30)).toBeUndefined();
  });
});
