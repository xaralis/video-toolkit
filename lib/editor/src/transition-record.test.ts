import { describe, it, expect } from 'vitest';
import { getTransitionRecord } from '@video-toolkit/lib/render/transition-record';

describe('getTransitionRecord', () => {
  it('treats undefined and cut as "no transition"', () => {
    expect(getTransitionRecord(undefined)).toBeUndefined();
    expect(getTransitionRecord({ kind: 'cut' })).toBeUndefined();
    expect(getTransitionRecord({})).toBeUndefined(); // no kind
  });
  it('passes through a real transition record', () => {
    expect(getTransitionRecord({ kind: 'fade', frames: 12 })).toEqual({ kind: 'fade', frames: 12 });
    expect(getTransitionRecord({ kind: 'wipe', direction: 'left', color: 'gold' })?.kind).toBe('wipe');
  });
});
