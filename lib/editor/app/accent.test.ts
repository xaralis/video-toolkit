import { describe, it, expect } from 'vitest';
import { wrapAccent, stripAccents } from './accent';

describe('wrapAccent', () => {
  it('wraps a mid-string selection in {lime:...} and returns a range spanning the wrapped phrase', () => {
    const text = 'Snížíme nájmy o třetinu';
    const selStart = text.indexOf('nájmy');
    const selEnd = selStart + 'nájmy'.length;

    const result = wrapAccent(text, selStart, selEnd, 'lime');

    expect(result.text).toBe('Snížíme {lime:nájmy} o třetinu');
    // Range covers the inserted `{lime:nájmy}` token, wrapper included.
    const wrapped = '{lime:nájmy}';
    const expectedStart = result.text.indexOf(wrapped);
    const expectedEnd = expectedStart + wrapped.length;
    expect(result.selStart).toBe(expectedStart);
    expect(result.selEnd).toBe(expectedEnd);
    expect(result.text.slice(result.selStart, result.selEnd)).toBe(wrapped);
  });

  it('wraps a selection in {teal:...}', () => {
    const text = 'Snížíme nájmy o třetinu';
    const selStart = text.indexOf('třetinu');
    const selEnd = selStart + 'třetinu'.length;

    const result = wrapAccent(text, selStart, selEnd, 'teal');

    expect(result.text).toBe('Snížíme nájmy o {teal:třetinu}');
    const wrapped = '{teal:třetinu}';
    const expectedStart = result.text.indexOf(wrapped);
    expect(result.selStart).toBe(expectedStart);
    expect(result.selEnd).toBe(expectedStart + wrapped.length);
  });

  it('is a no-op when the selection is empty (selStart === selEnd)', () => {
    const text = 'Snížíme nájmy o třetinu';
    const result = wrapAccent(text, 5, 5, 'lime');

    expect(result.text).toBe(text);
    expect(result.selStart).toBe(5);
    expect(result.selEnd).toBe(5);
  });

  it('wraps a selection at the very start of the string', () => {
    const text = 'nájmy o třetinu';
    const result = wrapAccent(text, 0, 5, 'lime');

    expect(result.text).toBe('{lime:nájmy} o třetinu');
    expect(result.selStart).toBe(0);
    expect(result.selEnd).toBe('{lime:nájmy}'.length);
  });

  it('wraps a selection at the very end of the string', () => {
    const text = 'Snížíme nájmy';
    const selStart = text.indexOf('nájmy');
    const result = wrapAccent(text, selStart, text.length, 'teal');

    expect(result.text).toBe('Snížíme {teal:nájmy}');
    expect(result.text.endsWith('{teal:nájmy}')).toBe(true);
    expect(result.selEnd).toBe(result.text.length);
  });

  it('clamps out-of-range selection bounds into [0, text.length]', () => {
    const text = 'nájmy';
    const result = wrapAccent(text, -10, 999, 'lime');

    expect(result.text).toBe('{lime:nájmy}');
    expect(result.selStart).toBe(0);
    expect(result.selEnd).toBe(result.text.length);
  });

  it('swaps a reversed selection range (selStart > selEnd)', () => {
    const text = 'Snížíme nájmy o třetinu';
    const start = text.indexOf('nájmy');
    const end = start + 'nájmy'.length;

    const result = wrapAccent(text, end, start, 'lime'); // reversed

    expect(result.text).toBe('Snížíme {lime:nájmy} o třetinu');
  });
});

describe('stripAccents', () => {
  it('removes lime and teal wrappers, keeping the inner text', () => {
    expect(stripAccents('a {lime:b} c {teal:d}')).toBe('a b c d');
  });

  it('is a no-op on plain text with no accents', () => {
    expect(stripAccents('plain text')).toBe('plain text');
  });

  it('handles multiple accents of the same color', () => {
    expect(stripAccents('{lime:one} and {lime:two}')).toBe('one and two');
  });
});

// Core declares no accent slots, so stripAccents must not know one brand's:
// any brand-declared key (the accent-parser's open `{Key:…}` grammar) strips.
describe('stripAccents is accent-key agnostic', () => {
  it('strips a key core has never heard of', () => {
    expect(stripAccents('a {gold:b} c {rust-2:d}')).toBe('a b c d');
  });

  it('leaves a non-accent brace expression alone', () => {
    expect(stripAccents('a {1:b}')).toBe('a {1:b}');
  });
});
