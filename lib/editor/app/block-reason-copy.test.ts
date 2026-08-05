import { describe, it, expect } from 'vitest';
import { BLOCK_REASON_COPY, hintForReason } from './block-reason-copy';
import { BLOCK_REASONS } from '../src/timeline/block-reason';

// Every code the union declares must have copy. Derived from BLOCK_REASONS
// (the runtime array block-reason.ts's type is built from), not a hand-listed
// duplicate — a hand-listed array here would type-check fine against a
// seventh code added to BLOCK_REASONS without ever noticing it lacks copy,
// and cannot ship mute.
const ALL = BLOCK_REASONS;

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

  // Every reason that means "your edit was blocked" reads the same muted
  // grey (`ed:text-ink-2`) as the plain shortcut hints it replaces when
  // severity is 'info' — which is exactly why the user reported the bar as
  // decoration rather than a message. Every everyday blocking reason (all of
  // them EXCEPT the one filtered out below, `transition-handle-starved` —
  // already 'warn' before this task, checked separately next) must be
  // promoted to 'warn' so it actually stands out.
  it('promotes every everyday blocking reason to warn — info reads as decoration', () => {
    const everydayBlocking = ALL.filter(
      (r) => r !== 'transition-handle-starved',
    );
    for (const reason of everydayBlocking) {
      expect(hintForReason(reason).severity, reason).toBe('warn');
    }
  });

  it('keeps transition-handle-starved at warn — unchanged by the promotion above', () => {
    expect(hintForReason('transition-handle-starved').severity).toBe('warn');
  });
});
