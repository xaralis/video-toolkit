// The ONE overlay registry: BrandTheme.overlays (brand tier) merged with the
// deprecated CompositionTheme.overlayItems (composition tier), the latter
// winning per kind. Both live brand call shapes must keep working — roost
// registers only `overlays.text`, campaign-reels registers `overlays.text`
// AND six kinds on `overlayItems` — so this file pins both against
// LayeredReelComposition itself, not against the resolver in isolation.
//
// jsdom, so nothing here says anything about PIXELS; render parity is proven
// separately with `remotion still` on examples/layered-minimal.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

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
    // Passthrough: <Sequence> needs the timeline context a real composition
    // supplies, and the item's own placement on the timeline is covered by
    // video-track-layout.test / overlay-routing.test, not here.
    Sequence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    Audio: () => null,
  };
});

import { LayeredReelComposition } from '@video-toolkit/lib/render/layered-composition';
import type { CompositionTheme, OverlayRenderProps, VideoRenderProps } from '@video-toolkit/lib/theming';
import type { LayeredReel, OverlayItem, VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

const overlay = (id: string, kind: string, extra: Partial<OverlayItem> = {}): OverlayItem => ({
  id,
  startMs: 0,
  endMs: 2000,
  content: { kind, text: `${kind}-copy` },
  ...extra,
});

const clip: VideoItem = {
  id: 'seg-001',
  kind: 'clip',
  startMs: 0,
  endMs: 3000,
  source: 'recordings/a.mp4',
  sourceInMs: 0,
  sourceOutMs: 3000,
};

const reelWith = (overlays: OverlayItem[], video: VideoItem[] = []): LayeredReel => ({
  version: 'layered-1',
  meta: { topic: 'registry', totalDurationMs: 3000 },
  tracks: { video, audio: [], music: { baseVolumeDb: -8 }, overlays, brand: [] },
});

const base = { accentSlots: [], background: '#000' } as const;

const BrandText: React.FC<OverlayRenderProps> = ({ text }) => <div data-testid="brand-text">{text}</div>;

describe('the unified overlay registry', () => {
  it('renders a brand renderer registered on BrandTheme.overlays (roost shape)', () => {
    const theme: CompositionTheme = { ...base, overlays: { text: { renderer: BrandText } } };
    const { getByTestId } = render(<LayeredReelComposition reel={reelWith([overlay('o1', 'text')])} theme={theme} />);
    expect(getByTestId('brand-text').textContent).toBe('text-copy');
  });

  it('calls a render closure registered on CompositionTheme.overlayItems (campaign shape)', () => {
    const renderChevron = vi.fn((item: OverlayItem) => <div data-testid="chevron">{item.id}</div>);
    const theme: CompositionTheme = { ...base, overlayItems: { chevron: { render: renderChevron } } };
    const { getByTestId } = render(<LayeredReelComposition reel={reelWith([overlay('c1', 'chevron')])} theme={theme} />);
    expect(renderChevron).toHaveBeenCalledTimes(1);
    expect(renderChevron.mock.calls[0][0].id).toBe('c1');
    expect(getByTestId('chevron').textContent).toBe('c1');
  });

  it('calls a render closure registered on BrandTheme.overlays — the new capability', () => {
    // THE point of "one registry": before the collapse, item-level `render`
    // closures were read off theme.overlayItems ONLY, so this registration was
    // silently ignored. Mutation-pinned: reverting layered-composition's
    // `registry[kind]` to `theme.overlayItems?.[kind]` must turn this red.
    const renderChevron = vi.fn((item: OverlayItem) => <div data-testid="chevron">{item.id}</div>);
    const theme: CompositionTheme = { ...base, overlays: { chevron: { render: renderChevron } } };
    const { getByTestId } = render(<LayeredReelComposition reel={reelWith([overlay('c1', 'chevron')])} theme={theme} />);
    expect(renderChevron).toHaveBeenCalledTimes(1);
    expect(getByTestId('chevron').textContent).toBe('c1');
  });

  it('lets overlayItems override overlays for the same kind', () => {
    const theme: CompositionTheme = {
      ...base,
      overlays: { text: { renderer: BrandText } },
      overlayItems: { text: { render: () => <div data-testid="items-text" /> } },
    };
    const { queryByTestId } = render(<LayeredReelComposition reel={reelWith([overlay('o1', 'text')])} theme={theme} />);
    expect(queryByTestId('items-text')).not.toBeNull();
    expect(queryByTestId('brand-text')).toBeNull();
  });

  it('renders nothing (and does not throw) for a kind with no registration and no core generic', () => {
    const theme: CompositionTheme = { ...base, overlays: { text: { renderer: BrandText } } };
    const { queryByTestId, container } = render(
      <LayeredReelComposition reel={reelWith([overlay('s1', 'stat-callout')])} theme={theme} />,
    );
    expect(queryByTestId('brand-text')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it("still routes the legacy 'quote-pull' alias through the text adapter", () => {
    const theme: CompositionTheme = { ...base, overlays: { text: { renderer: BrandText } } };
    const { getByTestId } = render(
      <LayeredReelComposition reel={reelWith([overlay('q1', 'quote-pull')])} theme={theme} />,
    );
    expect(getByTestId('brand-text').textContent).toBe('quote-pull-copy');
  });

  it('threads theme.tokens through to the generic text renderer — task 4.2 (no custom renderer registered)', () => {
    // Mutation pin: delete `tokens={theme.tokens}` from TrackTextOverlay
    // (lib/render/layered-composition.tsx) and this goes red — the whole
    // rest of the suite stays green because nothing else exercises a brand
    // supplying `theme.tokens.text` through the REAL composition path (only
    // GenericTextOverlay's own unit test exercises the prop being READ, not
    // whether the composition actually SUPPLIES it).
    const theme: CompositionTheme = {
      ...base,
      tokens: { text: { color: '#123456' } },
    };
    const { container } = render(<LayeredReelComposition reel={reelWith([overlay('o1', 'text')])} theme={theme} />);
    // GenericTextOverlay is the innermost (leaf) div — AbsoluteFill's own div
    // also has textContent 'text-copy' via aggregation, so match on the leaf.
    const divs = Array.from(container.querySelectorAll('div'));
    const textDiv = divs.find((d) => d.textContent === 'text-copy' && d.children.length === 0);
    expect(textDiv?.style.color).toBe('rgb(18, 52, 86)'); // #123456
  });

  it("threads a non-'text' kind's OWN registered config (quote-pull), not text's — task 4.2", () => {
    // Mutation pin: revert TrackTextOverlay's `overlayConfig(theme, kind)`
    // back to the hardcoded `overlayConfig(theme, 'text')` and this goes red
    // — a 'quote-pull' item would silently receive 'text'-config instead of
    // its own registration's config. 'quote-pull' is used deliberately
    // (not 'text') because a 'text' item's config is reachable even under the
    // old hardcoded literal, so it would pass against the bug.
    const seen: unknown[] = [];
    const CaptureConfig: React.FC<OverlayRenderProps> = ({ config }) => {
      seen.push(config);
      return <div data-testid="captured" />;
    };
    const theme: CompositionTheme = {
      ...base,
      overlays: {
        text: { renderer: CaptureConfig, config: 'text-config' },
        'quote-pull': { config: 'quote-pull-config' },
      },
    };
    render(<LayeredReelComposition reel={reelWith([overlay('q1', 'quote-pull')])} theme={theme} />);
    expect(seen).toEqual(['quote-pull-config']);
  });

  it("diverts a routing:'anchored' item with an anchorVideoId off the track and into the video renderer", () => {
    const seen: string[][] = [];
    const Clip: React.FC<VideoRenderProps> = ({ anchoredOverlays }) => {
      seen.push((anchoredOverlays ?? []).map((o) => o.id));
      return <div data-testid="clip" />;
    };
    const theme: CompositionTheme = {
      ...base,
      overlays: { text: { renderer: BrandText } },
      overlayItems: { title: { routing: 'anchored' } },
      video: { clip: { renderer: Clip } },
    };
    const { queryByTestId } = render(
      <LayeredReelComposition
        reel={reelWith([overlay('t1', 'title', { anchorVideoId: 'seg-001' })], [clip])}
        theme={theme}
      />,
    );
    expect(queryByTestId('clip')).not.toBeNull();
    expect(seen).toEqual([['t1']]);
    // …and nothing drew it on the overlay track (no renderer registered for 'title').
    expect(queryByTestId('brand-text')).toBeNull();
  });

  it('does not let a routing-only registration mask the core text generic', () => {
    // The subtle pair: 'title' has routing and no renderer → nothing draws it.
    // 'text' has routing and no renderer → the core text adapter still draws it.
    const theme: CompositionTheme = {
      ...base,
      overlays: { text: { renderer: BrandText } },
      overlayItems: { text: { routing: 'track' } },
    };
    const { queryByTestId, container } = render(
      <LayeredReelComposition reel={reelWith([overlay('o1', 'text')])} theme={theme} />,
    );
    // overlayItems.text replaces overlays.text, so the brand renderer is gone —
    // but the kind is still a core text kind, so GenericTextOverlay draws it.
    expect(queryByTestId('brand-text')).toBeNull();
    expect(container.textContent).toBe('text-copy');
  });
});
