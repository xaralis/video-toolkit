// `enabled: false` ON THE RESERVED PATH — the hole Task 1.5's review found.
//
// `ken-burns` is a RESERVED effect type: `applyEffects` skips reserved types
// BEFORE it reaches its own `isNodeEnabled` check, because the movement is
// composed into the media element's own transform inside `SegmentMedia` rather
// than wrapped around it. That makes the reserved path a SECOND, independent
// route from the authored `effects[]` to the frame — and until this test it had
// no enable test at all, so `{ type: 'ken-burns', enabled: false }` parsed,
// validated, and still moved the picture. On the one effect core itself renders
// and the editor itself offers.
//
// The implementing line is `findKenBurns` in lib/theming/effects/ken-burns.ts:
// `e.type === 'ken-burns' && isNodeEnabled(e)`. Pinned at the RENDER level (no
// transform reaches the element) as well as at the finder, because "the finder
// returns undefined" would not by itself prove SegmentMedia stops moving.
//
// The ENABLED case is the preserved half and is already covered by
// segment-media.test.tsx + ken-burns-parity.test.ts; one assertion below keeps
// the two cases side by side so the test cannot pass by never moving at all.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const frameState = vi.hoisted(() => ({ frame: 0 }));
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

import { SegmentMedia } from '@video-toolkit/lib/theming/segment/SegmentMedia';
import { findKenBurns } from '@video-toolkit/lib/theming/effects/ken-burns';
import type { VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

const photo = (effects: VideoItem['effects']): VideoItem => ({
  id: 'p1',
  kind: 'photo' as const,
  startMs: 0,
  endMs: 3000,
  source: 'photos/a.jpg',
  effects,
});

beforeEach(() => {
  frameState.frame = 10;
  captured.img.length = 0;
});

describe('reserved path: a DISABLED ken-burns does not move the picture', () => {
  it('puts no ken-burns transform on the element', () => {
    render(<SegmentMedia item={photo([{ type: 'ken-burns', direction: 'in', enabled: false }])} handles={{ inHalf: 0, outHalf: 0 }} />);

    expect(captured.img).toHaveLength(1);
    // No crop either, so the element should carry NO transform at all — the
    // exact styling an item with an empty `effects[]` would get.
    expect(captured.img[0].style.transform).toBeFalsy();
  });

  it('still moves when the same effect is enabled — the two cases differ', () => {
    render(<SegmentMedia item={photo([{ type: 'ken-burns', direction: 'in' }])} handles={{ inHalf: 0, outHalf: 0 }} />);

    expect(captured.img[0].style.transform).toContain('scale(');
  });

  it('skips only the disabled entry, so a second ENABLED ken-burns still applies', () => {
    // The finder returns the FIRST match; a disabled entry must not shadow a
    // live one behind it.
    render(
      <SegmentMedia
        item={photo([
          { type: 'ken-burns', direction: 'in', enabled: false },
          { type: 'ken-burns', direction: 'in' },
        ])}
        handles={{ inHalf: 0, outHalf: 0 }}
      />,
    );

    expect(captured.img[0].style.transform).toContain('scale(');
  });
});

describe('findKenBurns', () => {
  it('does not return a disabled entry, and keeps its authored params in the config', () => {
    const effects = [{ type: 'ken-burns', direction: 'in', enabled: false }];
    expect(findKenBurns(effects)).toBeUndefined();
    // The entry is still THERE — this is a switch, not a delete.
    expect(effects[0]).toMatchObject({ direction: 'in', enabled: false });
  });
});
