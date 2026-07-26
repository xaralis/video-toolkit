import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

// GenericMultiClip composes SegmentMedia, which calls Remotion hooks and renders
// OffthreadVideo. Mock the hooks/elements; assert on the recorded SegmentMedia
// props (the synthetic sub-items) and on the produced pane geometry.
const captured = vi.hoisted(() => ({ media: [] as any[] }));

vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  return {
    ...actual,
    useCurrentFrame: () => 0,
    useVideoConfig: () => ({ fps: 30, width: 1080, height: 1920 }),
    staticFile: (s: string) => `/static/${s}`,
    OffthreadVideo: () => null,
    Img: () => null,
  };
});

vi.mock('@video-toolkit/lib/theming/segment/SegmentMedia', () => ({
  SegmentMedia: (props: any) => {
    captured.media.push(props);
    return null;
  },
}));

import { GenericMultiClip } from '@video-toolkit/lib/theming/generic/GenericMultiClip';
import type { VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';
import type { ThemeTokens } from '@video-toolkit/lib/theming';

type Layout = 'split-h' | 'split-v' | 'pip' | 'quad';

const src = (i: number, inMs = 0, outMs = 2000, label?: string) => ({
  source: `broll/c${i}.mp4`,
  sourceInMs: inMs,
  sourceOutMs: outMs,
  ...(label ? { label } : {}),
});

const item = (layout: Layout, sources: ReturnType<typeof src>[]): VideoItem => ({
  id: 'mc1',
  kind: 'multi-clip',
  startMs: 1000,
  endMs: 4000,
  layout,
  sources,
});

const draw = (it: VideoItem, tokens?: ThemeTokens) =>
  render(<GenericMultiClip item={it} handles={{ inHalf: 0, outHalf: 0 }} tokens={tokens} />);

beforeEach(() => {
  captured.media.length = 0;
});

describe('GenericMultiClip sub-items', () => {
  it('feeds each pane a synthetic 0-based VideoItem with handles {0,0}', () => {
    draw(item('split-h', [src(0, 500, 2500), src(1, 1000, 4000)]));

    expect(captured.media).toHaveLength(2);
    // 0-based span whose LENGTH is the sub-source's own trim span. Sub-clips
    // never participate in cross-item transitions, so handles are always {0,0}.
    expect(captured.media[0].item).toMatchObject({
      kind: 'clip',
      source: 'broll/c0.mp4',
      startMs: 0,
      endMs: 2000,
      sourceInMs: 500,
      sourceOutMs: 2500,
    });
    expect(captured.media[0].handles).toEqual({ inHalf: 0, outHalf: 0 });
    expect(captured.media[1].item).toMatchObject({ startMs: 0, endMs: 3000, sourceInMs: 1000, sourceOutMs: 4000 });
    expect(captured.media[1].handles).toEqual({ inHalf: 0, outHalf: 0 });
    // Distinct ids, so React keys and any per-item filter ids stay unique.
    expect(captured.media[0].item.id).not.toBe(captured.media[1].item.id);
  });

  it('does NOT extend sub-source trims into the item handles (documented caveat)', () => {
    // A transition on a multi-clip item shifts its Sequence but does NOT grow
    // the sub-sources. campaign-reels documented this and marked it unverified;
    // core preserves the behaviour rather than silently changing the look.
    draw(item('split-v', [src(0, 500, 2500), src(1, 500, 2500)]));
    expect(captured.media[0].item.sourceInMs).toBe(500);
    expect(captured.media[0].handles).toEqual({ inHalf: 0, outHalf: 0 });
  });

  it('feeds a STILL sub-source as a photo, not as a trimmed clip', () => {
    draw(item('split-h', [{ source: 'photos/dawn.jpg', sourceInMs: 0, sourceOutMs: 2000 }, src(1)]));
    // A still handed to <OffthreadVideo> renders nothing; SegmentMedia picks
    // Img only for kind 'photo'. Video sub-sources are unaffected.
    expect(captured.media[0].item.kind).toBe('photo');
    expect(captured.media[0].item.sourceInMs).toBeUndefined();
    expect(captured.media[1].item.kind).toBe('clip');
  });

  it('renders the available panes when there are FEWER sources than the layout expects', () => {
    expect(() => draw(item('quad', [src(0)]))).not.toThrow();
    expect(captured.media).toHaveLength(1);
  });

  it('ignores extra sources beyond what the layout uses', () => {
    draw(item('split-h', [src(0), src(1), src(2), src(3)]));
    expect(captured.media).toHaveLength(2);
  });

  it('renders nothing for a non-multi-clip item', () => {
    const notMulti: VideoItem = { id: 'p', kind: 'photo', startMs: 0, endMs: 1000, source: 'a.jpg' };
    const { container } = draw(notMulti);
    expect(captured.media).toHaveLength(0);
    expect(container.firstChild).toBeNull();
  });
});

// Geometry assertions read the rendered DOM, because the layout IS CSS.
const panes = (container: HTMLElement) => Array.from(container.querySelectorAll('[data-pane]')) as HTMLElement[];

describe('GenericMultiClip layouts', () => {
  it('split-h is a column flex with a bottom divider on the first pane', () => {
    const { container } = draw(item('split-h', [src(0), src(1)]));
    const root = container.querySelector('[data-multiclip-layout]') as HTMLElement;
    expect(root.style.flexDirection).toBe('column');
    expect(panes(container)).toHaveLength(2);
    expect(panes(container)[0].style.borderBottom).toBe('4px solid rgb(0, 0, 0)');
    expect(panes(container)[1].style.borderBottom).toBe('');
  });

  it('split-v is a row flex with a right divider on the first pane', () => {
    const { container } = draw(item('split-v', [src(0), src(1)]));
    const root = container.querySelector('[data-multiclip-layout]') as HTMLElement;
    expect(root.style.flexDirection).toBe('row');
    expect(panes(container)[0].style.borderRight).toBe('4px solid rgb(0, 0, 0)');
  });

  it('pip is a full-bleed source 0 plus a bordered inset box at the token geometry', () => {
    const { container } = draw(item('pip', [src(0), src(1)]));
    const box = container.querySelector('[data-pip-box]') as HTMLElement;
    expect(box.style.width).toBe('360px');
    expect(box.style.height).toBe('480px');
    expect(box.style.right).toBe('60px');
    expect(box.style.bottom).toBe('280px');
    expect(box.style.border).toBe('4px solid rgb(255, 255, 255)');
  });

  it('quad is a 2x2 grid with the token gap', () => {
    const { container } = draw(item('quad', [src(0), src(1), src(2), src(3)]));
    const root = container.querySelector('[data-multiclip-layout]') as HTMLElement;
    expect(root.style.display).toBe('grid');
    expect(root.style.gridTemplateColumns).toBe('1fr 1fr');
    expect(root.style.gridTemplateRows).toBe('1fr 1fr');
    expect(root.style.gap).toBe('4px');
    expect(panes(container)).toHaveLength(4);
  });

  it('an UNKNOWN layout falls back to quad, like campaign-reels\' else branch', () => {
    const weird = { ...item('quad', [src(0), src(1), src(2), src(3)]), layout: 'mosaic' } as unknown as VideoItem;
    const { container } = draw(weird);
    expect((container.querySelector('[data-multiclip-layout]') as HTMLElement).style.display).toBe('grid');
  });
});

describe('GenericMultiClip tokens', () => {
  it('every drawn literal comes from a token, not a constant', () => {
    const { container } = draw(item('split-h', [src(0, 0, 2000, 'A'), src(1)]), {
      multiClip: {
        borderPx: 9,
        borderColor: '#123456',
        background: '#654321',
        label: { fontFamily: 'Courier', fontSize: 41, color: '#abcdef', top: 7, left: 8, fontWeight: 400 },
      },
    });
    const root = container.querySelector('[data-multiclip-root]') as HTMLElement;
    expect(root.style.backgroundColor).toBe('rgb(101, 67, 33)'); // #654321
    expect(panes(container)[0].style.borderBottom).toBe('9px solid rgb(18, 52, 86)');

    const label = container.querySelector('[data-pane-label]') as HTMLElement;
    expect(label.textContent).toBe('A');
    expect(label.style.fontFamily).toBe('Courier');
    expect(label.style.fontSize).toBe('41px');
    expect(label.style.color).toBe('rgb(171, 205, 239)'); // #abcdef
    expect(label.style.top).toBe('7px');
    expect(label.style.left).toBe('8px');
    expect(label.style.fontWeight).toBe('400');
  });

  it('overrides pip geometry from tokens', () => {
    const { container } = draw(item('pip', [src(0), src(1)]), {
      multiClip: { pip: { width: 100, height: 200, right: 5, bottom: 6, borderPx: 2, borderColor: '#00ff00' } },
    });
    const box = container.querySelector('[data-pip-box]') as HTMLElement;
    expect(box.style.width).toBe('100px');
    expect(box.style.height).toBe('200px');
    expect(box.style.border).toBe('2px solid rgb(0, 255, 0)');
  });

  it('overrides the quad gap from tokens', () => {
    const { container } = draw(item('quad', [src(0), src(1), src(2), src(3)]), { multiClip: { quadGapPx: 17 } });
    expect((container.querySelector('[data-multiclip-layout]') as HTMLElement).style.gap).toBe('17px');
  });

  it('draws no label when the sub-source has none', () => {
    const { container } = draw(item('split-h', [src(0), src(1)]));
    expect(container.querySelector('[data-pane-label]')).toBeNull();
  });
});
