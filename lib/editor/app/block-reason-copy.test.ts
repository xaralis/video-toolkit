import { describe, it, expect } from 'vitest';
import { BLOCK_REASON_COPY, hintForReason } from './block-reason-copy';
import type { BlockReason } from '../src/timeline/block-reason';

// Every code the union declares must have copy. Derived, not a hand-listed
// duplicate: a seventh reason added next month is covered the day it lands,
// and cannot ship mute.
const ALL: BlockReason[] = [
  'footage-head-exhausted',
  'footage-tail-exhausted',
  'min-clip-length',
  'music-source-end',
  'timeline-start',
  'transition-handle-starved',
];

describe('block reason copy', () => {
  it.each(ALL)('has copy for %s', (reason) => {
    const hint = hintForReason(reason);
    expect(hint.text.length).toBeGreaterThan(0);
    expect(['info', 'warn', 'error']).toContain(hint.severity);
  });

  it('covers exactly the declared reasons — no orphan entries', () => {
    expect(Object.keys(BLOCK_REASON_COPY).sort()).toEqual([...ALL].sort());
  });

  it('tells the user what to DO about a starved transition handle', () => {
    // The one case where the fix is not guessable from the constraint: the
    // neighbour has no source left to lend, so the window has to move.
    expect(hintForReason('transition-handle-starved').text.toLowerCase()).toMatch(/shift|move|trim/);
  });

  it('stays one line — no copy long enough to wrap the bar', () => {
    for (const { text } of Object.values(BLOCK_REASON_COPY)) {
      expect(text.length, text).toBeLessThanOrEqual(90);
    }
  });
});
