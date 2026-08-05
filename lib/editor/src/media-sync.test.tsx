import React from 'react';
import { describe, it, expect } from 'vitest';
import { buildAudioNodes } from '@video-toolkit/lib/render/audio-track';
import { PREVIEW_SYNC_TOLERANCE_SECONDS } from '@video-toolkit/lib/render/media-sync';
import type { AudioItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

// The preview's A/V sync is not a property of any one component — it holds only
// if BOTH halves of the pair chase the timeline on the same leash. Remotion's
// default tolerance is 0.65s and it is applied per element, so a track that
// passes the prop and one that forgets it drift apart by up to the SUM of the
// two tolerances. These tests pin the pair, not either half.

const audio = (over: Partial<AudioItem> = {}): AudioItem => ({
  id: 'a1',
  source: 'take.mp4',
  startMs: 0,
  endMs: 2000,
  sourceInMs: 0,
  ...over,
});

describe('preview media sync tolerance', () => {
  it('is tighter than Remotion’s 0.65s default — otherwise it changes nothing', () => {
    // 0.45 (normal playback) + 0.2 (amplification headroom) is what
    // `use-media-playback.ts` falls back to when the prop is absent. A value at
    // or above it would make every call site below a no-op while LOOKING like
    // a fix, which is the failure this case exists to prevent.
    expect(PREVIEW_SYNC_TOLERANCE_SECONDS).toBeLessThan(0.65);
    expect(PREVIEW_SYNC_TOLERANCE_SECONDS).toBeGreaterThan(0);
  });

  it('is on the audio track — the only track that actually makes sound', () => {
    const [node] = buildAudioNodes([audio()], { fps: 30 }) as React.ReactElement[];
    const el = (node.props as { children: React.ReactElement }).children;
    expect((el.props as { acceptableTimeShiftInSeconds?: number }).acceptableTimeShiftInSeconds).toBe(
      PREVIEW_SYNC_TOLERANCE_SECONDS,
    );
  });

  it('is on every audio item, not just the first', () => {
    const nodes = buildAudioNodes([audio(), audio({ id: 'a2', startMs: 2000, endMs: 4000 })], {
      fps: 30,
    }) as React.ReactElement[];
    expect(nodes).toHaveLength(2);
    for (const node of nodes) {
      const el = (node.props as { children: React.ReactElement }).children;
      expect((el.props as { acceptableTimeShiftInSeconds?: number }).acceptableTimeShiftInSeconds).toBe(
        PREVIEW_SYNC_TOLERANCE_SECONDS,
      );
    }
  });
});
