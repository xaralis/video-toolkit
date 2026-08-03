import { describe, it, expect } from 'vitest';
import { aspectLabel, failedSources } from './project-summary';

describe('aspectLabel', () => {
  it('reduces by the greatest common divisor', () => {
    expect(aspectLabel(1080, 1920)).toBe('9:16');
    expect(aspectLabel(1920, 1080)).toBe('16:9');
    expect(aspectLabel(1000, 1000)).toBe('1:1');
  });

  it('handles a ratio that does not reduce cleanly', () => {
    expect(aspectLabel(1001, 1000)).toBe('1001:1000');
  });

  it('does not divide by zero', () => {
    expect(aspectLabel(0, 0)).toBe('—');
  });
});

describe('failedSources', () => {
  // The hook writes 0 for a file it could not read — the same distinction
  // pendingSources relies on. A source with NO entry is still being probed,
  // not failed.
  it('reports only sources that resolved to zero', () => {
    expect(failedSources(['a.mp4', 'b.mp4', 'c.mp4'], { 'a.mp4': 3000, 'b.mp4': 0 })).toEqual(['b.mp4']);
  });

  it('is empty while everything is still probing', () => {
    expect(failedSources(['a.mp4'], {})).toEqual([]);
  });

  it('is empty for a healthy project', () => {
    expect(failedSources(['a.mp4'], { 'a.mp4': 3000 })).toEqual([]);
  });
});
