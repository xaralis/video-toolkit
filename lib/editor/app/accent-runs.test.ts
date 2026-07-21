import { describe, it, expect } from 'vitest';
import { parseAccents } from '@video-toolkit/lib/transcripts/accent-parser';
import { runsToString, applyAccentToRange, type Run } from './accent-runs';

describe('runsToString', () => {
  it('round-trips with parseAccents for mixed plain + accented text', () => {
    expect(runsToString(parseAccents('A {lime:b} c'))).toBe('A {lime:b} c');
  });

  it('round-trips a leading/trailing accent (parser emits empty edge runs)', () => {
    expect(runsToString(parseAccents('{lime:a}'))).toBe('{lime:a}');
    expect(runsToString(parseAccents('{teal:a} b'))).toBe('{teal:a} b');
  });

  it('serializes a plain run unwrapped and a colored run with its markup', () => {
    const runs: Run[] = [
      { text: 'plain ', color: null },
      { text: 'green', color: 'lime' },
    ];
    expect(runsToString(runs)).toBe('plain {lime:green}');
  });

  it('merges adjacent same-color runs', () => {
    const runs: Run[] = [
      { text: 'a', color: 'lime' },
      { text: 'b', color: 'lime' },
    ];
    expect(runsToString(runs)).toBe('{lime:ab}');
  });

  it('does NOT merge adjacent runs of different colors', () => {
    const runs: Run[] = [
      { text: 'a', color: 'lime' },
      { text: 'b', color: 'teal' },
    ];
    expect(runsToString(runs)).toBe('{lime:a}{teal:b}');
  });

  it('drops empty runs', () => {
    const runs: Run[] = [
      { text: '', color: null },
      { text: 'x', color: 'lime' },
      { text: '', color: null },
    ];
    expect(runsToString(runs)).toBe('{lime:x}');
  });

  it('merges adjacent plain runs too', () => {
    const runs: Run[] = [
      { text: 'a', color: null },
      { text: 'b', color: null },
    ];
    expect(runsToString(runs)).toBe('ab');
  });
});

describe('applyAccentToRange', () => {
  it('accents a plain-text range with lime', () => {
    const value = 'Řízená péče, ne';
    const start = value.indexOf('péče');
    const end = start + 'péče'.length;
    expect(applyAccentToRange(value, start, end, 'lime')).toBe('Řízená {lime:péče}, ne');
  });

  it('replaces an existing accent inside the range rather than nesting it', () => {
    const value = 'Řízená {teal:péče}.';
    // Plain text is "Řízená péče." — select "Řízená péče" (offsets into PLAIN text).
    const plain = 'Řízená péče.';
    const start = 0;
    const end = plain.indexOf('.');
    const out = applyAccentToRange(value, start, end, 'lime');
    expect(out).toBe('{lime:Řízená péče}.');
    // No nested braces / no leftover teal.
    expect(out).not.toContain('{teal:');
    expect(out.match(/\{/g)?.length).toBe(1);
  });

  it('clears the accent from a range when color is null', () => {
    const value = 'Řízená {teal:péče}.';
    const plain = 'Řízená péče.';
    const start = plain.indexOf('péče');
    const end = start + 'péče'.length;
    expect(applyAccentToRange(value, start, end, null)).toBe('Řízená péče.');
  });

  it('uses offsets into the PLAIN (accent-stripped) text, not the encoded string', () => {
    // Encoded string has {lime:...} early; plain offsets must ignore the markup.
    const value = 'Stačí {lime:málo}, ne';
    const plain = 'Stačí málo, ne';
    const start = plain.indexOf('ne');
    const end = start + 'ne'.length;
    // Encoded index of "ne" would be shifted by the markup; using plain offsets
    // must accent the trailing "ne" and leave {lime:málo} intact.
    expect(applyAccentToRange(value, start, end, 'teal')).toBe('Stačí {lime:málo}, {teal:ne}');
  });

  it('merges a new accent with an adjacent same-color accent', () => {
    const value = '{lime:a}bc';
    // plain "abc"; accent "bc" lime → should merge into one {lime:abc}.
    expect(applyAccentToRange(value, 1, 3, 'lime')).toBe('{lime:abc}');
  });

  it('splits an accent when only part of it is re-accented', () => {
    const value = '{teal:abcd}';
    // plain "abcd"; accent "bc" lime → teal a, lime bc, teal d.
    expect(applyAccentToRange(value, 1, 3, 'lime')).toBe('{teal:a}{lime:bc}{teal:d}');
  });

  it('is a no-op (round-tripped through normalization) for an empty selection', () => {
    const value = 'A {lime:b} c';
    expect(applyAccentToRange(value, 3, 3, 'teal')).toBe('A {lime:b} c');
  });

  it('clamps and swaps out-of-range / reversed selections', () => {
    const value = 'abc';
    expect(applyAccentToRange(value, 3, 0, 'lime')).toBe('{lime:abc}');
    expect(applyAccentToRange(value, -5, 999, 'teal')).toBe('{teal:abc}');
  });
});
