import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
// The seam tests below render real video renderers (SegmentMedia), which call
// Remotion hooks and elements. Mock those; keep everything else real.
vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  return {
    ...actual,
    useCurrentFrame: () => 0,
    useVideoConfig: () => ({ fps: 30 }),
    staticFile: (s: string) => s,
    Img: () => null,
    OffthreadVideo: () => null,
  };
});

import { resolveEffectRenderer, applyEffects, type EffectRenderProps } from '@video-toolkit/lib/theming/effects';
import type { BrandTheme } from '@video-toolkit/lib/theming/types';
import type { VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';
import { renderVideoItemNode } from '@video-toolkit/lib/render/layered-composition';

const NO_HANDLES = { inHalf: 0, outHalf: 0 };

const item = (effects?: VideoItem['effects']): VideoItem => ({
  id: 'v1',
  kind: 'photo',
  startMs: 0,
  endMs: 3000,
  source: 'photos/a.jpg',
  ...(effects ? { effects } : {}),
});

// Named wrappers, each tagging the DOM so composition ORDER is observable.
const Outer: React.FC<EffectRenderProps> = ({ children }) => <div data-w="outer">{children}</div>;
const Inner: React.FC<EffectRenderProps> = ({ children }) => <div data-w="inner">{children}</div>;
const Brand: React.FC<EffectRenderProps> = ({ children }) => <div data-w="brand">{children}</div>;

describe('resolveEffectRenderer', () => {
  it('prefers a brand-registered effect over the core generic of the same type', () => {
    const theme: BrandTheme = { accentSlots: [], effects: { vignette: { renderer: Brand } } };
    expect(resolveEffectRenderer(theme, 'vignette')).toBe(Brand);
  });

  it('resolves a core generic for a type the brand did not register', () => {
    const theme: BrandTheme = { accentSlots: [] };
    // Every core generic primitive must be reachable with no brand registration.
    for (const type of ['grain', 'scanlines', 'vignette', 'grade', 'transform']) {
      expect(resolveEffectRenderer(theme, type), `core generic missing for ${type}`).toBeTypeOf('function');
    }
  });

  it('resolves a brand-only effect type that core has no generic for', () => {
    const theme: BrandTheme = { accentSlots: [], effects: { vintage: { renderer: Brand } } };
    expect(resolveEffectRenderer(theme, 'vintage')).toBe(Brand);
  });

  // ken-burns is a STYLE effect, applied inside SegmentMedia into the media's
  // own transform. If core ever registered a WRAPPER generic for it, every
  // ken-burns item would get the effect twice and the render would move.
  it('has NO core wrapper generic for ken-burns, so it is never double-applied', () => {
    expect(resolveEffectRenderer({ accentSlots: [] }, 'ken-burns')).toBeUndefined();
    const media = <span data-w="media" />;
    const kb = item([{ type: 'ken-burns', direction: 'in' }]);
    expect(applyEffects({ accentSlots: [] }, kb, NO_HANDLES, media)).toBe(media);
  });

  // The registry is OPEN-KEYED, so "core registers no generic" is not enough:
  // a brand can name any type it likes. ken-burns is applied inside
  // SegmentMedia, so a wrapper here would apply the movement a second time.
  it('does NOT apply a BRAND-registered ken-burns — the skip is a real invariant, not an accident', () => {
    let invoked = 0;
    const BrandKb: React.FC<EffectRenderProps> = ({ children }) => {
      invoked += 1;
      return <div data-w="brand-kb">{children}</div>;
    };
    const theme: BrandTheme = { accentSlots: [], effects: { 'ken-burns': { renderer: BrandKb } } };
    const media = <span data-w="media" />;
    const node = applyEffects(theme, item([{ type: 'ken-burns', direction: 'in' }]), NO_HANDLES, media);
    render(<>{node}</>);
    expect(invoked).toBe(0);
    expect(node).toBe(media);
  });

  it('skips a reserved type but still applies the other effects around it', () => {
    const theme: BrandTheme = {
      accentSlots: [],
      effects: { 'ken-burns': { renderer: Brand }, outer: { renderer: Outer } },
    };
    const node = applyEffects(
      theme,
      item([{ type: 'ken-burns', direction: 'in' }, { type: 'outer' }]),
      NO_HANDLES,
      <span data-w="media" />,
    );
    const { container } = render(<>{node}</>);
    expect(container.querySelector('[data-w="brand"]')).toBeNull();
    expect(container.querySelector('[data-w="outer"] [data-w="media"]')).not.toBeNull();
  });

  it('returns undefined for a type neither the brand nor core has', () => {
    expect(resolveEffectRenderer({ accentSlots: [] }, 'no-such-effect')).toBeUndefined();
  });

  it('does not let a config-only registration mask the core generic', () => {
    const theme: BrandTheme = { accentSlots: [], effects: { vignette: { config: { k: 1 } } } };
    expect(resolveEffectRenderer(theme, 'vignette')).toBeTypeOf('function');
  });
});

describe('applyEffects', () => {
  it('returns the media node IDENTICALLY when the item has no effects', () => {
    const media = <span data-w="media" />;
    expect(applyEffects({ accentSlots: [] }, item(), NO_HANDLES, media)).toBe(media);
  });

  it('returns the media node IDENTICALLY when no effect on the item resolves', () => {
    const media = <span data-w="media" />;
    const it0 = item([{ type: 'no-such-effect' }]);
    expect(applyEffects({ accentSlots: [] }, it0, NO_HANDLES, media)).toBe(media);
  });

  it('SKIPS an unresolvable effect instead of throwing — a typo must still render', () => {
    const theme: BrandTheme = { accentSlots: [], effects: { real: { renderer: Brand } } };
    const media = <span data-w="media" />;
    // `reallly` is the typo; `real` is registered. The typo must not throw and
    // must not stop `real` from applying.
    const node = applyEffects(theme, item([{ type: 'reallly' }, { type: 'real' }]), NO_HANDLES, media);
    const { container } = render(<>{node}</>);
    expect(container.querySelector('[data-w="brand"]')).not.toBeNull();
    expect(container.querySelector('[data-w="media"]')).not.toBeNull();
  });

  it('composes multiple effects in array order, innermost-first', () => {
    const theme: BrandTheme = { accentSlots: [], effects: { inner: { renderer: Inner }, outer: { renderer: Outer } } };
    const node = applyEffects(theme, item([{ type: 'inner' }, { type: 'outer' }]), NO_HANDLES, <span data-w="media" />);
    const { container } = render(<>{node}</>);
    // Array order [inner, outer] => outer wraps inner wraps media.
    const outer = container.querySelector('[data-w="outer"]')!;
    expect(outer).not.toBeNull();
    const inner = outer.querySelector('[data-w="inner"]')!;
    expect(inner).not.toBeNull();
    expect(inner.querySelector('[data-w="media"]')).not.toBeNull();
    // ...and NOT the other way round.
    expect(container.querySelector('[data-w="inner"] [data-w="outer"]')).toBeNull();
  });

  it('threads the effect entry, the item, handles and the registered config to the renderer', () => {
    const seen: EffectRenderProps[] = [];
    const Spy: React.FC<EffectRenderProps> = (props) => {
      seen.push(props);
      return <>{props.children}</>;
    };
    const theme: BrandTheme = { accentSlots: [], effects: { spy: { renderer: Spy, config: { brandKnob: 7 } } } };
    const it0 = item([{ type: 'spy', amount: 0.4 }]);
    render(<>{applyEffects(theme, it0, { inHalf: 6, outHalf: 3 }, <span />)}</>);
    expect(seen).toHaveLength(1);
    // The WHOLE entry, `type` included — not a stripped param bag.
    expect(seen[0].effect).toEqual({ type: 'spy', amount: 0.4 });
    expect(seen[0].index).toBe(0);
    expect(seen[0].item).toBe(it0);
    expect(seen[0].handles).toEqual({ inHalf: 6, outHalf: 3 });
    expect(seen[0].config).toEqual({ brandKnob: 7 });
  });

  it('applies the SAME effect type twice when it appears twice', () => {
    const theme: BrandTheme = { accentSlots: [], effects: { inner: { renderer: Inner } } };
    const node = applyEffects(theme, item([{ type: 'inner' }, { type: 'inner' }]), NO_HANDLES, <span />);
    const { container } = render(<>{node}</>);
    expect(container.querySelectorAll('[data-w="inner"]')).toHaveLength(2);
  });

  it('gives each entry its own index, so repeats can be told apart', () => {
    const seen: number[] = [];
    const Spy: React.FC<EffectRenderProps> = ({ index, children }) => {
      seen.push(index);
      return <>{children}</>;
    };
    const theme: BrandTheme = { accentSlots: [], effects: { spy: { renderer: Spy } } };
    render(<>{applyEffects(theme, item([{ type: 'spy' }, { type: 'spy' }]), NO_HANDLES, <span />)}</>);
    expect(seen.sort()).toEqual([0, 1]);
  });
});

// The composition seam. This is where effects actually reach the render — a
// registry nobody calls would pass every test above and still render nothing.
describe('renderVideoItemNode (the composition seam)', () => {
  it('decorates the resolved video renderer with the item effects', () => {
    const theme = { accentSlots: [], background: '#000', effects: { outer: { renderer: Outer } } } as const;
    const node = renderVideoItemNode(theme as never, item([{ type: 'outer' }]), NO_HANDLES);
    const { container } = render(<>{node}</>);
    expect(container.querySelector('[data-w="outer"]')).not.toBeNull();
  });

  it('applies effects to a BRAND-CUSTOM renderer too, not just core footage kinds', () => {
    const BrandCard: React.FC<{ item: VideoItem }> = () => <span data-w="card" />;
    const theme = {
      accentSlots: [],
      background: '#000',
      video: { card: { renderer: BrandCard as never } },
      effects: { outer: { renderer: Outer } },
    };
    const card: VideoItem = {
      id: 'c1',
      kind: 'card',
      startMs: 0,
      endMs: 1000,
      cardKind: 'stat',
      effects: [{ type: 'outer' }],
    };
    const { container } = render(<>{renderVideoItemNode(theme as never, card, NO_HANDLES)}</>);
    expect(container.querySelector('[data-w="outer"] [data-w="card"]')).not.toBeNull();
  });

  it('renders nothing for a kind with no renderer, effects or not', () => {
    const theme = { accentSlots: [], background: '#000', effects: { outer: { renderer: Outer } } };
    const outro: VideoItem = { id: 'o1', kind: 'outro', startMs: 0, endMs: 1000, effects: [{ type: 'outer' }] };
    expect(renderVideoItemNode(theme as never, outro, NO_HANDLES)).toBeNull();
  });
});
