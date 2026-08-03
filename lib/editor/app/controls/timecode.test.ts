import { describe, it, expect } from 'vitest';
import { parseTimecode, formatTimecode } from './timecode';

const FPS = 30;

describe('formatTimecode', () => {
  it('formats as mm:ss.ff', () => {
    expect(formatTimecode(0, FPS)).toBe('0:00.00');
    expect(formatTimecode(62_500, FPS)).toBe('1:02.15');
    expect(formatTimecode(3_600_000, FPS)).toBe('60:00.00');
  });

  it('pads seconds and frames but not minutes', () => {
    expect(formatTimecode(2_033, FPS)).toBe('0:02.01');
  });
});

describe('parseTimecode', () => {
  it('reads the canonical form', () => {
    expect(parseTimecode('1:02.15', FPS)).toBe(62_500);
  });

  it('reads bare seconds', () => {
    expect(parseTimecode('90', FPS)).toBe(90_000);
    expect(parseTimecode('62.5', FPS)).toBe(62_500);
  });

  it('reads a leading colon as zero minutes', () => {
    expect(parseTimecode(':02', FPS)).toBe(2_000);
  });

  it('round-trips through format', () => {
    for (const ms of [0, 1_000, 62_500, 599_999]) {
      const rt = parseTimecode(formatTimecode(ms, FPS), FPS);
      expect(Math.abs((rt as number) - ms)).toBeLessThan(1000 / FPS + 1);
    }
  });

  // Load-bearing: a rejected parse must NOT become 0, or a typo silently
  // zeroes a trim and the clip changes length under the author.
  it('returns null for nonsense rather than zero', () => {
    expect(parseTimecode('', FPS)).toBeNull();
    expect(parseTimecode('abc', FPS)).toBeNull();
    expect(parseTimecode('1:2:3:4', FPS)).toBeNull();
  });

  it('rejects a frame count the fps cannot hold', () => {
    expect(parseTimecode('0:00.30', 30)).toBeNull();
  });
});
