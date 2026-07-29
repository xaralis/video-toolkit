import { describe, it, expect } from 'vitest';
import { anchorTiming } from './overlay-anchor';
import type { OverlayItem, VideoItem } from '../reel-config-base/layered-schema';

const item = (startMs: number): VideoItem => ({
  id: 'v1',
  kind: 'clip',
  startMs,
  endMs: startMs + 5000,
  source: 'recordings/a.mp4',
  sourceInMs: 0,
  sourceOutMs: 5000,
});

const overlay = (startMs: number, endMs: number): OverlayItem => ({
  id: 'o1',
  startMs,
  endMs,
  content: { kind: 'text', text: 'hi' },
});

describe('anchorTiming', () => {
  it('rebases a plain in-bounds overlay to a frame relative to its parent item, with no handle borrow', () => {
    const { from, durationInFrames } = anchorTiming(overlay(1000, 2000), item(0), { inHalf: 0, outHalf: 0 }, 30);
    expect(from).toBe(30); // 1000ms into a clip starting at 0 = frame 30 at 30fps
    expect(durationInFrames).toBe(30); // 1000ms window = 30 frames
  });

  it('shifts `from` by the parent item borrowed in-handle', () => {
    const { from } = anchorTiming(overlay(1000, 2000), item(0), { inHalf: 6, outHalf: 0 }, 30);
    expect(from).toBe(36);
  });

  // Mutation 2 pin — per-endpoint rounding vs the naive ms-difference form.
  // Constructed input where the two DISAGREE: fps=30, item.startMs=2000,
  // overlay.startMs=2050.
  //   per-endpoint: round(2050/1000*30) - round(2000/1000*30)
  //               = round(61.49999999999999) - round(60) = 61 - 60 = 1
  //   naive:        round((2050-2000)/1000*30) = round(1.5) = 2
  // The disagreement is a genuine floating-point artifact (2050ms sits on the
  // 61.5-frame boundary at 30fps): 2050/1000*30 evaluates to
  // 61.49999999999999, not 61.5, so the per-endpoint form rounds down to 61
  // while computing the 50ms difference directly rounds 1.5 up to 2. This is
  // exactly the kind of near-boundary case a round-numbers-only test would
  // never exercise.
  it('disagrees with the naive ms-difference form at a rounding boundary — per-endpoint wins', () => {
    const naiveFrom = (o: OverlayItem, it: VideoItem, handles: { inHalf: number; outHalf: number }, fps: number) =>
      Math.round(((o.startMs - it.startMs) / 1000) * fps) + handles.inHalf;

    const parent = item(2000);
    const anchored = overlay(2050, 2100);
    const handles = { inHalf: 0, outHalf: 0 };

    const { from } = anchorTiming(anchored, parent, handles, 30);
    const naive = naiveFrom(anchored, parent, handles, 30);

    expect(naive).toBe(2); // the form this module must NOT use
    expect(from).toBe(1); // the per-endpoint form this module DOES use
    expect(from).not.toBe(naive);
  });

  it('returns a non-positive durationInFrames for a degenerate [start, end) window, letting the caller skip it', () => {
    const { durationInFrames } = anchorTiming(overlay(1000, 1000), item(0), { inHalf: 0, outHalf: 0 }, 30);
    expect(durationInFrames).toBe(0);
  });
});
