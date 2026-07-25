import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LayeredTimeline } from './LayeredTimeline';
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';

const reel: LayeredReel = {
  version: 'layered-1', meta: { topic: 't', totalDurationMs: 2000 },
  tracks: { video: [{ id: 'v1', kind: 'photo', startMs: 0, endMs: 2000, source: 'a.jpg', musicBoostDb: 0 }],
            audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [] },
};

describe('LayeredTimeline beat guides', () => {
  it('renders one guide tick per guidesMs entry at startLeft + ms/1000*scaleWidth px', () => {
    const { container } = render(
      <LayeredTimeline reel={reel} onChange={() => {}} selectedId={null} onSelect={() => {}}
        playerRef={{ current: null }} fps={30} scaleWidth={80} guidesMs={[0, 1000]} />,
    );
    const ticks = container.querySelectorAll('[data-guide-tick]');
    expect(ticks).toHaveLength(2);
    expect((ticks[1] as HTMLElement).style.left).toBe('92px'); // 12 + 1000/1000*80
  });

  it('renders no ticks when guidesMs is absent', () => {
    const { container } = render(
      <LayeredTimeline reel={reel} onChange={() => {}} selectedId={null} onSelect={() => {}}
        playerRef={{ current: null }} fps={30} scaleWidth={80} />,
    );
    expect(container.querySelectorAll('[data-guide-tick]')).toHaveLength(0);
  });
});
