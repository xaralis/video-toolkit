import { describe, it, expect } from 'vitest';
import { CORE_LANE_COLOR } from './LayeredTimeline';
import { ACCENT_HUE, HUE_GUARD, ARC, hueOf } from './lane-colors';

describe('lane colours', () => {
  const entries = Object.entries(CORE_LANE_COLOR);

  it('has at least one entry per core lane kind', () => {
    expect(entries.length).toBeGreaterThanOrEqual(10);
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
});
