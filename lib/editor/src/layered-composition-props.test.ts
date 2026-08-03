import { describe, expect, it } from 'vitest';
import {
  checkBoundaries,
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

// Two clips butted at 3000ms, boundary carried by a gradient-wipe (center
// alignment, frames 20 → 10 before/10 after — see transitionHandles). `a.mp4`
// is [0,aSourceOutMs) of a file whose measured length feeds its TAIL;
// `b.mp4` starts at bSourceInMs, which feeds its own HEAD directly from the
// authored value (handleRoomFrames never consults fileMs for head — only
// tail is bounded by a measurement). Kept as a factory so each test dials in
// exactly which side of the boundary is short.
const twoClipReel = ({ aSourceOutMs, bSourceInMs }: { aSourceOutMs: number; bSourceInMs: number }): LayeredReel =>
  ({
    version: 'layered-1',
    meta: { topic: 'T', totalDurationMs: 6000 },
    tracks: {
      video: [
        {
          id: 'a',
          kind: 'clip',
          startMs: 0,
          endMs: 3000,
          source: 'a.mp4',
          sourceInMs: 0,
          sourceOutMs: aSourceOutMs,
          transitionOut: { kind: 'gradient-wipe', frames: 20 },
        },
        {
          id: 'b',
          kind: 'clip',
          startMs: 3000,
          endMs: 6000,
          source: 'b.mp4',
          sourceInMs: bSourceInMs,
          sourceOutMs: bSourceInMs + 3000,
        },
      ],
      audio: [],
      music: { baseVolumeDb: 0 },
      overlays: [],
      brand: [],
    },
  }) as unknown as LayeredReel;

describe('checkBoundaries', () => {
  it('reports one message per starved boundary, naming the shortfall', () => {
    // b starts at the very head of its file (sourceInMs 0) — it can lend
    // nothing backwards, so the 10 frames the wipe needs before the cut come
    // up 10 short.
    const reel = twoClipReel({ aSourceOutMs: 3000, bSourceInMs: 0 });
    const msgs = checkBoundaries(reel, { 'a.mp4': 10000, 'b.mp4': 10000 }, 30);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain('Needs 10 frames before the cut, this clip has 0');
  });

  it('is silent when every boundary has room', () => {
    // b now starts 2000ms into its file — 60 frames of head, plenty for the
    // 10 the wipe asks.
    const reel = twoClipReel({ aSourceOutMs: 3000, bSourceInMs: 2000 });
    expect(checkBoundaries(reel, { 'a.mp4': 10000, 'b.mp4': 10000 }, 30)).toEqual([]);
  });

  it('is silent when a duration is missing, rather than guessing', () => {
    // a's sourceOutMs (9990) leaves only 10ms — 0 frames — of tail against a
    // measured 10s file, which DOES starve the boundary (proven by the first
    // assertion, using the same durations Task 2's own suite measures
    // against). With no measurement at all, handleRoomFrames leaves that
    // tail unbounded rather than assuming it's short, so the same reel goes
    // silent — the behaviour this test exists to pin.
    const reel = twoClipReel({ aSourceOutMs: 9990, bSourceInMs: 5000 });
    expect(checkBoundaries(reel, { 'a.mp4': 10000, 'b.mp4': 10000 }, 30)).toEqual([
      'a → b: Needs 10 frames after the cut, this clip has 0',
    ]);
    expect(checkBoundaries(reel, {}, 30)).toEqual([]);
  });
});

describe('layeredDurationInFrames', () => {
  it('converts ms to frames at the given fps', () => {
    expect(layeredDurationInFrames(reel(12_000), 30)).toBe(360);
  });

  it('rounds to the nearest frame rather than truncating', () => {
    // 10_020ms @30fps = 300.6 frames: rounds up to 301, whereas Math.floor would give 300 —
    // proving this is genuinely Math.round, not truncation wearing a round-looking name.
    expect(layeredDurationInFrames(reel(10_020), 30)).toBe(301);
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

  it('derives the real duration through calculateMetadata at the composition fps', async () => {
    // calculateMetadata is async (it measures sources); this reel's video
    // track is empty, so there is nothing to measure and it resolves
    // immediately with the same duration expression as before.
    const props = layeredCompositionProps({ id: 'X', component: Stub, fps: 25, width: 2, height: 3 });
    await expect(props.calculateMetadata({ props: { reel: reel(8_000) } })).resolves.toEqual({
      durationInFrames: 200,
    });
  });

  it('applies the floor through calculateMetadata too', async () => {
    const props = layeredCompositionProps({ id: 'X', component: Stub, fps: 30, width: 2, height: 3 });
    await expect(props.calculateMetadata({ props: { reel: reel(100) } })).resolves.toEqual({ durationInFrames: 60 });
  });
});
