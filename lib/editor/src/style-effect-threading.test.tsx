import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Task 3.2 review, round 1 — CRITICAL 1 and CRITICAL 2.
//
// CRITICAL 2: nothing exercised the THREADING of `theme.styleEffects` end to
// end (`renderVideoItemNode` -> `VideoRenderProps.styleEffects` ->
// `SegmentMedia` -> `applyStyleEffects`). Deleting the single line
// `styleEffects={theme.styleEffects}` in `renderVideoItemNode`
// (lib/render/layered-composition.tsx) left the ENTIRE editor suite green —
// a brand's registered style effect would silently fall back to core's own,
// with no test catching it. This file renders through `renderVideoItemNode`
// with a themed `styleEffects` registry and asserts the BRAND'S renderer (not
// core's) is what lands on the element — the exact "vanishes into the core
// generic with no signal" class Phase 4 exists to close.
//
// CRITICAL 1: `MediaStyleFragment.opacity` was declared and multiplied by
// `composeMediaStyle`, but `SegmentMedia` never read it back into the
// rendered `style` — a style effect setting `opacity` changed nothing on
// screen. This file also pins the fix, plus the PARITY case: no style effect
// setting opacity must still omit the `opacity` key entirely (not emit
// `opacity: 1`), so nothing already rendering changes.
// ---------------------------------------------------------------------------

const frameState = vi.hoisted(() => ({ frame: 10 }));
const captured = vi.hoisted(() => ({ img: [] as any[] }));

vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  return {
    ...actual,
    useCurrentFrame: () => frameState.frame,
    useVideoConfig: () => ({ fps: 30 }),
    staticFile: (s: string) => s,
    Img: (props: any) => {
      captured.img.push(props);
      return null;
    },
    OffthreadVideo: () => null,
  };
});

import { renderVideoItemNode } from '@video-toolkit/lib/render/layered-composition';
import type { CompositionTheme } from '@video-toolkit/lib/theming/types';
import type { VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';
import type { StyleEffectRenderer } from '@video-toolkit/lib/theming/effects';

const NO_HANDLES = { inHalf: 0, outHalf: 0 };
const photo = (effects?: VideoItem['effects']): VideoItem => ({
  id: 'p1',
  kind: 'photo',
  startMs: 0,
  endMs: 3000,
  source: 'photos/a.jpg',
  ...(effects ? { effects } : {}),
});

describe('renderVideoItemNode threads theme.styleEffects end-to-end into SegmentMedia (CRITICAL 2)', () => {
  it("a brand's OWN ken-burns registration is what renders — not core's fallback", () => {
    captured.img.length = 0;
    const brandKenBurns = vi.fn(() => ({ transform: 'scale(9.99)' })) as unknown as StyleEffectRenderer;
    const theme = {
      accentSlots: [],
      background: '#000',
      styleEffects: { 'ken-burns': { renderer: brandKenBurns } },
    } as unknown as CompositionTheme;

    const node = renderVideoItemNode(theme, photo([{ type: 'ken-burns', direction: 'in' }]), NO_HANDLES);
    render(<>{node}</>);

    expect(brandKenBurns).toHaveBeenCalled();
    // Core's OWN ken-burns math for `direction: 'in'` at frame 10/90 would
    // produce a DIFFERENT scale — this is only `scale(9.99)` if the brand's
    // registration, not core's, actually rendered.
    expect(captured.img[0].style.transform).toBe('scale(9.99)');
  });

  it('with no styleEffects registered at all, core ken-burns still resolves (the fallback stays intact)', () => {
    captured.img.length = 0;
    const theme = { accentSlots: [], background: '#000' } as unknown as CompositionTheme;
    const node = renderVideoItemNode(theme, photo([{ type: 'ken-burns', direction: 'in' }]), NO_HANDLES);
    render(<>{node}</>);
    expect(captured.img[0].style.transform).toContain('scale(');
    expect(captured.img[0].style.transform).not.toBe('scale(9.99)');
  });
});

describe('opacity from a style effect reaches the rendered element (CRITICAL 1)', () => {
  it('a brand style effect setting opacity is applied to the media style', () => {
    captured.img.length = 0;
    const fadePhoto: StyleEffectRenderer = () => ({ opacity: 0.4 });
    const theme = {
      accentSlots: [],
      background: '#000',
      styleEffects: { 'fade-photo': { renderer: fadePhoto } },
    } as unknown as CompositionTheme;

    const node = renderVideoItemNode(theme, photo([{ type: 'fade-photo' }]), NO_HANDLES);
    render(<>{node}</>);

    expect(captured.img[0].style.opacity).toBe(0.4);
  });

  it('PARITY: no style effect sets opacity -> no opacity key on the element at all', () => {
    captured.img.length = 0;
    const theme = { accentSlots: [], background: '#000' } as unknown as CompositionTheme;
    const node = renderVideoItemNode(theme, photo(undefined), NO_HANDLES);
    render(<>{node}</>);
    expect(captured.img[0].style.opacity).toBeUndefined();
  });

  it('opacity: 0 (fully transparent) is a real value, not treated as "unset"', () => {
    captured.img.length = 0;
    const vanish: StyleEffectRenderer = () => ({ opacity: 0 });
    const theme = {
      accentSlots: [],
      background: '#000',
      styleEffects: { 'vanish': { renderer: vanish } },
    } as unknown as CompositionTheme;
    const node = renderVideoItemNode(theme, photo([{ type: 'vanish' }]), NO_HANDLES);
    render(<>{node}</>);
    expect(captured.img[0].style.opacity).toBe(0);
  });
});
