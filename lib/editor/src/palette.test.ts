// lib/editor/src/palette.test.ts — tests @video-toolkit/lib/theming/palette
// (co-located under lib/editor/src so Vitest, rooted here, discovers it).
import { describe, it, expect } from 'vitest';
import {
  isColorLiteral,
  paletteMap,
  resolveAccentColor,
  resolveAccentOrColor,
  type AccentSlot,
} from '@video-toolkit/lib/theming/palette';

const SLOTS: AccentSlot[] = [
  { key: 'gold', label: 'Gold', color: '#f6aa1c' },
  { key: 'rust', label: 'Rust', color: '#7b190a' },
];

describe('paletteMap', () => {
  it('builds a key→hex lookup', () => {
    expect(paletteMap(SLOTS)).toEqual({ gold: '#f6aa1c', rust: '#7b190a' });
  });
});

describe('resolveAccentColor', () => {
  it('resolves a known key to its hex', () => {
    expect(resolveAccentColor(SLOTS, 'gold')).toBe('#f6aa1c');
  });
  it('returns null for an unknown key', () => {
    expect(resolveAccentColor(SLOTS, 'lime')).toBeNull();
  });
  it('returns null for a null key (unaccented run)', () => {
    expect(resolveAccentColor(SLOTS, null)).toBeNull();
  });
});

// isColorLiteral / resolveAccentOrColor — the widening that lets a transition's
// `color` param be EITHER a brand accent-slot key OR a literal colour (hex),
// so a brand whose colour is genuinely not an accent (PP's `coal`, a
// background token in its own model) can write the hex directly instead of
// declaring a fake accent slot to satisfy core's type.
describe('isColorLiteral', () => {
  it('recognises 3/6/8-digit hex forms', () => {
    expect(isColorLiteral('#000')).toBe(true);
    expect(isColorLiteral('#0a0a0a')).toBe(true);
    expect(isColorLiteral('#0a0a0aff')).toBe(true);
  });
  it('rejects an accent-slot key — any bare word is a key, not a literal', () => {
    expect(isColorLiteral('coal')).toBe(false);
    expect(isColorLiteral('gold')).toBe(false);
    expect(isColorLiteral('no-such-slot')).toBe(false);
  });
  it('rejects malformed hex', () => {
    expect(isColorLiteral('#gggggg')).toBe(false);
    expect(isColorLiteral('#12345')).toBe(false);
    expect(isColorLiteral('000000')).toBe(false);
  });
});

describe('resolveAccentOrColor', () => {
  it('THE CAPABILITY: a literal resolves to itself, with no palette lookup at all', () => {
    // Proven by an EMPTY slots list: resolveAccentColor([], '#0a0a0a') would
    // return null (no slot named '#0a0a0a'), so this passing is the literal
    // path, not a lucky palette hit.
    expect(resolveAccentOrColor([], '#0a0a0a')).toBe('#0a0a0a');
  });
  it('a literal wins even when a slot of the same NAME does not exist', () => {
    expect(resolveAccentOrColor(SLOTS, '#123456')).toBe('#123456');
  });
  it('an accent key still resolves through the palette — the parity half', () => {
    expect(resolveAccentOrColor(SLOTS, 'gold')).toBe('#f6aa1c');
  });
  it('an unresolvable accent key still returns null', () => {
    expect(resolveAccentOrColor(SLOTS, 'no-such-slot')).toBeNull();
  });
  it('returns null for a null key (unaccented run)', () => {
    expect(resolveAccentOrColor(SLOTS, null)).toBeNull();
  });
});
