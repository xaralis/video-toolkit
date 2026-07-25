import { describe, it, expect } from 'vitest';
import { formatTimecode, frameFromClientX, rulerTicks } from './timeline-util';

describe('formatTimecode', () => {
  it('formats frame 0 at 30fps as 0:00', () => {
    expect(formatTimecode(0, 30)).toBe('0:00');
  });

  it('formats frame 45 at 30fps (1.5s) as 0:01, floored to whole seconds', () => {
    expect(formatTimecode(45, 30)).toBe('0:01');
  });

  it('formats frame 1830 at 30fps (61s) as 1:01', () => {
    expect(formatTimecode(1830, 30)).toBe('1:01');
  });

  it('pads seconds under 10 with a leading zero', () => {
    expect(formatTimecode(30, 30)).toBe('0:01');
    expect(formatTimecode(300, 30)).toBe('0:10');
  });

  it('handles multi-minute durations', () => {
    // 125s = 2:05
    expect(formatTimecode(125 * 30, 30)).toBe('2:05');
  });

  it('floors partial seconds rather than rounding', () => {
    // 89 frames @ 30fps = 2.9666s -> floors to 2s, not 3s
    expect(formatTimecode(89, 30)).toBe('0:02');
  });
});

describe('frameFromClientX', () => {
  const trackLeft = 0;
  const trackWidth = 360;
  const totalFrames = 360;

  it('maps the left edge of the track to frame 0', () => {
    expect(frameFromClientX(0, trackLeft, trackWidth, totalFrames)).toBe(0);
  });

  it('maps the right edge of the track to totalFrames', () => {
    expect(frameFromClientX(360, trackLeft, trackWidth, totalFrames)).toBe(360);
  });

  it('maps the midpoint of the track to totalFrames / 2', () => {
    expect(frameFromClientX(180, trackLeft, trackWidth, totalFrames)).toBe(180);
  });

  it('clamps clientX before the track start to 0', () => {
    expect(frameFromClientX(-50, trackLeft, trackWidth, totalFrames)).toBe(0);
  });

  it('clamps clientX past the track end to totalFrames', () => {
    expect(frameFromClientX(1000, trackLeft, trackWidth, totalFrames)).toBe(360);
  });

  it('accounts for a non-zero track left offset', () => {
    expect(frameFromClientX(100, 100, trackWidth, totalFrames)).toBe(0);
    expect(frameFromClientX(280, 100, trackWidth, totalFrames)).toBe(180);
  });

  it('rounds to the nearest whole frame', () => {
    // 10px of 360 over 360 frames -> exactly 10 frames, but pick an
    // in-between case: 1px of 360px track over 100 frames -> 0.277 -> rounds to 0
    expect(frameFromClientX(1, 0, 360, 100)).toBe(0);
  });
});

describe('rulerTicks', () => {
  it('always includes a tick at frame 0 labeled 0:00', () => {
    const ticks = rulerTicks(360, 30);
    expect(ticks[0]).toEqual({ frame: 0, label: '0:00' });
  });

  it('keeps the last tick at or before the total duration', () => {
    const totalFrames = 360; // 12s
    const ticks = rulerTicks(totalFrames, 30);
    const last = ticks[ticks.length - 1];
    expect(last.frame).toBeLessThanOrEqual(totalFrames);
  });

  it('does not exceed maxTicks for a duration within the nice-interval range', () => {
    const totalFrames = 30 * 200; // 200s, comfortably covered by the 30s interval
    const ticks = rulerTicks(totalFrames, 30, 8);
    expect(ticks.length).toBeLessThanOrEqual(8);
  });

  it('picks a sane 1s interval for a short 12s duration', () => {
    // 12s over max 8 ticks -> interval must be >= 12/8=1.5s -> nice interval 2s
    const ticks = rulerTicks(360, 30, 8);
    // ticks should be evenly spaced by the chosen interval in frames
    const intervalFrames = ticks[1].frame - ticks[0].frame;
    expect([1, 2, 5, 10, 15, 30, 60].map((s) => s * 30)).toContain(intervalFrames);
    expect(ticks.length).toBeLessThanOrEqual(8);
  });

  it('picks a larger nice interval for long durations to respect maxTicks', () => {
    const totalFrames = 30 * 300; // 300s = 5 minutes
    const ticks = rulerTicks(totalFrames, 30, 8);
    const intervalFrames = ticks[1].frame - ticks[0].frame;
    // 300s / 8 = 37.5s minimum interval -> nice interval must be 60s
    expect(intervalFrames).toBe(60 * 30);
  });

  it('labels each tick using formatTimecode', () => {
    const ticks = rulerTicks(360, 30, 8);
    for (const tick of ticks) {
      expect(tick.label).toBe(formatTimecode(tick.frame, 30));
    }
  });

  it('returns just the 0:00 tick for a zero-duration timeline', () => {
    const ticks = rulerTicks(0, 30);
    expect(ticks).toEqual([{ frame: 0, label: '0:00' }]);
  });
});
