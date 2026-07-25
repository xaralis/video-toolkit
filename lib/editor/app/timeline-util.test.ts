import { describe, it, expect } from 'vitest';
import { formatTimecode } from './timeline-util';

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
