import { describe, expect, it } from 'vitest';
import { parseAccents, applyBrandEndpoint } from './accent-parser';

describe('parseAccents', () => {
  it('returns plain text as one token', () => {
    expect(parseAccents('Hello world.')).toEqual([
      { text: 'Hello world.', color: null }
    ]);
  });
  it('parses single {lime:phrase}', () => {
    expect(parseAccents('Postavíme {lime:200 nových bytů} na Dukle.')).toEqual([
      { text: 'Postavíme ', color: null },
      { text: '200 nových bytů', color: 'lime' },
      { text: ' na Dukle.', color: null },
    ]);
  });
  it('parses multiple accents', () => {
    expect(parseAccents('{lime:DNES} vs {teal:NÁŠ NÁVRH}.')).toEqual([
      { text: '',          color: null },
      { text: 'DNES',      color: 'lime' },
      { text: ' vs ',      color: null },
      { text: 'NÁŠ NÁVRH', color: 'teal' },
      { text: '.',         color: null },
    ]);
  });
  it('ignores unknown color names — kept as literal', () => {
    expect(parseAccents('Plain {purple:bad}.')).toEqual([
      { text: 'Plain {purple:bad}.', color: null },
    ]);
  });
});

describe('applyBrandEndpoint', () => {
  it('wraps trailing period as teal', () => {
    expect(applyBrandEndpoint('Bariéra pro lidi.')).toBe('Bariéra pro lidi{teal:.}');
  });
  it('wraps trailing period after a lime accent block', () => {
    expect(applyBrandEndpoint('Stačí {lime:málo}.')).toBe('Stačí {lime:málo}{teal:.}');
  });
  it('leaves text without trailing period unchanged', () => {
    expect(applyBrandEndpoint('No period at the end')).toBe('No period at the end');
  });
  it('leaves period inside accent block unchanged', () => {
    expect(applyBrandEndpoint('{teal:Hello.}')).toBe('{teal:Hello.}');
  });
  it('leaves already-wrapped endpoint unchanged', () => {
    expect(applyBrandEndpoint('Hello{teal:.}')).toBe('Hello{teal:.}');
  });
  it('leaves trailing `!` and `?` alone (authorial signal)', () => {
    expect(applyBrandEndpoint('Hello!')).toBe('Hello!');
    expect(applyBrandEndpoint('Hello?')).toBe('Hello?');
  });
});
