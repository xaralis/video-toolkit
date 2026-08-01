// PER-NODE `enabled` — what Phase 4 Task 1.5 ADDED.
//
// Deliberately NOT "an effect with no `enabled` field still renders" or "a
// transition without the field still gets its handles": that is what the change
// PRESERVES, it is what every existing test in this suite and every cell of
// examples/layered-minimal's pixel harness already measures byte-for-byte, and
// pinning it here would prove nothing about the new capability.
//
// What this file pins is the capability that did not exist before —
//
//   a node carrying `enabled: false` is SKIPPED ENTIRELY, on BOTH axes, with
//   its authored parameters left intact for the toggle back.
//
// The two implementing lines are:
//   - effects:     `if (!isNodeEnabled(effect)) continue;`  (lib/theming/effects/index.ts)
//   - transitions: `if (!isNodeEnabled(raw)) return undefined;` (lib/render/transition-record.ts)
// Each is pinned separately below, because they are two different skips in two
// different files and deleting either one must go red on its own.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

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

import { applyEffects, type EffectRenderProps } from '@video-toolkit/lib/theming/effects';
import type { BrandTheme } from '@video-toolkit/lib/theming/types';
import type { VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';
import { getTransitionRecord } from '@video-toolkit/lib/render/transition-record';
import { computeVideoLayout } from '@video-toolkit/lib/render/video-track-layout';
import { EffectSchema } from '@video-toolkit/lib/reel-config-base/layered-schema';
import { TransitionSchema } from '@video-toolkit/lib/reel-config-base/transition-schema';
import { isNodeEnabled } from '@video-toolkit/lib/reel-config-base/node-enabled';

const NO_HANDLES = { inHalf: 0, outHalf: 0 };

const item = (effects: VideoItem['effects']): VideoItem => ({
  id: 'v1',
  kind: 'photo',
  startMs: 0,
  endMs: 3000,
  source: 'photos/a.jpg',
  effects,
});

const Wrapper: React.FC<EffectRenderProps> = ({ children }) => <div data-w="wrapper">{children}</div>;
const Second: React.FC<EffectRenderProps> = ({ children }) => <div data-w="second">{children}</div>;

describe('effects axis: `enabled: false` skips the node', () => {
  it('does not resolve, invoke or wrap a disabled effect', () => {
    let invoked = 0;
    const Counting: React.FC<EffectRenderProps> = ({ children }) => {
      invoked += 1;
      return <div data-w="counting">{children}</div>;
    };
    const theme: BrandTheme = { accentSlots: [], effects: { grain: { renderer: Counting } } };
    const media = <span data-w="media" />;

    const node = applyEffects(theme, item([{ type: 'grain', enabled: false }]), NO_HANDLES, media);

    render(<>{node}</>);
    expect(invoked).toBe(0);
    // REFERENTIALLY unchanged: no wrapper is allocated at all, so a disabled
    // effect costs exactly what deleting the entry would.
    expect(node).toBe(media);
  });

  it('skips only the disabled entry and keeps the rest of the stack in order', () => {
    const theme: BrandTheme = { accentSlots: [], effects: { grain: { renderer: Wrapper }, scanlines: { renderer: Second } } };
    const node = applyEffects(
      theme,
      item([{ type: 'grain', enabled: false }, { type: 'scanlines' }]),
      NO_HANDLES,
      <span data-w="media" />,
    );
    const { container } = render(<>{node}</>);
    expect(container.querySelector('[data-w="wrapper"]')).toBeNull();
    expect(container.querySelector('[data-w="second"] [data-w="media"]')).not.toBeNull();
  });

  it('keeps the disabled entry’s authored params — this is a switch, not a delete', () => {
    // The whole point of the field over deleting the entry: flipping it back
    // must restore the look, so the params have to survive the parse.
    const parsed = EffectSchema.parse({ type: 'grain', enabled: false, opacity: 0.42 });
    expect(parsed).toMatchObject({ type: 'grain', enabled: false, opacity: 0.42 });
  });
});

describe('transitions axis: `enabled: false` skips the node', () => {
  it('is dropped by the gate, exactly like a hard cut', () => {
    expect(getTransitionRecord({ kind: 'dissolve', frames: 12, enabled: false })).toBeUndefined();
  });

  it('lends NO handle frames, so both clips sit at their authored positions', () => {
    const pair = (t: Record<string, unknown>) => [
      { startMs: 0, endMs: 1000, transitionOut: t },
      { startMs: 1000, endMs: 2000 },
    ];
    const off = computeVideoLayout(pair({ kind: 'dissolve', frames: 10, enabled: false }), 30);

    expect(off[0].outHalf).toBe(0);
    expect(off[0].outFrames).toBe(0);
    expect(off[1].inHalf).toBe(0);
    // Frame 30 is the cut; with the transition off, clip B starts ON it rather
    // than 5 frames early.
    expect(off[1].seqFrom).toBe(30);
  });

  it('keeps the disabled transition’s authored params through the parse', () => {
    const parsed = TransitionSchema.parse({ kind: 'wipe', frames: 20, direction: 'left', enabled: false });
    expect(parsed).toMatchObject({ kind: 'wipe', frames: 20, direction: 'left', enabled: false });
  });
});

describe('isNodeEnabled — the one decider both axes read', () => {
  it('disables on the LITERAL false only, so a hand-edited falsy value is not a silent delete', () => {
    expect(isNodeEnabled({ enabled: false })).toBe(false);
    for (const v of [0, '', null, NaN]) expect(isNodeEnabled({ enabled: v })).toBe(true);
  });
});
