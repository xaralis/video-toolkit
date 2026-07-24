// lib/editor/src/palette.test.ts — tests @video-toolkit/lib/theming/palette
// (co-located under lib/editor/src so Vitest, rooted here, discovers it).
import { describe, it, expect } from 'vitest';
import { paletteMap, resolveAccentColor, type AccentSlot } from '@video-toolkit/lib/theming/palette';

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
