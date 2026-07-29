import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Phase 4 Task 3.3 — `scope: 'media'` via React context.
//
// Three capabilities this task ADDS, each pinned by its own describe block,
// matching the three mandated mutations in the task brief / CONSTRAINTS.md:
//
//  1. CONTEXT DELIVERY: a `scope: 'media'` effect on an item, resolved by
//     `renderVideoItemNode`, reaches the media element inside SegmentMedia —
//     via `MediaEffectsContext`, not a prop (verified: neither brand repo
//     forwards extra props to SegmentMedia).
//  2. THE BOUNDARY: `GenericMultiClip` resets that delivery for its synthetic
//     sub-items, so a parent item's media effects do not leak onto every pane.
//  3. `mediaStyle`: the media-scope effect receives the SAME computed style
//     SegmentMedia applies to its own element (crop + style-effects + grade),
//     not a recomputed or stale one.
// ---------------------------------------------------------------------------

const frameState = vi.hoisted(() => ({ frame: 0 }));
const captured = vi.hoisted(() => ({ img: [] as any[], video: [] as any[] }));

vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  return {
    ...actual,
    useCurrentFrame: () => frameState.frame,
    useVideoConfig: () => ({ fps: 30, width: 1080, height: 1920 }),
    staticFile: (s: string) => s,
    Img: (props: any) => {
      captured.img.push(props);
      return <img data-testid="media" />;
    },
    OffthreadVideo: (props: any) => {
      captured.video.push(props);
      return <video data-testid="media" />;
    },
  };
});

import { renderVideoItemNode } from '@video-toolkit/lib/render/layered-composition';
import { GenericMultiClip } from '@video-toolkit/lib/theming/generic/GenericMultiClip';
import { MediaEffectsContext } from '@video-toolkit/lib/theming/effects/media-effects-context';
import type { CompositionTheme } from '@video-toolkit/lib/theming/types';
import type { VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';
import type { EffectRenderer } from '@video-toolkit/lib/theming/effects';

const NO_HANDLES = { inHalf: 0, outHalf: 0 };

const photo = (effects?: VideoItem['effects'], crop?: Record<string, unknown>): VideoItem => ({
  id: 'p1',
  kind: 'photo',
  startMs: 0,
  endMs: 3000,
  source: 'photos/a.jpg',
  ...(effects ? { effects } : {}),
  ...(crop ? { crop } : {}),
});

// A media-scope effect renderer that marks its own wrapper in the DOM, so
// presence/absence is a plain `querySelector` check, and captures the
// `mediaStyle` it was handed for the mediaStyle-fidelity assertions.
const wrapCalls = vi.hoisted(() => ({ mediaStyles: [] as any[] }));
const WrapEffect: EffectRenderer = ({ children, mediaStyle }) => {
  wrapCalls.mediaStyles.push(mediaStyle);
  return <div data-wrap="">{children}</div>;
};

beforeEach(() => {
  frameState.frame = 0;
  captured.img.length = 0;
  captured.video.length = 0;
  wrapCalls.mediaStyles.length = 0;
});

describe('scope: "media" — context delivery (renderVideoItemNode -> SegmentMedia)', () => {
  it('a media-scope effect wraps the media element', () => {
    const theme = {
      accentSlots: [],
      background: '#000',
      effects: { blend: { renderer: WrapEffect, scope: 'media' } },
    } as unknown as CompositionTheme;

    const node = renderVideoItemNode(theme, photo([{ type: 'blend' }]), NO_HANDLES);
    const { container } = render(<>{node}</>);

    const wrap = container.querySelector('[data-wrap]');
    expect(wrap).not.toBeNull();
    expect(wrap!.querySelector('[data-testid="media"]')).not.toBeNull();
  });

  it('default scope ("clip", unset) is unaffected — a clip-scope registration of the SAME shape still wraps the whole item, not the media', () => {
    const theme = {
      accentSlots: [],
      background: '#000',
      effects: { outer: { renderer: WrapEffect } }, // no `scope` -> 'clip', the pre-3.3 axis
    } as unknown as CompositionTheme;

    const node = renderVideoItemNode(theme, photo([{ type: 'outer' }]), NO_HANDLES);
    const { container } = render(<>{node}</>);

    // Still wraps (applyEffects, unchanged) — but mediaStyle is undefined,
    // because a clip-scope effect never sees SegmentMedia's computed style.
    expect(container.querySelector('[data-wrap]')).not.toBeNull();
    expect(wrapCalls.mediaStyles[0]).toBeUndefined();
  });
});

describe('MediaEffectsBoundary — GenericMultiClip does not leak media effects onto its panes', () => {
  const multiClipItem: VideoItem = {
    id: 'mc1',
    kind: 'multi-clip',
    startMs: 0,
    endMs: 4000,
    layout: 'split-h',
    sources: [
      { source: 'broll/c0.mp4', sourceInMs: 0, sourceOutMs: 2000 },
      { source: 'broll/c1.mp4', sourceInMs: 0, sourceOutMs: 2000 },
    ],
  } as any;

  const fakeEntry = {
    effect: { type: 'blend' },
    index: 0,
    Renderer: WrapEffect,
    config: undefined,
  };

  it('a media effect provided ABOVE GenericMultiClip does not reach any pane', () => {
    const { container } = render(
      <MediaEffectsContext.Provider value={[fakeEntry]}>
        <GenericMultiClip item={multiClipItem} handles={NO_HANDLES} />
      </MediaEffectsContext.Provider>,
    );
    expect(container.querySelectorAll('[data-wrap]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-testid="media"]')).toHaveLength(2);
  });
});

describe('EffectRenderProps.mediaStyle — lines up with the media it decorates', () => {
  it('a media-scope effect receives the SAME style object SegmentMedia applied to its element', () => {
    const theme = {
      accentSlots: [],
      background: '#000',
      effects: { blend: { renderer: WrapEffect, scope: 'media' } },
    } as unknown as CompositionTheme;

    // crop.width 0.5 -> cropCoverStyle emits transform: 'scale(2)' (same fact
    // the Task 3.1 merge baseline pins), so this is a real, checkable value —
    // not a placeholder.
    const item = photo([{ type: 'blend' }], { width: 0.5 });
    const node = renderVideoItemNode(theme, item, NO_HANDLES);
    render(<>{node}</>);

    expect(wrapCalls.mediaStyles[0]?.transform).toBe('scale(2)');
    expect(wrapCalls.mediaStyles[0]).toBe(captured.img[0].style);
  });
});
