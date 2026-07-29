
/** One brand-declared accent slot: the {key:…} markup key, its editor label,
 *  and the hex color an accented run renders in. */
export interface AccentSlot {
  key: string;
  label: string;
  color: string;
}

/** Build a key→hex lookup from a brand's slots. */
export function paletteMap(slots: readonly AccentSlot[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const s of slots) map[s.key] = s.color;
  return map;
}

/** Resolve one accent key to its hex, or null when the key is unknown or the
 *  run is unaccented (key === null). */
export function resolveAccentColor(slots: readonly AccentSlot[], key: string | null): string | null {
  if (key === null) return null;
  return paletteMap(slots)[key] ?? null;
}

/** True when `s` is a CSS hex colour LITERAL (a `#` followed by 3, 4, 6, or 8
 *  hex digits — the shorthand, shorthand+alpha, standard, and
 *  standard+alpha forms) rather than a brand accent-slot key. Shape only,
 *  same idiom the editor's own `ColorField` swatch already uses
 *  (`lib/editor/app/LayeredInspector.tsx`) — not a new convention, just the
 *  render-side use of the existing one. An accent-slot key is brand-chosen
 *  free text (`'coal'`, `'gold'`), so anything NOT shaped like `#…` is
 *  unambiguously a key, never a colour this function mistakes for one.
 *
 *  All FOUR CSS hex lengths, not just 3/6/8: a real 4-digit `#RGBA` literal
 *  used to fail this (rejecting a valid colour, not just a shorthand one),
 *  which made it resolve as an unrecognised accent key instead — warned
 *  about, not silent, but still the wrong vocabulary for a value that was
 *  never a key at all. */
export function isColorLiteral(s: string): boolean {
  return /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]|[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?$/.test(s);
}

/**
 * Resolve a `color` field that accepts EITHER a brand accent-slot key OR a
 * literal colour (hex) — the dual form `fade-to-color.color` and `wipe.color`
 * widened to since Phase 4 (see `AccentOrColorHex` in
 * `lib/reel-config-base/transition-schema.ts`). A literal is used AS-IS: no
 * palette lookup, and therefore no possibility of "unresolved" — it IS the
 * colour. Anything else is treated as an accent-slot key and resolved exactly
 * as `resolveAccentColor` does (including returning `null` when the brand
 * never declared that slot, or when no palette was threaded in at all).
 *
 * This is what lets a brand for whom the colour is genuinely NOT an accent
 * (PP's `coal`, a background token in its own model) write the hex directly
 * instead of declaring a fake accent slot to satisfy a schema that used to
 * accept only a key.
 */
export function resolveAccentOrColor(slots: readonly AccentSlot[], key: string | null): string | null {
  if (key === null) return null;
  if (isColorLiteral(key)) return key;
  return resolveAccentColor(slots, key);
}
