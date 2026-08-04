import { EDITOR_ACCENT } from '../host/ui';

/** The lane-colour rules, in one place because both the core map
 *  (LayeredTimeline) and the curated palette + fallback hash (editor-meta,
 *  `LANE_PALETTE` / `stableColor`) must obey them.
 *
 *  Rule 1 is load-bearing: the accent means active/selected, so no lane may
 *  wear it — this holds even when it costs separation between lanes.
 *  Rule 2 used to mean a narrow cool arc adjacent to the accent — that read
 *  as "harmonious" but was rejected for producing too few distinguishable
 *  colours (every lane a shade of blue). It now spans the WHOLE wheel minus
 *  the guard band around the accent (`ARC`, below) — the "family" the set
 *  reads as is held instead by a common saturation and lightness shared
 *  across every entry (see `CORE_LANE_COLOR` in LayeredTimeline.tsx and
 *  `LANE_PALETTE` in editor-meta.ts), not by proximity in hue.
 *
 *  `hueOf`, `ACCENT_HUE`, and `HUE_GUARD` used to also feed a farthest-point
 *  sampling GENERATOR in editor-meta.ts (deleted — see `LANE_PALETTE`'s own
 *  comment there): every candidate hue it produced was constrained to clear
 *  the guard band before selection ever ran, so Rule 1 held BY CONSTRUCTION.
 *  Now that the palette is a hand-authored literal, these three exports are
 *  pure VALIDATOR inputs instead — `editor-meta.test.ts` uses them to assert
 *  that every `LANE_PALETTE` entry clears the guard band, the same way
 *  `lane-colors.test.ts` already asserted it for `CORE_LANE_COLOR`. Nothing
 *  here still constrains a generator at hue-selection time; the guarantee
 *  moved from "cannot be built any other way" to "would fail a test if hand-
 *  edited wrong" — the trade a curated list makes on purpose. */

/** Hue in degrees. `null` means "achromatic" (a neutral slate — genuinely has
 *  no hue, exempt from both rules below). Anything that fails to parse as a
 *  6-digit `#rrggbb` hex — a `#rgb` shorthand, an `rgb()`/`hsl()` string, a
 *  named colour — returns `NaN` instead of `null`. This distinction matters:
 *  `null` is treated as "nothing to check", so if unparseable input also
 *  returned `null` it would silently clear both rules for a value that was
 *  never actually checked. `NaN` fails every numeric comparison, so it makes
 *  both rules fail loudly instead. */
export function hueOf(hex: string): number | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return NaN;
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

// ACCENT_HUE is DERIVED from the actual accent colour, not hand-picked — a
// hardcoded 258 quietly drifted from `EDITOR_ACCENT`'s real hue (251.78 for
// `#7c5cff`, measured with this file's own `hueOf`) and the guard band it
// anchors would silently decouple the next time the accent changes. Both
// `video-broll` and `video-card` in LayeredTimeline's CORE_LANE_COLOR were
// re-picked once this correction was in, because they landed inside the
// guard band measured against the TRUE hue even though they cleared it
// against the old hardcoded one.
const accentHue = hueOf(EDITOR_ACCENT);
if (accentHue === null || Number.isNaN(accentHue)) {
  throw new Error(`EDITOR_ACCENT (${EDITOR_ACCENT}) must be a well-formed, chromatic hex colour`);
}
export const ACCENT_HUE = accentHue;
export const HUE_GUARD = 25;
// The whole wheel, minus the guard band around the accent (Rule 1, above) —
// widened from a narrow cool arc ([190, 280]) that was this file's own
// addition for "harmony." The user saw the result — every lane a shade of
// blue — and rejected it: only Rule 1 is load-bearing, so the usable space is
// everything else. Every hand-picked `CORE_LANE_COLOR` entry
// (LayeredTimeline.tsx) and every `LANE_PALETTE` entry (editor-meta.ts)
// still have to clear the guard band on top of this — this bound alone does
// not enforce Rule 1, the dedicated "never puts a lane on the accent hue" /
// guard-band tests do. Now a trivial [0, 360) sanity bound rather than a
// generator's candidate span (see the module comment above for why), kept
// because `lane-colors.test.ts` still reads it as a belt-and-braces check on
// `hueOf`'s own contract.
export const ARC: readonly [number, number] = [0, 360];

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** "Redmean" — a cheap, well-known stand-in for CIEDE2000: weights R/B by the
 *  pair's mean red level and always weights G highest, since the eye is most
 *  sensitive to green. Used to keep `CORE_LANE_COLOR` entries distinguishable
 *  (`lane-colors.test.ts`). `LANE_PALETTE` (editor-meta.ts) is checked in
 *  plain hue degrees instead — a curated 18-entry list has no candidate pool
 *  to measure in RGB space, so `editor-meta.test.ts` no longer needs this. */
export function redmean(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const rMean = (a.r + b.r) / 2;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt((2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db);
}
