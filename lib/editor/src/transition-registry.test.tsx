// THE BRAND TIER OF THE TRANSITION AXIS (Phase 4 Task 1.2).
//
// What this file pins is what the task ADDED, not what it preserved: a
// transition kind core has never heard of resolves to the BRAND's renderer and
// renders, and a kind the brand DECLARED stops warning as unrecognised. The 20
// core kinds resolving unchanged is covered by at-cut-transitions.test.tsx
// (every catalog kind, derived from the catalog) and is deliberately not
// re-tested here beyond the two mixing cases that only make sense with a
// registry present.
//
// The lines under test, by mutation:
//   lib/render/at-cut-transitions.tsx  `resolveRegistered(registry, kind, CORE_TRANSITIONS)`
//     → `CORE_TRANSITIONS[kind]` makes "a brand-only kind renders" and "brand
//       wins over the generic" go red, and nothing else in the suite moves.
//   lib/render/at-cut-transitions.tsx  the `known` gate's brand-registry arm
//     → dropping it makes "a brand-only kind renders" go red.
//   lib/render/video-track.tsx         `const brandKinds = …Object.keys(opts.transitions)`
//     → `undefined` makes "a declared brand kind does not warn" go red. That is
//       the anti-cry-wolf pin: without it every brand kind warns on the very
//       reels it renders correctly, and a warning nobody reads is worthless for
//       the typo it exists to catch.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const clock = vi.hoisted(() => ({ frame: 0 }));

vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  return {
    ...actual,
    useCurrentFrame: () => clock.frame,
    useVideoConfig: () => ({ width: 1080, height: 1920, fps: 30, durationInFrames: 300, id: 'test', defaultProps: {}, props: {} }),
    staticFile: (s: string) => s,
  };
});

import { presentationFor, type TransitionRecord } from '@video-toolkit/lib/render/at-cut-transitions';
import { buildVideoNodes } from '@video-toolkit/lib/render/video-track';
import { resetWarnOnce } from '@video-toolkit/lib/render/warn-once';
import type { AnyPresentation, TransitionRegistry, TransitionRenderProps } from '@video-toolkit/lib/theming/transitions';
import type { AccentSlot } from '@video-toolkit/lib/theming/palette';
import type { VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

const DIMS = { width: 1080, height: 1920 };
const PALETTE: readonly AccentSlot[] = [{ key: 'primary', label: 'Primary', color: '#123456' }];

// A brand's own presentation. Nothing about it is known to core — the kind
// ('sand-sweep') is not in the catalog, and its param ('grains') is not in any
// core schema; `BrandTransitionSchema` is passthrough, so it survives to here.
const BrandSweep: React.FC<Record<string, unknown>> = () => null;

function brandRenderer(seen?: TransitionRenderProps[]) {
  return (props: TransitionRenderProps): AnyPresentation => {
    seen?.push(props);
    return { component: BrandSweep, props: { grains: (props.transition as Record<string, unknown>).grains, config: props.config } };
  };
}

describe('a brand-registered transition kind (the capability this task adds)', () => {
  it('resolves to the BRAND’s renderer for a kind core has never heard of', () => {
    const seen: TransitionRenderProps[] = [];
    const transitions: TransitionRegistry = { 'sand-sweep': { renderer: brandRenderer(seen) } };
    const t = { kind: 'sand-sweep', frames: 20, grains: 7 } as unknown as TransitionRecord;

    const p = presentationFor(t, { ...DIMS, transitions });

    expect(p).not.toBeNull();
    expect(p!.component).toBe(BrandSweep);
    // The brand's own param reached its own presentation — core never named it.
    expect(p!.props.grains).toBe(7);
    expect(seen).toHaveLength(1);
    expect(seen[0].transition).toBe(t);
  });

  it('is a hard cut when NO registry is threaded — the same kind, minus the tier', () => {
    const t = { kind: 'sand-sweep', frames: 20, grains: 7 } as unknown as TransitionRecord;
    expect(presentationFor(t, DIMS)).toBeNull();
  });

  it('receives the composition size, the brand palette and its registration config', () => {
    const seen: TransitionRenderProps[] = [];
    const transitions: TransitionRegistry = {
      'sand-sweep': { renderer: brandRenderer(seen), config: { softness: 0.4 } },
    };
    presentationFor({ kind: 'sand-sweep', frames: 20 } as unknown as TransitionRecord, {
      ...DIMS,
      palette: PALETTE,
      transitions,
    });

    expect(seen[0]).toMatchObject({ width: 1080, height: 1920, config: { softness: 0.4 } });
    expect(seen[0].palette).toBe(PALETTE);
  });

  it('hands a renderer an EMPTY palette rather than undefined when the composition has none', () => {
    const seen: TransitionRenderProps[] = [];
    const transitions: TransitionRegistry = { 'sand-sweep': { renderer: brandRenderer(seen) } };
    presentationFor({ kind: 'sand-sweep', frames: 20 } as unknown as TransitionRecord, { ...DIMS, transitions });
    expect(seen[0].palette).toEqual([]);
  });
});

describe('registry semantics — the same four the other axes settled', () => {
  it('a brand renderer WINS over the core generic for a core kind', () => {
    const transitions: TransitionRegistry = { fade: { renderer: brandRenderer() } };
    const t = { kind: 'fade', frames: 15 } as TransitionRecord;

    expect(presentationFor(t, { ...DIMS, transitions })!.component).toBe(BrandSweep);
    // …and only for the kind it registered.
    expect(presentationFor({ kind: 'dissolve', frames: 15 } as TransitionRecord, { ...DIMS, transitions })!.component)
      .not.toBe(BrandSweep);
  });

  it('a CONFIG-ONLY registration does NOT mask the core generic', () => {
    const transitions: TransitionRegistry = { fade: { config: { note: 'tuning only' } } };
    const withRegistry = presentationFor({ kind: 'fade', frames: 15 } as TransitionRecord, { ...DIMS, transitions });
    const without = presentationFor({ kind: 'fade', frames: 15 } as TransitionRecord, DIMS);

    expect(withRegistry).not.toBeNull();
    expect(withRegistry!.component).not.toBe(BrandSweep);
    expect(withRegistry!.component).toBe(without!.component);
    expect(withRegistry!.props).toEqual(without!.props);
  });

  it('a config-only registration for a kind core CANNOT draw resolves to nothing (hard cut), never throws', () => {
    const transitions: TransitionRegistry = { 'sand-sweep': { config: { softness: 0.4 } } };
    expect(() =>
      presentationFor({ kind: 'sand-sweep', frames: 20 } as unknown as TransitionRecord, { ...DIMS, transitions }),
    ).not.toThrow();
    expect(presentationFor({ kind: 'sand-sweep', frames: 20 } as unknown as TransitionRecord, { ...DIMS, transitions })).toBeNull();
  });

  it('an unknown kind still SKIPS silently with a registry in scope', () => {
    const transitions: TransitionRegistry = { 'sand-sweep': { renderer: brandRenderer() } };
    expect(presentationFor({ kind: 'no-such-kind', frames: 20 } as unknown as TransitionRecord, { ...DIMS, transitions })).toBeNull();
  });

  it('an Object.prototype member is still not a renderer, registry or not', () => {
    const transitions: TransitionRegistry = { 'sand-sweep': { renderer: brandRenderer() } };
    for (const kind of ['constructor', 'toString', 'hasOwnProperty', '__proto__', 'valueOf']) {
      const bogus = { kind, frames: 15 } as unknown as TransitionRecord;
      expect(presentationFor(bogus, { ...DIMS, transitions }), kind).toBeNull();
      expect(presentationFor(bogus, DIMS), kind).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// The other half of the wiring: buildVideoNodes threads the registry AND feeds
// its keys to the unrecognised-kind warning.

const items: VideoItem[] = [
  { id: 'a', kind: 'clip', startMs: 0, endMs: 1000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 1000,
    transitionOut: { kind: 'sand-sweep', frames: 20 } as never },
  { id: 'b', kind: 'clip', startMs: 1000, endMs: 2000, source: 'b.mp4', sourceInMs: 0, sourceOutMs: 1000 },
];

function build(transitions?: TransitionRegistry) {
  const warned: string[] = [];
  const spy = vi.spyOn(console, 'warn').mockImplementation((m: string) => void warned.push(m));
  try {
    const nodes = buildVideoNodes(items, {
      renderItem: () => null,
      width: 1080,
      height: 1920,
      fps: 30,
      transitions,
    });
    return { nodes, warned };
  } finally {
    spy.mockRestore();
  }
}

describe('buildVideoNodes threads the registry', () => {
  beforeEach(() => resetWarnOnce());

  it('renders a brand kind through the brand’s renderer, end to end from the theme', () => {
    const seen: TransitionRenderProps[] = [];
    build({ 'sand-sweep': { renderer: brandRenderer(seen) } });
    // Twice: item A's transitionOut is also item B's transitionIn (a boundary
    // is rendered by both sides of the cut).
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((p) => p.transition.kind === 'sand-sweep')).toBe(true);
  });

  it('does NOT warn about a kind the brand declared (the anti-cry-wolf pin)', () => {
    const { warned } = build({ 'sand-sweep': { renderer: brandRenderer() } });
    expect(warned).toEqual([]);
  });

  it('declaring the kind with config ONLY is enough to silence the warning', () => {
    const { warned } = build({ 'sand-sweep': { config: {} } });
    expect(warned).toEqual([]);
  });

  it('still warns — once — about a kind nobody declared', () => {
    const { warned } = build({ 'other-kind': { renderer: brandRenderer() } });
    expect(warned).toHaveLength(1);
    expect(warned[0]).toContain('sand-sweep');
  });

  it('warns when no registry is threaded at all', () => {
    const { warned } = build(undefined);
    expect(warned).toHaveLength(1);
    expect(warned[0]).toContain('sand-sweep');
  });
});
