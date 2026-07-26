import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const captured = vi.hoisted(() => ({ img: [] as any[] }));

vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  return {
    ...actual,
    staticFile: (s: string) => s,
    Img: (props: any) => {
      captured.img.push(props);
      return null;
    },
  };
});

import {
  GenericWatermark,
  watermarkStyle,
  resolveWatermarkMargin,
  DEFAULT_WATERMARK_TINT_COLOR,
} from '@video-toolkit/lib/theming/generic/GenericWatermark';

beforeEach(() => {
  captured.img.length = 0;
});

describe('GenericWatermark', () => {
  it('renders an Img with the selected asset from the assets array', () => {
    render(
      <GenericWatermark
        assets={['a.png', 'b.png', 'c.png']}
        index={1}
        corner="top-right"
        sizePx={160}
        marginPx={40}
        alpha={1}
      />,
    );

    expect(captured.img).toHaveLength(1);
    const { src } = captured.img[0];
    expect(src).toBe('b.png');
  });

  it('respects backward-compat single asset prop (no assets)', () => {
    render(
      <GenericWatermark
        asset="w.png"
        corner="top-right"
        sizePx={160}
        marginPx={40}
        alpha={1}
      />,
    );

    expect(captured.img).toHaveLength(1);
    const { src } = captured.img[0];
    expect(src).toBe('w.png');
  });

  it('renders nothing when both assets and asset are absent', () => {
    render(
      <GenericWatermark
        corner="top-right"
        sizePx={160}
        marginPx={40}
        alpha={1}
      />,
    );

    expect(captured.img).toHaveLength(0);
  });

  it('clamps index to valid range', () => {
    render(
      <GenericWatermark
        assets={['a.png', 'b.png']}
        index={10}
        corner="top-right"
        sizePx={160}
        marginPx={40}
        alpha={1}
      />,
    );

    expect(captured.img).toHaveLength(1);
    const { src } = captured.img[0];
    expect(src).toBe('b.png');
  });

  it('uses default values when optional props are absent', () => {
    render(
      <GenericWatermark
        assets={['logo.png']}
      />,
    );

    expect(captured.img).toHaveLength(1);
    const { src, style } = captured.img[0];
    expect(src).toBe('logo.png');
    expect(style.width).toBe(160);
    expect(style.opacity).toBe(1);
    expect(style.top).toBe(40);
    expect(style.right).toBe(40);
  });

  it('applies corner positioning correctly for bottom-left', () => {
    render(
      <GenericWatermark
        assets={['logo.png']}
        corner="bottom-left"
        sizePx={200}
        marginPx={20}
      />,
    );

    expect(captured.img).toHaveLength(1);
    const { style } = captured.img[0];
    expect(style.bottom).toBe(20);
    expect(style.left).toBe(20);
    expect(style.top).toBeUndefined();
    expect(style.right).toBeUndefined();
  });

  it('applies corner positioning correctly for bottom-right', () => {
    render(
      <GenericWatermark
        assets={['logo.png']}
        corner="bottom-right"
        sizePx={200}
        marginPx={30}
      />,
    );

    expect(captured.img).toHaveLength(1);
    const { style } = captured.img[0];
    expect(style.bottom).toBe(30);
    expect(style.right).toBe(30);
    expect(style.top).toBeUndefined();
    expect(style.left).toBeUndefined();
  });

  it('applies corner positioning correctly for top-left', () => {
    render(
      <GenericWatermark
        assets={['logo.png']}
        corner="top-left"
        sizePx={200}
        marginPx={50}
      />,
    );

    expect(captured.img).toHaveLength(1);
    const { style } = captured.img[0];
    expect(style.top).toBe(50);
    expect(style.left).toBe(50);
    expect(style.bottom).toBeUndefined();
    expect(style.right).toBeUndefined();
  });

  it('sets pointerEvents to none', () => {
    render(
      <GenericWatermark
        assets={['logo.png']}
      />,
    );

    expect(captured.img).toHaveLength(1);
    const { style } = captured.img[0];
    expect(style.pointerEvents).toBe('none');
  });

  it('uses HTTP URL directly without staticFile', () => {
    render(
      <GenericWatermark
        assets={['https://example.com/logo.png']}
        corner="top-right"
      />,
    );

    expect(captured.img).toHaveLength(1);
    const { src } = captured.img[0];
    expect(src).toBe('https://example.com/logo.png');
  });
});

// ---------------------------------------------------------------------------
// mode: 'tint' — roost's PNG-as-alpha-mask technique, lifted into core.
// The style is asserted through `watermarkStyle` (the same builder the
// component uses) because jsdom's CSSStyleDeclaration silently DROPS the
// `WebkitMask*` longhands — asserting them off the rendered DOM would pass
// vacuously. The DOM assertions below cover what jsdom does keep.
// ---------------------------------------------------------------------------
describe('GenericWatermark tint mode', () => {
  it('emits NO Img and a mask-over-colour div', () => {
    const { container } = render(
      <GenericWatermark assets={['mark.png']} mode="tint" color="#123456" sizePx={160} />,
    );

    expect(captured.img).toHaveLength(0);
    const el = container.firstElementChild as HTMLElement;
    expect(el.tagName).toBe('DIV');
    expect(el.style.backgroundColor).toBe('rgb(18, 52, 86)');
    expect(el.style.maskImage).toBe('url(mark.png)');
  });

  it('carries the asset URL on BOTH maskImage and WebkitMaskImage', () => {
    const style = watermarkStyle({ assets: ['mark.png'], mode: 'tint', color: '#123456' }, 'mark.png');
    expect(style.maskImage).toBe('url(mark.png)');
    expect(style.WebkitMaskImage).toBe('url(mark.png)');
    expect(style.backgroundColor).toBe('#123456');
    expect(style.maskSize).toBe('contain');
    expect(style.maskRepeat).toBe('no-repeat');
    expect(style.maskPosition).toBe('center');
  });

  it('falls back to the documented neutral colour when tint has no color, without throwing', () => {
    expect(() => render(<GenericWatermark assets={['mark.png']} mode="tint" />)).not.toThrow();
    const style = watermarkStyle({ assets: ['mark.png'], mode: 'tint' }, 'mark.png');
    expect(style.backgroundColor).toBe(DEFAULT_WATERMARK_TINT_COLOR);
    expect(DEFAULT_WATERMARK_TINT_COLOR).toBe('#000000');
  });

  it('gives the tint box an explicit square height (an empty div has no intrinsic size)', () => {
    const style = watermarkStyle({ assets: ['mark.png'], mode: 'tint', sizePx: 128 }, 'mark.png');
    expect(style.width).toBe(128);
    expect(style.height).toBe(128);
  });

  it("mode 'image' — and mode absent — produce exactly today's Img output", () => {
    const explicit = watermarkStyle({ assets: ['logo.png'], mode: 'image' }, 'logo.png');
    const implicit = watermarkStyle({ assets: ['logo.png'] }, 'logo.png');
    expect(explicit).toEqual(implicit);
    // The <Img> path is untouched: no mask, no backgroundColor, height auto.
    expect(implicit.height).toBe('auto');
    expect(implicit.maskImage).toBeUndefined();
    expect(implicit.WebkitMaskImage).toBeUndefined();
    expect(implicit.backgroundColor).toBeUndefined();

    render(<GenericWatermark assets={['logo.png']} mode="image" />);
    expect(captured.img).toHaveLength(1);
    expect(captured.img[0].style.height).toBe('auto');
  });

  it('renders nothing in tint mode when no asset is given', () => {
    const { container } = render(<GenericWatermark mode="tint" color="#123456" />);
    expect(captured.img).toHaveLength(0);
    expect(container.firstElementChild).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Per-axis margins. `marginPx` stays as the single-number back-compat alias.
// ---------------------------------------------------------------------------
describe('GenericWatermark margins', () => {
  it('margin: 40 sets both axes to 40 — identical to marginPx: 40', () => {
    expect(resolveWatermarkMargin(40, undefined)).toEqual({ vertical: 40, horizontal: 40 });
    const viaMargin = watermarkStyle({ assets: ['l.png'], margin: 40, corner: 'top-right' }, 'l.png');
    const viaMarginPx = watermarkStyle({ assets: ['l.png'], marginPx: 40, corner: 'top-right' }, 'l.png');
    expect(viaMargin).toEqual(viaMarginPx);
  });

  it('margin: { vertical, horizontal } anchors each axis independently', () => {
    // The asymmetry a real brand track uses today (vertical 40 / horizontal 36).
    const style = watermarkStyle(
      { assets: ['l.png'], margin: { vertical: 40, horizontal: 36 }, corner: 'bottom-right' },
      'l.png',
    );
    expect(style.bottom).toBe(40);
    expect(style.right).toBe(36);
    expect(style.top).toBeUndefined();
    expect(style.left).toBeUndefined();

    const topLeft = watermarkStyle(
      { assets: ['l.png'], margin: { vertical: 40, horizontal: 36 }, corner: 'top-left' },
      'l.png',
    );
    expect(topLeft.top).toBe(40);
    expect(topLeft.left).toBe(36);
  });

  it('per-axis margins reach the rendered Img', () => {
    render(
      <GenericWatermark assets={['l.png']} corner="bottom-left" margin={{ vertical: 40, horizontal: 36 }} />,
    );
    const { style } = captured.img[0];
    expect(style.bottom).toBe(40);
    expect(style.left).toBe(36);
  });

  it('marginPx still works and margin wins when both are given', () => {
    expect(resolveWatermarkMargin(undefined, 20)).toEqual({ vertical: 20, horizontal: 20 });
    expect(resolveWatermarkMargin({ vertical: 10, horizontal: 5 }, 20)).toEqual({ vertical: 10, horizontal: 5 });
    // Neither given → the documented neutral default.
    expect(resolveWatermarkMargin(undefined, undefined)).toEqual({ vertical: 40, horizontal: 40 });
  });
});
