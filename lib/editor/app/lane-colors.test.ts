import { describe, it, expect } from 'vitest';
import { CORE_LANE_COLOR } from './LayeredTimeline';
import { ACCENT_HUE, HUE_GUARD, ARC, hueOf, hexToRgb, redmean } from './lane-colors';
import { EDITOR_ACCENT } from '../host/ui';

describe('lane colours', () => {
  const entries = Object.entries(CORE_LANE_COLOR);

  it('has at least one entry per core lane kind', () => {
    expect(entries.length).toBeGreaterThanOrEqual(10);
  });

  it('derives ACCENT_HUE from the real accent colour, not a hardcoded guess', () => {
    // Re-derive independently rather than trusting the constant: this is
    // exactly the class of bug that shipped once (a hardcoded 258 next to a
    // `#7c5cff` accent whose real hue is ~251.78).
    expect(ACCENT_HUE).toBeCloseTo(hueOf(EDITOR_ACCENT) as number, 6);
  });

  // Rule 1, load-bearing: the accent means "selected". A lane permanently
  // wearing it destroys that signal.
  it('never puts a lane on the accent hue', () => {
    for (const [id, hex] of entries) {
      const h = hueOf(hex);
      if (h === null) continue; // a neutral slate has no meaningful hue
      const d = Math.min(Math.abs(h - ACCENT_HUE), 360 - Math.abs(h - ACCENT_HUE));
      expect(d, `${id} (${hex}) is ${d.toFixed(0)}deg from the accent`).toBeGreaterThanOrEqual(HUE_GUARD);
    }
  });

  it('draws every coloured lane from the declared arc', () => {
    for (const [id, hex] of entries) {
      const h = hueOf(hex);
      if (h === null) continue;
      expect(h, `${id} (${hex})`).toBeGreaterThanOrEqual(ARC[0]);
      expect(h, `${id} (${hex})`).toBeLessThanOrEqual(ARC[1]);
    }
  });

  // The owner's actual stated goal: not just "not on the accent" and "not
  // outside the arc", but genuinely tellable apart from each other. Neither
  // rule above checks this — two lanes could each individually clear both
  // and still be indistinguishable from one another.
  it('keeps every pair of distinct lane colours visually separated', () => {
    // The three achromatic slates (video-outro, brand-watermark,
    // brand-disclaimer) are DELIBERATELY the same '#4a4c54' — that is not a
    // collision to flag, so compare only the chromatic entries, and only
    // across distinct hex values.
    const chromatic = entries.filter(([, hex]) => hueOf(hex) !== null);
    const distinctByHex = new Map<string, string>();
    for (const [id, hex] of chromatic) if (!distinctByHex.has(hex)) distinctByHex.set(hex, id);
    const distinct = [...distinctByHex.entries()].map(([hex, id]) => ({ id, hex, rgb: hexToRgb(hex)! }));
    // Measured worst pair at time of writing is ~117.6 (audio vs music, the
    // second re-pick across the widened ARC — see LayeredTimeline.tsx's
    // CORE_LANE_COLOR comment); 100 leaves real margin under that without
    // being so tight that a future, still-reasonable re-pick flakes this.
    const MIN_SEPARATION = 100;
    for (let i = 0; i < distinct.length; i += 1) {
      for (let j = i + 1; j < distinct.length; j += 1) {
        const d = redmean(distinct[i].rgb, distinct[j].rgb);
        expect(d, `${distinct[i].id} (${distinct[i].hex}) vs ${distinct[j].id} (${distinct[j].hex})`).toBeGreaterThanOrEqual(
          MIN_SEPARATION,
        );
      }
    }
  });
});

describe('hueOf', () => {
  it('returns null only for a genuinely achromatic, well-formed hex', () => {
    expect(hueOf('#4a4c54')).toBeNull();
    expect(hueOf('#000000')).toBeNull();
    expect(hueOf('#ffffff')).toBeNull();
  });

  it('returns NaN — not null — for anything that fails to parse as #rrggbb', () => {
    // Before this fix, an unparseable value (a shorthand, an rgb()/hsl()
    // string, a typo) hit the same `if (!m) return null` branch as a real
    // achromatic colour, so it silently passed both rules in the
    // `describe('lane colours')` block above instead of failing. NaN fails
    // every numeric comparison, so it fails loudly instead.
    expect(hueOf('#75f')).toBeNaN();
    expect(hueOf('rgb(124, 92, 255)')).toBeNaN();
    expect(hueOf('violet')).toBeNaN();
    expect(hueOf('not-a-colour')).toBeNaN();
  });

  it('returns a real hue for a well-formed chromatic hex', () => {
    expect(hueOf('#7c5cff')).toBeCloseTo(251.78, 1);
  });
});
