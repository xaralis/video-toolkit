/** The lane-colour rules, in one place because both the core map
 *  (LayeredTimeline) and the fallback generator (editor-meta) must obey them.
 *
 *  Rule 1 is load-bearing: the accent means active/selected, so no lane may
 *  wear it — this holds even when it costs separation between lanes.
 *  Rule 2 keeps the set harmonious: one cool arc, adjacent to the accent,
 *  minus a guard band around the accent itself. */
export const ACCENT_HUE = 258;
export const HUE_GUARD = 25;
export const ARC: readonly [number, number] = [190, 280];

/** Hue in degrees, or null for an achromatic colour (a neutral slate), which
 *  is exempt from both rules — it has no hue to clash with. */
export function hueOf(hex: string): number | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 0.04) return null; // achromatic
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}
