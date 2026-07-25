import React from 'react';
import { describe, it, expect } from 'vitest';
import { resolveOverlayRenderer, overlayConfig } from '@video-toolkit/lib/theming/brand-theme';
import { GenericTextOverlay } from '@video-toolkit/lib/theming/generic/GenericTextOverlay';
import type { BrandTheme, OverlayRenderProps } from '@video-toolkit/lib/theming/types';

const CustomText: React.FC<OverlayRenderProps> = () => null;

describe('resolveOverlayRenderer', () => {
  it('returns the brand-custom renderer when registered', () => {
    const theme: BrandTheme = {
      accentSlots: [],
      overlays: { text: { renderer: CustomText, config: { a: 1 } } },
    };
    expect(resolveOverlayRenderer(theme, 'text')).toBe(CustomText);
  });
  it('falls back to the core generic when the kind is not registered', () => {
    const theme: BrandTheme = { accentSlots: [] };
    expect(resolveOverlayRenderer(theme, 'text')).toBe(GenericTextOverlay);
  });
});

describe('overlayConfig', () => {
  it('returns the registered config, or undefined when none', () => {
    const withCfg: BrandTheme = { accentSlots: [], overlays: { text: { renderer: CustomText, config: { a: 1 } } } };
    const noCfg: BrandTheme = { accentSlots: [] };
    expect(overlayConfig(withCfg, 'text')).toEqual({ a: 1 });
    expect(overlayConfig(noCfg, 'text')).toBeUndefined();
  });
});
