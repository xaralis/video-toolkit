import React from 'react';
import { describe, it, expect } from 'vitest';
import { resolveVideoRenderer, videoConfig, SegmentMedia } from '@video-toolkit/lib/theming';
import type { BrandTheme, VideoRenderProps } from '@video-toolkit/lib/theming';

const CustomClipRenderer: React.FC<VideoRenderProps> = () => null;

describe('resolveVideoRenderer', () => {
  it('returns the brand-custom renderer when registered', () => {
    const theme: BrandTheme = {
      accentSlots: [],
      video: { clip: { renderer: CustomClipRenderer, config: { a: 1 } } },
    };
    expect(resolveVideoRenderer(theme, 'clip')).toBe(CustomClipRenderer);
  });

  it('falls back to SegmentMedia when the kind is not registered', () => {
    const theme: BrandTheme = { accentSlots: [] };
    expect(resolveVideoRenderer(theme, 'clip')).toBe(SegmentMedia);
  });

  it('falls back to SegmentMedia for all unregistered kinds', () => {
    const theme: BrandTheme = {
      accentSlots: [],
      video: { clip: { renderer: CustomClipRenderer } },
    };
    expect(resolveVideoRenderer(theme, 'broll')).toBe(SegmentMedia);
    expect(resolveVideoRenderer(theme, 'photo')).toBe(SegmentMedia);
  });
});

describe('videoConfig', () => {
  it('returns the registered config, or undefined when none', () => {
    const withCfg: BrandTheme = {
      accentSlots: [],
      video: { clip: { renderer: CustomClipRenderer, config: { a: 1 } } },
    };
    const noCfg: BrandTheme = { accentSlots: [] };
    expect(videoConfig(withCfg, 'clip')).toEqual({ a: 1 });
    expect(videoConfig(noCfg, 'clip')).toBeUndefined();
  });
});
