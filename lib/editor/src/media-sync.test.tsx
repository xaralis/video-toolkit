import React from 'react';
import { describe, it, expect } from 'vitest';
import { buildAudioNodes } from '@video-toolkit/lib/render/audio-track';
import { PREVIEW_VIDEO_SYNC_TOLERANCE_SECONDS } from '@video-toolkit/lib/render/media-sync';
import type { AudioItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

// The preview's A/V sync tolerance is DELIBERATELY ASYMMETRIC — see
// media-sync.ts's own comment for why. Sound is nearly free to decode and a
// seek in it is audible, so audio elements carry NO tolerance at all and fall
// back to Remotion's own default. The 4K picture is what actually falls
// behind under load, and a seek in it is silent, so ONLY the picture gets the
// tightened leash. A regression that puts the tolerance back on audio makes
// sound drop out during playback — that is exactly the bug these tests pin.

const audio = (over: Partial<AudioItem> = {}): AudioItem => ({
  id: 'a1',
  source: 'take.mp4',
  startMs: 0,
  endMs: 2000,
  sourceInMs: 0,
  ...over,
});

describe('preview media sync tolerance', () => {
  it('the video tolerance is tighter than Remotion’s 0.65s default — otherwise it changes nothing', () => {
    // 0.45 (normal playback) + 0.2 (amplification headroom) is what
    // `use-media-playback.ts` falls back to when the prop is absent. A value at
    // or above it would make every call site below a no-op while LOOKING like
    // a fix, which is the failure this case exists to prevent.
    expect(PREVIEW_VIDEO_SYNC_TOLERANCE_SECONDS).toBeLessThan(0.65);
    expect(PREVIEW_VIDEO_SYNC_TOLERANCE_SECONDS).toBeGreaterThan(0);
  });

  it('is NOT on the audio track — a seek in audio is audible, and audio barely drifts anyway', () => {
    const [node] = buildAudioNodes([audio()], { fps: 30 }) as React.ReactElement[];
    const el = (node.props as { children: React.ReactElement }).children;
    expect((el.props as { acceptableTimeShiftInSeconds?: number }).acceptableTimeShiftInSeconds).toBeUndefined();
  });

  it('stays off every audio item, not just the first', () => {
    const nodes = buildAudioNodes([audio(), audio({ id: 'a2', startMs: 2000, endMs: 4000 })], {
      fps: 30,
    }) as React.ReactElement[];
    expect(nodes).toHaveLength(2);
    for (const node of nodes) {
      const el = (node.props as { children: React.ReactElement }).children;
      expect((el.props as { acceptableTimeShiftInSeconds?: number }).acceptableTimeShiftInSeconds).toBeUndefined();
    }
  });
});
