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
import { CORE_STYLE_EFFECT_TYPES, applyStyleEffects } from '@video-toolkit/lib/theming/effects';
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

// ---------------------------------------------------------------------------
// THE BYPASS ITSELF, not just its one instance.
//
// `applyEffects` (lib/theming/effects/index.ts) skips every RESERVED type
// BEFORE its `isNodeEnabled` test — reserved-ness is DERIVED as of Phase 4
// Task 3.2 (`isReservedEffectType`, style-effect.ts), not a hand-maintained
// list, but CORE's own reserved types are still exactly
// `CORE_STYLE_EFFECT_TYPES` (the keys of its style-effect registry). Every
// core reserved type needs its OWN enable test on its own render path — a
// comment says so; nothing failed if a second one arrived without one. This
// is that failure.
//
// The set has exactly one member today, so this is cheap insurance rather than
// coverage: adding a core style-effect type without registering a probe here
// makes the completeness assertion red, which is the point.
// ---------------------------------------------------------------------------
describe('every CORE_STYLE_EFFECT_TYPE honours `enabled: false` on its own path', () => {
  /** type → a probe that returns TRUE when a disabled entry of that type is
   *  correctly ignored by the path that renders it. */
  const PROBES: Record<string, () => boolean> = {
    // `findKenBurns` is declared over the minimal `{ type: string }`, so the
    // extra authored keys go through a widened local rather than an inline
    // literal (excess-property check).
    'ken-burns': () => {
      const effects: Array<{ type: string }> = [{ type: 'ken-burns', direction: 'in', enabled: false } as { type: string }];
      return findKenBurns(effects) === undefined;
    },
    // `grade` has no bespoke finder of its own (Phase 4 Task 3.4) — both
    // routes onto it (the `item.grade` synthetic entry, and an authored
    // `type: 'grade'` array entry) go through `applyStyleEffects`'s ONE
    // generic `isNodeEnabled` test. This probes the array-entry route
    // directly; `item.grade` itself has no `enabled` field to disable (see
    // `syntheticGradeEffect`'s doc in style-effect.ts).
    grade: () => {
      const item = { id: 'g1', kind: 'photo' as const, startMs: 0, endMs: 3000, source: 'photos/a.jpg' };
      const frag = applyStyleEffects(undefined, { ...item, effects: [{ type: 'grade', brightness: 1.5, enabled: false }] }, 0, 90);
      return frag.filter === undefined;
    },
  };

  it('has a probe for every core style-effect type — add one when you add a type', () => {
    expect([...CORE_STYLE_EFFECT_TYPES].sort()).toEqual(Object.keys(PROBES).sort());
  });

  for (const type of CORE_STYLE_EFFECT_TYPES) {
    it(`'${type}' ignores a disabled entry`, () => {
      expect(PROBES[type], `no enable probe registered for reserved type '${type}'`).toBeDefined();
      expect(PROBES[type]()).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// THE GENERIC PIPELINE ALSO HONOURS IT — not just `findKenBurns`.
//
// Phase 4 Task 3.2 dissolves the "each reserved path carries its own enable
// check" coupling the comments above describe historically: `applyStyleEffects`
// (style-effect.ts) applies ONE generic `isNodeEnabled` test to EVERY
// style-axis type, so a brand's own style-effect registration gets `enabled:
// false` support for free, without writing a bespoke finder like
// `findKenBurns`. This is that generic path, exercised directly (not via
// SegmentMedia), so the two mechanisms are pinned independently.
// ---------------------------------------------------------------------------
describe('applyStyleEffects (the generic pipeline) honours enabled: false directly', () => {
  it('a disabled ken-burns entry contributes no fragment', async () => {
    const { applyStyleEffects } = await import('@video-toolkit/lib/theming/effects/style-effect');
    const item = { id: 'p1', kind: 'photo' as const, startMs: 0, endMs: 3000, source: 'photos/a.jpg' };
    const frag = applyStyleEffects(undefined, { ...item, effects: [{ type: 'ken-burns', direction: 'in', enabled: false }] }, 10, 90);
    expect(frag).toEqual({});
  });

  it('an enabled ken-burns entry contributes a transform', async () => {
    const { applyStyleEffects } = await import('@video-toolkit/lib/theming/effects/style-effect');
    const item = { id: 'p1', kind: 'photo' as const, startMs: 0, endMs: 3000, source: 'photos/a.jpg' };
    const frag = applyStyleEffects(undefined, { ...item, effects: [{ type: 'ken-burns', direction: 'in' }] }, 10, 90);
    expect(frag.transform).toContain('scale(');
  });
});
