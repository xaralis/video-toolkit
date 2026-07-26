// The BRAND LAYER as a registry, not a hook. Before Phase 3 Task 4 the only
// way to paint the brand track was `CompositionTheme.renderBrandTrack`, so
// every brand wrote its own whole-track component and none of them used core's
// GenericWatermark — three implementations of corner anchoring existed. This
// file pins the default track: one Sequence per item, dispatched by kind
// through the SAME resolution rule as every other axis (registry.ts).
//
// jsdom, so nothing here says anything about PIXELS; render parity is proven
// separately with `remotion still` on examples/layered-minimal.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const captured = vi.hoisted(() => ({ seq: [] as any[] }));

vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  return {
    ...actual,
    useCurrentFrame: () => 0,
    useVideoConfig: () => ({
      width: 1080,
      height: 1920,
      fps: 30,
      durationInFrames: 300,
      id: 'test',
      defaultProps: {},
      props: {},
    }),
    staticFile: (s: string) => s,
    // Capture the timeline placement, then pass children through — the real
    // <Sequence> needs a composition context this test does not stand up.
    Sequence: (props: any) => {
      captured.seq.push({ from: props.from, durationInFrames: props.durationInFrames, name: props.name });
      return <>{props.children}</>;
    },
    Img: (props: any) => <img data-testid="wm-img" src={props.src} />,
  };
});

import { defaultRenderBrandTrack, GenericDisclaimer } from '@video-toolkit/lib/theming';
import { LayeredReelComposition } from '@video-toolkit/lib/render/layered-composition';
import type { BrandRenderProps, CompositionTheme } from '@video-toolkit/lib/theming';
import type { BrandLayerItem, LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';

const FPS = 30;

const base: CompositionTheme = { accentSlots: [], background: '#000' };

const item = (over: Partial<BrandLayerItem> & Pick<BrandLayerItem, 'id' | 'kind'>): BrandLayerItem => ({
  startMs: 0,
  endMs: 2000,
  ...over,
});

beforeEach(() => {
  captured.seq.length = 0;
});

describe('defaultRenderBrandTrack', () => {
  it('mounts ONE Sequence per item, each spanning the item’s OWN [startMs, endMs)', () => {
    // Deliberately different from BOTH brands shipping today, which span
    // [0, max(endMs)) for every brand item regardless of its own startMs.
    render(
      <>
        {defaultRenderBrandTrack(
          [
            item({ id: 'b-mark', kind: 'watermark', startMs: 0, endMs: 4000, props: { asset: 'w.png' } }),
            item({ id: 'b-legal', kind: 'disclaimer', startMs: 2000, endMs: 4000, props: { text: 'paid for by' } }),
          ],
          base,
          FPS,
        )}
      </>,
    );

    expect(captured.seq).toHaveLength(2);
    expect(captured.seq[0]).toEqual({ from: 0, durationInFrames: 120, name: 'b-mark' });
    // The second item starts at 2000ms: from=60, NOT 0.
    expect(captured.seq[1]).toEqual({ from: 60, durationInFrames: 60, name: 'b-legal' });
  });

  it('returns null for an empty items array', () => {
    expect(defaultRenderBrandTrack([], base, FPS)).toBeNull();
    expect(captured.seq).toHaveLength(0);
  });

  it('skips a kind with no registration and no core generic — never throws', () => {
    expect(() =>
      render(
        <>
          {defaultRenderBrandTrack(
            [item({ id: 'b-x', kind: 'sponsor-bug' as BrandLayerItem['kind'] })],
            base,
            FPS,
          )}
        </>,
      ),
    ).not.toThrow();
    expect(captured.seq).toHaveLength(0);
  });

  it('skips a zero-length item', () => {
    render(<>{defaultRenderBrandTrack([item({ id: 'b', kind: 'watermark', startMs: 1000, endMs: 1000 })], base, FPS)}</>);
    expect(captured.seq).toHaveLength(0);
  });

  it('draws core generics for watermark and disclaimer with no registration at all', () => {
    const { getByTestId, getByText } = render(
      <>
        {defaultRenderBrandTrack(
          [
            item({ id: 'b-mark', kind: 'watermark', props: { asset: 'w.png' } }),
            item({ id: 'b-legal', kind: 'disclaimer', props: { text: 'paid for by someone' } }),
          ],
          base,
          FPS,
        )}
      </>,
    );
    expect(getByTestId('wm-img').getAttribute('src')).toBe('w.png');
    expect(getByText('paid for by someone')).toBeTruthy();
  });

  it('a REGISTERED kind wins over the core generic', () => {
    const BrandMark: React.FC<BrandRenderProps> = ({ item: it }) => (
      <div data-testid="brand-mark">{String(it.props?.asset)}</div>
    );
    const theme: CompositionTheme = { ...base, brand: { watermark: { renderer: BrandMark } } };

    const { getByTestId, queryByTestId } = render(
      <>{defaultRenderBrandTrack([item({ id: 'b', kind: 'watermark', props: { asset: 'w.png' } })], theme, FPS)}</>,
    );
    expect(getByTestId('brand-mark').textContent).toBe('w.png');
    expect(queryByTestId('wm-img')).toBeNull();
  });

  it('a registration with NO renderer contributes config only and does NOT mask the generic', () => {
    // The semantics every other axis already has (registry.ts): routing/config
    // without a renderer must not make the kind vanish.
    const theme: CompositionTheme = { ...base, brand: { watermark: { config: { tier: 'gold' } } } };

    const { getByTestId } = render(
      <>{defaultRenderBrandTrack([item({ id: 'b', kind: 'watermark', props: { asset: 'w.png' } })], theme, FPS)}</>,
    );
    expect(getByTestId('wm-img')).toBeTruthy();
  });

  it('threads the registered config and the theme tokens to the renderer', () => {
    const seen: { config?: unknown; tokens?: unknown }[] = [];
    const Probe: React.FC<BrandRenderProps> = ({ config, tokens }) => {
      seen.push({ config, tokens });
      return null;
    };
    const theme: CompositionTheme = {
      ...base,
      tokens: { watermark: { mode: 'tint', color: '#123456' } },
      brand: { watermark: { renderer: Probe, config: { tier: 'gold' } } },
    };
    render(<>{defaultRenderBrandTrack([item({ id: 'b', kind: 'watermark' })], theme, FPS)}</>);
    expect(seen).toHaveLength(1);
    expect(seen[0].config).toEqual({ tier: 'gold' });
    expect(seen[0].tokens).toEqual({ watermark: { mode: 'tint', color: '#123456' } });
  });

  it('theme tokens supply the watermark look — a brand recolours without a renderer', () => {
    const theme: CompositionTheme = {
      ...base,
      tokens: { watermark: { mode: 'tint', color: '#123456', margin: { vertical: 40, horizontal: 36 } } },
    };
    const { container, queryByTestId } = render(
      <>
        {defaultRenderBrandTrack(
          [item({ id: 'b', kind: 'watermark', props: { asset: 'w.png', corner: 'bottom-right' } })],
          theme,
          FPS,
        )}
      </>,
    );
    // Tint mode reached GenericWatermark: no <Img>, a masked colour div, and
    // the per-axis margins from the tokens.
    expect(queryByTestId('wm-img')).toBeNull();
    const el = container.querySelector('div') as HTMLElement;
    expect(el.style.backgroundColor).toBe('rgb(18, 52, 86)');
    expect(el.style.maskImage).toBe('url(w.png)');
    expect(el.style.bottom).toBe('40px');
    expect(el.style.right).toBe('36px');
  });

  it('item props win over the theme tokens for the same field', () => {
    const theme: CompositionTheme = { ...base, tokens: { watermark: { mode: 'tint', color: '#123456' } } };
    const { getByTestId } = render(
      <>
        {defaultRenderBrandTrack(
          [item({ id: 'b', kind: 'watermark', props: { asset: 'w.png', mode: 'image' } })],
          theme,
          FPS,
        )}
      </>,
    );
    expect(getByTestId('wm-img')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// The DISPATCH in LayeredReelComposition. Pinned against the composition
// itself, not the function in isolation: before Task 4 a theme without
// `renderBrandTrack` painted NOTHING at all, and the fallback edge is the
// whole capability — a unit test of defaultRenderBrandTrack cannot see it.
// ---------------------------------------------------------------------------
describe('LayeredReelComposition brand-layer dispatch', () => {
  const reelWithBrand = (brand: BrandLayerItem[]): LayeredReel => ({
    version: 'layered-1',
    meta: { topic: 'brand', totalDurationMs: 4000 },
    tracks: { video: [], audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand },
  });

  it('paints the brand layer through the default track when the theme has NO renderBrandTrack', () => {
    const { getByTestId, getByText } = render(
      <LayeredReelComposition
        reel={reelWithBrand([
          item({ id: 'b-mark', kind: 'watermark', props: { asset: 'w.png' } }),
          item({ id: 'b-legal', kind: 'disclaimer', props: { text: 'paid for by X' } }),
        ])}
        theme={base}
      />,
    );
    expect(getByTestId('wm-img').getAttribute('src')).toBe('w.png');
    expect(getByText('paid for by X')).toBeTruthy();
  });

  it('the renderBrandTrack escape hatch still wins outright over the default track', () => {
    const theme: CompositionTheme = {
      ...base,
      renderBrandTrack: (items) => <div data-testid="hand-written">{items.length}</div>,
    };
    const { getByTestId, queryByTestId } = render(
      <LayeredReelComposition
        reel={reelWithBrand([item({ id: 'b-mark', kind: 'watermark', props: { asset: 'w.png' } })])}
        theme={theme}
      />,
    );
    expect(getByTestId('hand-written').textContent).toBe('1');
    expect(queryByTestId('wm-img')).toBeNull();
  });
});

describe('GenericDisclaimer', () => {
  it('renders a full-width text row with no background', () => {
    const { container } = render(<GenericDisclaimer text="paid for by X" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.textContent).toBe('paid for by X');
    expect(el.style.left).toBe('0px');
    expect(el.style.right).toBe('0px');
    expect(el.style.backgroundColor).toBe('');
  });

  it('places the row at a token-driven vertical offset with token typography', () => {
    const { container } = render(
      <GenericDisclaimer
        text="legal"
        bottomOffsetPx={132}
        fontSize={22}
        color="#ff0000"
        fontFamily="Menlo, monospace"
        textAlign="right"
      />,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.bottom).toBe('132px');
    expect(el.style.fontSize).toBe('22px');
    expect(el.style.color).toBe('rgb(255, 0, 0)');
    expect(el.style.fontFamily).toBe('Menlo, monospace');
    expect(el.style.textAlign).toBe('right');
  });

  it('renders null for empty (or whitespace-only) text', () => {
    expect(render(<GenericDisclaimer text="" />).container.firstElementChild).toBeNull();
    expect(render(<GenericDisclaimer />).container.firstElementChild).toBeNull();
    expect(render(<GenericDisclaimer text="   " />).container.firstElementChild).toBeNull();
  });
});
