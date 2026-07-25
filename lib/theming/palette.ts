
/** One brand-declared accent slot: the {key:…} markup key, its editor label,
 *  and the hex color an accented run renders in. */
export interface AccentSlot {
  key: string;
  label: string;
  color: string;
}

/** Build a key→hex lookup from a brand's slots. */
export function paletteMap(slots: AccentSlot[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const s of slots) map[s.key] = s.color;
  return map;
}

/** Resolve one accent key to its hex, or null when the key is unknown or the
 *  run is unaccented (key === null). */
export function resolveAccentColor(slots: AccentSlot[], key: string | null): string | null {
  if (key === null) return null;
  return paletteMap(slots)[key] ?? null;
}
