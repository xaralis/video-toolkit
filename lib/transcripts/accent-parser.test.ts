import { describe, expect, it } from 'vitest';
import { parseAccents, applyBrandEndpoint } from './accent-parser';

describe('parseAccents', () => {
  it('returns plain text as one token', () => {
    expect(parseAccents('Hello world.')).toEqual([
      { text: 'Hello world.', color: null }
    ]);
  });
  it('parses a single {key:phrase} block', () => {
    expect(parseAccents('We build {gold:200 new homes} downtown.')).toEqual([
      { text: 'We build ', color: null },
      { text: '200 new homes', color: 'gold' },
      { text: ' downtown.', color: null },
    ]);
  });
  it('parses multiple accents with different slot keys', () => {
    expect(parseAccents('{gold:TODAY} vs {sky:OUR PLAN}.')).toEqual([
      { text: '',         color: null },
      { text: 'TODAY',    color: 'gold' },
      { text: ' vs ',     color: null },
      { text: 'OUR PLAN', color: 'sky' },
      { text: '.',        color: null },
    ]);
  });
  it('parses any brand-declared key (the set is never enumerated by core)', () => {
    expect(parseAccents('Plain {gold:hi}.')).toEqual([
      { text: 'Plain ', color: null },
      { text: 'hi', color: 'gold' },
      { text: '.', color: null },
    ]);
  });

  it('does not match a key that does not start with a letter', () => {
    expect(parseAccents('Plain {1nvalid:bad}.')).toEqual([
      { text: 'Plain {1nvalid:bad}.', color: null },
    ]);
  });
});

describe('applyBrandEndpoint', () => {
  it('wraps a trailing period in the caller-supplied slot key', () => {
    expect(applyBrandEndpoint('A barrier for people.', 'sig')).toBe('A barrier for people{sig:.}');
  });
  it('wraps trailing period after an accent block', () => {
    expect(applyBrandEndpoint('It takes {gold:little}.', 'sig')).toBe('It takes {gold:little}{sig:.}');
  });
  it('leaves text without trailing period unchanged', () => {
    expect(applyBrandEndpoint('No period at the end', 'sig')).toBe('No period at the end');
  });
  it('leaves period inside accent block unchanged', () => {
    expect(applyBrandEndpoint('{sig:Hello.}', 'sig')).toBe('{sig:Hello.}');
  });
  it('leaves already-wrapped endpoint unchanged', () => {
    expect(applyBrandEndpoint('Hello{sig:.}', 'sig')).toBe('Hello{sig:.}');
  });
  it('leaves trailing `!` and `?` alone (authorial signal)', () => {
    expect(applyBrandEndpoint('Hello!', 'sig')).toBe('Hello!');
    expect(applyBrandEndpoint('Hello?', 'sig')).toBe('Hello?');
  });

  it('disables the rule when endpointKey is undefined (no core default slot)', () => {
    expect(applyBrandEndpoint('x.', undefined)).toBe('x.');
  });

  it('disables the rule when endpointKey is empty', () => {
    expect(applyBrandEndpoint('x.', '')).toBe('x.');
  });
});
