// THE `cut` COLLAPSE — Phase 4 Task 1.5.
//
// `cut` used to be recognised by SEVEN independently written checks, all of them
// in the path that decides whether a boundary renders anything at all:
//
//   1. lib/reel-config-base/transition-schema.ts — the catalog entry's literal
//   2. lib/reel-config-base/transition-schema.ts — `kindNeedsFrames`
//   3. lib/render/transition-record.ts           — `TransitionRecord`'s Exclude
//   4. lib/render/transition-record.ts           — the runtime gate
//   5. lib/render/at-cut-transitions.tsx         — the render map's key
//   6. lib/editor/src/timeline/layered-adapter.ts — the transitions lane, in-edge
//   7. lib/editor/src/timeline/layered-adapter.ts — the transitions lane, out-edge
//
// They now read ONE exported predicate (`isCut`) over ONE exported literal
// (`CUT_KIND`), the same pattern `isTransitionAlignment` established in 1.4.
//
// WHAT THIS FILE HAS TO PROVE. Not that `isCut('cut')` is true in isolation —
// that would pass just as well with a new helper sitting BESIDE seven unchanged
// copies. Every case below is asserted at a CALL SITE's observable behaviour, so
// mutating the predicate (or the constant) turns them red. That is the evidence
// the collapse is real.
import { describe, it, expect } from 'vitest';
import {
  isCut,
  CUT_KIND,
  kindNeedsFrames,
  TRANSITION_CATALOG,
} from '@video-toolkit/lib/reel-config-base/transition-schema';
import { getTransitionRecord } from '@video-toolkit/lib/render/transition-record';
import { resolveTransition } from '@video-toolkit/lib/render/at-cut-transitions';
import { computeVideoLayout } from '@video-toolkit/lib/render/video-track-layout';
import { layeredToTimeline } from './timeline/layered-adapter';
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';

const DIMS = { width: 1080, height: 1920 };

// Every fixture below carries `frames` ALONGSIDE `kind: 'cut'`. That pairing is
// invalid per the schema and therefore only ever reaches these functions off a
// hand-edited Root.tsx — which is exactly the input a cut check exists to
// survive, and the only input that tells a working `isCut` apart from a broken
// one at the sites that also test `frames`.
const CUT_WITH_FRAMES = { kind: CUT_KIND, frames: 12 };

describe('site 4 — the render-path gate drops a cut', () => {
  it('returns no record, so the boundary renders nothing', () => {
    expect(getTransitionRecord(CUT_WITH_FRAMES)).toBeUndefined();
  });
});

describe('sites 4 + the layout — a cut lends no handle frames', () => {
  it('leaves both clips at their authored positions', () => {
    const layout = computeVideoLayout(
      [
        { startMs: 0, endMs: 1000, transitionOut: CUT_WITH_FRAMES },
        { startMs: 1000, endMs: 2000 },
      ],
      30,
    );
    expect(layout[0].outHalf).toBe(0);
    expect(layout[1].inHalf).toBe(0);
    expect(layout[1].seqFrom).toBe(30);
  });
});

// TRANSPARENCY, same as the compiler-tie note on sites 1+5 below: this block
// CANNOT be killed by mutating `isCut`, and it duplicates
// `app/transitions.test.ts`'s own kindNeedsFrames coverage. Site 2's `cut`
// clause was DEAD CODE — `kindNeedsFrames` looks the kind up in the catalog
// first and only falls through to the literal for an UNKNOWN kind, and `cut` is
// a catalog kind. It is kept as documentation of that finding, not as a pin.
// The live half of the assertion (every OTHER kind takes frames) is real.
describe('site 2 — kindNeedsFrames', () => {
  it('is the ONLY kind that takes no `frames`', () => {
    expect(kindNeedsFrames(CUT_KIND)).toBe(false);
    for (const { kind } of TRANSITION_CATALOG) {
      if (kind === CUT_KIND) continue;
      expect(kindNeedsFrames(kind), `${kind} should take frames`).toBe(true);
    }
  });
});

describe('sites 1 + 5 — the catalog entry and the render map are keyed by CUT_KIND', () => {
  it('the catalog still offers a kind literally named "cut"', () => {
    expect(TRANSITION_CATALOG.map((e) => e.kind)).toContain('cut');
  });

  it('resolves to no presentation — a hard cut, not a missing renderer', () => {
    // Reached directly (not via the gate) because the gate filters `cut` out
    // long before here; this is the map entry's own behaviour.
    //
    // PORTED from `presentationFor` (deleted — see
    // docs/superpowers/specs/2026-08-01-unified-transition-contract-design.md):
    // `presentationFor` was a thin wrapper over `resolveTransition`, unwrapping
    // to null for a native two-input node too; `cut` never reaches that branch
    // (its render-map entry is `() => null` directly), so the assertion is
    // identical against the function underneath.
    expect(resolveTransition({ kind: CUT_KIND } as never, DIMS)).toBeNull();
  });
});

describe('sites 6 + 7 — the editor’s transitions lane', () => {
  const base: LayeredReel = {
    version: 'layered-1',
    meta: { topic: 'Fixture', totalDurationMs: 9000 },
    tracks: {
      video: [],
      audio: [],
      music: { baseVolumeDb: -8 },
      overlays: [],
      brand: [],
    },
  };
  const clip = (id: string, startMs: number, endMs: number, extra: Record<string, unknown> = {}) => ({
    id,
    kind: 'clip' as const,
    startMs,
    endMs,
    source: `${id}.mp4`,
    sourceInMs: 0,
    sourceOutMs: endMs - startMs,
    ...extra,
  });
  const lane = (reel: LayeredReel) =>
    layeredToTimeline(reel, 30).editorData.find((r) => r.id === 'transitions')!.actions;

  it('draws no marker for a cut on the OUT edge, even one carrying frames', () => {
    const reel: LayeredReel = {
      ...base,
      tracks: { ...base.tracks, video: [clip('A', 0, 5000, { transitionOut: CUT_WITH_FRAMES }), clip('B', 5000, 9000)] },
    };
    expect(lane(reel)).toHaveLength(0);
  });

  it('draws no marker for a cut on the reel’s leading IN edge either', () => {
    const reel: LayeredReel = {
      ...base,
      tracks: { ...base.tracks, video: [clip('A', 0, 5000, { transitionIn: CUT_WITH_FRAMES })] },
    };
    expect(lane(reel)).toHaveLength(0);
  });
});

describe('isCut — the shared semantics the seven sites now agree on', () => {
  it('answers "nothing here" for absent, kindless and cut alike', () => {
    expect(isCut(undefined)).toBe(true);
    expect(isCut(null)).toBe(true);
    expect(isCut({})).toBe(true);
    expect(isCut({ kind: '' })).toBe(true);
    expect(isCut(CUT_KIND)).toBe(true);
    expect(isCut({ kind: CUT_KIND })).toBe(true);
  });

  it('answers "a real transition" for every other catalog kind and for a brand kind', () => {
    for (const { kind } of TRANSITION_CATALOG) {
      if (kind === CUT_KIND) continue;
      expect(isCut({ kind, frames: 12 }), kind).toBe(false);
    }
    expect(isCut({ kind: 'brand-only-swirl', frames: 12 })).toBe(false);
  });
});
