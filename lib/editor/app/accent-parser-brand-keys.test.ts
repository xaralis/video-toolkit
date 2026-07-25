import { describe, expect, it } from 'vitest';
import { parseAccents, applyBrandEndpoint } from '@video-toolkit/lib/transcripts/accent-parser';

/**
 * Mirrors lib/transcripts/accent-parser.test.ts. That file has no local
 * vitest runner of its own (lib/transcripts is a plain shared module,
 * consumed via the `@video-toolkit/lib` alias by projects that do have a
 * runner, like this one) — so the generalized-key + parameterized-endpoint
 * behavior added for brand-driven accents is duplicated here to get actual
 * CI coverage under `cd lib/editor && npx vitest run`.
 */
describe('parseAccents (brand-driven keys)', () => {
  it('still parses lime/teal unchanged (back-compat)', () => {
    expect(parseAccents('{lime:DNES} vs {teal:NÁŠ NÁVRH}.')).toEqual([
      { text: '', color: null },
      { text: 'DNES', color: 'lime' },
      { text: ' vs ', color: null },
      { text: 'NÁŠ NÁVRH', color: 'teal' },
      { text: '.', color: null },
    ]);
  });

  it('parses a new, non-lime/teal brand-declared key', () => {
    expect(parseAccents('Plain {gold:hi}.')).toEqual([
      { text: 'Plain ', color: null },
      { text: 'hi', color: 'gold' },
      { text: '.', color: null },
    ]);
  });
});

describe('applyBrandEndpoint (parameterized endpoint slot)', () => {
  it('defaults to teal when called with one arg (back-compat)', () => {
    expect(applyBrandEndpoint('x.')).toBe('x{teal:.}');
  });

  it('wraps the endpoint in an explicitly-given brand slot key', () => {
    expect(applyBrandEndpoint('x.', 'coal')).toBe('x{coal:.}');
  });

  it('disables the rule when endpointKey is explicitly undefined', () => {
    expect(applyBrandEndpoint('x.', undefined)).toBe('x.');
  });
});
