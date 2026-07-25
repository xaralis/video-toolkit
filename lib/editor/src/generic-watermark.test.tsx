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

import { GenericWatermark } from '@video-toolkit/lib/theming/generic/GenericWatermark';

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
