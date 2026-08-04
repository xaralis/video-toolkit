/**
 * WCAG contrast maths, used to keep the editor's on-colour text legible.
 *
 * This exists because "does black-on-purple read?" is not a matter of taste
 * that a review can settle by looking: the editor's accent (`#7c5cff`) sits at
 * mid luminance, where BOTH black and white land near 4.3:1 — under the 4.5:1
 * floor for normal text, and visibly muddy at the 10-13px the editor uses.
 * Guessing a replacement by eye reproduces the same problem, so the token pairs
 * are checked by `contrast.test.ts` instead.
 */

/** sRGB relative luminance, per WCAG 2.x. Returns `null` for a hex it cannot read. */
export function relativeLuminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = channel((n >> 16) & 255);
  const g = channel((n >> 8) & 255);
  const b = channel(n & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio (1-21). Returns `null` if either colour is unreadable. */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA for normal-size text. The editor's on-colour labels are 10-13px,
 *  so this is the floor that applies — not the 3:1 large-text one. */
export const AA_NORMAL = 4.5;
