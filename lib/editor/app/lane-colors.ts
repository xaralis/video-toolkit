import { EDITOR_ACCENT } from '../host/ui';

/** The lane-colour rules, in one place because both the core map
 *  (LayeredTimeline) and the fallback generator (editor-meta) must obey them.
 *
 *  Rule 1 is load-bearing: the accent means active/selected, so no lane may
 *  wear it — this holds even when it costs separation between lanes.
 *  Rule 2 used to mean a narrow cool arc adjacent to the accent — that read
 *  as "harmonious" but was rejected for producing too few distinguishable
 *  colours (every lane a shade of blue). It now spans the WHOLE wheel minus
 *  the guard band around the accent (`ARC`, below) — the "family" the set
 *  reads as is held instead by a common saturation and lightness shared
 *  across every entry (see `CORE_LANE_COLOR` in LayeredTimeline.tsx and
 *  `stableColor` in editor-meta.ts), not by proximity in hue. */

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
// everything else. `hueInArc` (editor-meta.ts) and every hand-picked
// `CORE_LANE_COLOR` entry (LayeredTimeline.tsx) still have to clear the guard
// band on top of this — this bound alone does not enforce Rule 1, the
// dedicated "never puts a lane on the accent hue" test does.
export const ARC: readonly [number, number] = [0, 360];

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const sf = s / 100;
  const lf = l / 100;
  const c = (1 - Math.abs(2 * lf - 1)) * sf;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lf - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

/** "Redmean" — a cheap, well-known stand-in for CIEDE2000: weights R/B by the
 *  pair's mean red level and always weights G highest, since the eye is most
 *  sensitive to green. Used both to keep `CORE_LANE_COLOR` entries
 *  distinguishable (`lane-colors.test.ts`) and to validate `stableColor`'s
 *  fallback separation (`editor-meta.test.ts`) — one measure, shared, rather
 *  than two ad-hoc ones that could quietly drift apart. */
export function redmean(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const rMean = (a.r + b.r) / 2;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt((2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db);
}
