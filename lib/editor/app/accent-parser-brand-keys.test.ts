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
  it('parses two different brand-declared keys in one string', () => {
    expect(parseAccents('{gold:TODAY} vs {sky:OUR PLAN}.')).toEqual([
      { text: '', color: null },
      { text: 'TODAY', color: 'gold' },
      { text: ' vs ', color: null },
      { text: 'OUR PLAN', color: 'sky' },
      { text: '.', color: null },
    ]);
  });

  it('parses any brand-declared key (core enumerates none)', () => {
    expect(parseAccents('Plain {gold:hi}.')).toEqual([
      { text: 'Plain ', color: null },
      { text: 'hi', color: 'gold' },
      { text: '.', color: null },
    ]);
  });
});

describe('applyBrandEndpoint (caller-supplied endpoint slot)', () => {
  it('wraps the endpoint in the brand slot key it is given', () => {
    expect(applyBrandEndpoint('x.', 'sig')).toBe('x{sig:.}');
  });

  it('disables the rule when endpointKey is undefined — core injects no slot', () => {
    expect(applyBrandEndpoint('x.', undefined)).toBe('x.');
  });
});
