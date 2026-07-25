import { describe, expect, it } from 'vitest';
import {
  layeredCompositionProps,
  layeredDurationInFrames,
} from '@video-toolkit/lib/render/layered-composition-props';
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';

const reel = (totalDurationMs: number): LayeredReel =>
  ({
    version: 'layered-1',
    meta: { topic: 'T', totalDurationMs },
    tracks: { video: [], audio: [], music: { baseVolumeDb: 0 }, overlays: [], brand: [] },
  }) as unknown as LayeredReel;

const Stub = () => null;

describe('layeredDurationInFrames', () => {
  it('converts ms to frames at the given fps', () => {
    expect(layeredDurationInFrames(reel(12_000), 30)).toBe(360);
  });

  it('rounds to the nearest frame rather than truncating', () => {
    // 1234ms @30fps = 37.02 frames
    expect(layeredDurationInFrames(reel(1234 + 10_000), 30)).toBe(337);
  });

  it('never returns fewer than 60 frames', () => {
    // Remotion refuses a composition shorter than a frame; the floor is what
    // keeps a half-authored reel openable in Studio instead of crashing it.
    expect(layeredDurationInFrames(reel(0), 30)).toBe(60);
    expect(layeredDurationInFrames(reel(500), 30)).toBe(60);
  });
});

describe('layeredCompositionProps', () => {
  it('passes id, component and the frame geometry straight through', () => {
    const props = layeredCompositionProps({
      id: 'MyReel',
      component: Stub,
      fps: 30,
      width: 1080,
      height: 1920,
    });
    expect(props.id).toBe('MyReel');
    expect(props.component).toBe(Stub);
    expect(props.fps).toBe(30);
    expect(props.width).toBe(1080);
    expect(props.height).toBe(1920);
  });

  it('supplies a placeholder durationInFrames so <Composition> type-checks', () => {
    // Remotion requires durationInFrames even when calculateMetadata overrides it.
    const props = layeredCompositionProps({ id: 'X', component: Stub, fps: 30, width: 2, height: 3 });
    expect(props.durationInFrames).toBeGreaterThan(0);
  });

  it('derives the real duration through calculateMetadata at the composition fps', () => {
    const props = layeredCompositionProps({ id: 'X', component: Stub, fps: 25, width: 2, height: 3 });
    expect(props.calculateMetadata({ props: { reel: reel(8_000) } })).toEqual({
      durationInFrames: 200,
    });
  });

  it('applies the floor through calculateMetadata too', () => {
    const props = layeredCompositionProps({ id: 'X', component: Stub, fps: 30, width: 2, height: 3 });
    expect(props.calculateMetadata({ props: { reel: reel(100) } })).toEqual({ durationInFrames: 60 });
  });
});
