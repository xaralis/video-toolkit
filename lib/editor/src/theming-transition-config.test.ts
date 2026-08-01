// `transitionConfig` — Phase 4 Task 1.5's fourth-axis config accessor.
//
// The transition axis got a registry in Task 1.2 but no theme-level config
// accessor, so it was the one axis of four a caller holding a `BrandTheme` could
// not ask "what config did the brand register for this kind?" without reaching
// into `theme.transitions?.[kind]?.config` by hand — which is the fifth
// hand-rolled lookup lib/theming/registry.ts exists to prevent.
//
// Pinned by REACHING a registration's config, not by existing: a stub returning
// undefined would satisfy a shape test.
import { describe, it, expect } from 'vitest';
import { transitionConfig, videoConfig, overlayConfig } from '@video-toolkit/lib/theming/brand-theme';
import { effectConfig } from '@video-toolkit/lib/theming/effects';
import type { BrandTheme } from '@video-toolkit/lib/theming/types';

describe('transitionConfig', () => {
  it('reaches the config a brand registered for a transition kind', () => {
    const theme: BrandTheme = {
      accentSlots: [],
      transitions: { swirl: { renderer: () => null, config: { turns: 3 } } },
    };
    expect(transitionConfig(theme, 'swirl')).toEqual({ turns: 3 });
  });

  it('reaches it on a CONFIG-ONLY registration too — config does not require a renderer', () => {
    const theme: BrandTheme = { accentSlots: [], transitions: { dissolve: { config: { soft: true } } } };
    expect(transitionConfig(theme, 'dissolve')).toEqual({ soft: true });
  });

  it('is undefined for an unregistered kind and for a theme with no registry', () => {
    const theme: BrandTheme = { accentSlots: [], transitions: { swirl: { config: { turns: 3 } } } };
    expect(transitionConfig(theme, 'fade')).toBeUndefined();
    expect(transitionConfig({ accentSlots: [] }, 'swirl')).toBeUndefined();
  });
});

// `videoConfig` was the ONE accessor of four that restated the lookup inline
// instead of calling `registrationConfig`. Routing it through the shared helper
// is a BEHAVIOURALLY UNOBSERVABLE refactor — both forms are
// `registry?.[kind]?.config` — so no test can pin "it goes through the helper",
// and this file does not claim to. What it pins is weaker and honest: all four
// accessors answer identically for the same three registration shapes, so a
// FUTURE divergence on any one of them is caught.
//
// ONE `it` PER ACCESSOR, deliberately. Grouping all four into one assertion
// block would make a helper-level mutation red regardless of which accessor
// actually calls the helper — the failure would say nothing about which axis
// broke. Split, a regression is localised to its own axis.
describe('all four axes’ config accessors answer alike', () => {
  const CONFIG = { k: 1 };
  const bare: BrandTheme = { accentSlots: [] };

  describe('returns the registered config', () => {
    it('overlay', () => expect(overlayConfig({ accentSlots: [], overlays: { text: { config: CONFIG } } }, 'text')).toEqual(CONFIG));
    it('video', () => expect(videoConfig({ accentSlots: [], video: { clip: { config: CONFIG } } }, 'clip')).toEqual(CONFIG));
    it('effect', () => expect(effectConfig({ accentSlots: [], effects: { grain: { config: CONFIG } } }, 'grain')).toEqual(CONFIG));
    it('transition', () => expect(transitionConfig({ accentSlots: [], transitions: { swirl: { config: CONFIG } } }, 'swirl')).toEqual(CONFIG));
  });

  describe('returns undefined for a registration that carries no config', () => {
    it('overlay', () => expect(overlayConfig({ accentSlots: [], overlays: { text: {} } }, 'text')).toBeUndefined());
    it('video', () => expect(videoConfig({ accentSlots: [], video: { clip: {} } }, 'clip')).toBeUndefined());
    it('effect', () => expect(effectConfig({ accentSlots: [], effects: { grain: {} } }, 'grain')).toBeUndefined());
    it('transition', () => expect(transitionConfig({ accentSlots: [], transitions: { swirl: {} } }, 'swirl')).toBeUndefined());
  });

  describe('returns undefined when the axis has no registry at all', () => {
    it('overlay', () => expect(overlayConfig(bare, 'text')).toBeUndefined());
    it('video', () => expect(videoConfig(bare, 'clip')).toBeUndefined());
    it('effect', () => expect(effectConfig(bare, 'grain')).toBeUndefined());
    it('transition', () => expect(transitionConfig(bare, 'swirl')).toBeUndefined());
  });
});
