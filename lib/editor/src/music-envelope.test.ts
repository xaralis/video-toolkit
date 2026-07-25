import { describe, it, expect } from 'vitest';
import { computeMusicEnvelope } from '@video-toolkit/lib/reel-config-base/music-envelope';
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';

// Small LayeredReel: a voice clip, a silent broll boosting music +6dB, and an
// outro boosting music +10dB. fps 30, baseVolumeDb -8.
const FPS = 30;
const BASE_DB = -8;

function buildReel(): LayeredReel {
  return {
    version: 'layered-1',
    meta: { topic: 'Test', totalDurationMs: 9000 },
    tracks: {
      video: [
        { id: 'v1', kind: 'clip', startMs: 0, endMs: 3000, source: 'clip.mp4', sourceInMs: 0, sourceOutMs: 3000 },
        { id: 'v2', kind: 'broll', startMs: 3000, endMs: 6000, source: 'broll.mp4', sourceInMs: 0, sourceOutMs: 3000, musicBoostDb: 6 },
        { id: 'v3', kind: 'outro', startMs: 6000, endMs: 9000, musicBoostDb: 10 },
      ],
      audio: [],
      music: { source: 'audio/bg.mp3', baseVolumeDb: BASE_DB },
      overlays: [],
      brand: [],
    },
  };
}

const baseGain = Math.pow(10, BASE_DB / 20);

describe('computeMusicEnvelope', () => {
  it('returns base gain (no boost) mid-clip', () => {
    const { volumeAt } = computeMusicEnvelope(buildReel(), { fps: FPS });
    // clip spans frames [0, 90); mid = 45
    expect(volumeAt(45)).toBeCloseTo(baseGain, 10);
  });

  it('returns base gain × broll boost mid-broll', () => {
    const { volumeAt } = computeMusicEnvelope(buildReel(), { fps: FPS });
    // broll spans frames [90, 180); mid = 135
    expect(volumeAt(135)).toBeCloseTo(baseGain * Math.pow(10, 6 / 20), 10);
  });

  it('returns base gain × outro boost mid-outro (outside the last 1s fade)', () => {
    const { volumeAt } = computeMusicEnvelope(buildReel(), { fps: FPS });
    // outro spans frames [180, 270); fade starts at 270-30=240; mid-outro
    // before the fade window, e.g. frame 210.
    expect(volumeAt(210)).toBeCloseTo(baseGain * Math.pow(10, 10 / 20), 10);
  });

  it('linearly fades out during the outro last 1 second', () => {
    const { volumeAt } = computeMusicEnvelope(buildReel(), { fps: FPS });
    // outroEndFrame = 270; fade start = 240; at frame 269, t = (269-240)/30 = 29/30.
    const outroGain = baseGain * Math.pow(10, 10 / 20);
    const expected = outroGain * (1 - 29 / 30);
    expect(volumeAt(269)).toBeCloseTo(expected, 10);
    // Must be strictly less than the full outro gain and still positive (>= 0's
    // successor to the "silent after outro end" assertion below).
    expect(volumeAt(269)).toBeLessThan(outroGain);
    expect(volumeAt(269)).toBeGreaterThanOrEqual(0);
  });

  it('is silent from the outro end frame onward', () => {
    const { volumeAt } = computeMusicEnvelope(buildReel(), { fps: FPS });
    expect(volumeAt(270)).toBe(0);
    expect(volumeAt(300)).toBe(0);
  });

  it('is silent from an explicit music endMs onward (trimmed bed)', () => {
    const reel = buildReel();
    reel.tracks.music.endMs = 4000; // trims the bed mid-broll (frame 120)
    const { volumeAt, points } = computeMusicEnvelope(reel, { fps: FPS });
    // With the new data-driven fades, endMs now fades into the trim point over 1000ms (30 frames).
    // fadeEndFrame = 120, fadeStartFrame = 90. At frame 119, we're 29 frames into the 30-frame fade.
    const brollGain = baseGain * Math.pow(10, 6 / 20);
    expect(volumeAt(90)).toBeCloseTo(brollGain, 10); // fade start, still at full
    expect(volumeAt(105)).toBeCloseTo(brollGain * 0.5, 10); // midway through fade
    expect(volumeAt(119)).toBeCloseTo(brollGain * (1 - 29 / 30), 10); // nearly at end
    expect(volumeAt(120)).toBe(0); // at trim point
    expect(volumeAt(200)).toBe(0);
    // The polyline carries the drop-to-zero vertex at the trim point.
    const endPoint = points.find((p) => p.frame === 120);
    expect(endPoint?.gain).toBe(0);
  });

  it('produces a sorted points polyline starting at frame 0 and including the outro end at gain 0', () => {
    const { points } = computeMusicEnvelope(buildReel(), { fps: FPS });
    expect(points.length).toBeGreaterThan(0);
    expect(points[0].frame).toBe(0);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].frame).toBeGreaterThanOrEqual(points[i - 1].frame);
    }
    const outroEndPoint = points.find((p) => p.frame === 270);
    expect(outroEndPoint).toBeDefined();
    expect(outroEndPoint?.gain).toBe(0);
  });
});
