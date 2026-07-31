// ONE `wipe` — the gallery must demonstrate the component reels render.
// (Phase 4 Task 2.5.)
//
// The fork this file exists to prevent: `lib/render/at-cut-transitions.tsx`
// mapped `wipe` to the TOOLKIT's own presentation while
// `lib/transitions/TransitionGallery.tsx` imported `@remotion/transitions/wipe`
// and showed THAT under the same label. Two components, one name — which is
// why the gallery would never have caught the `wipe` defect Task 2.1 fixed: it
// was never showing the broken component.
//
// THIS IS PINNED BEHAVIOURALLY, NOT BY AN IMPORT CHECK. An import assertion
// would be satisfied by a gallery that imports the right module and then
// renders something else. What follows renders both and compares the pictures.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

const clock = vi.hoisted(() => ({ frame: 0 }));

vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  const react = await import('react');
  const Offset = react.createContext(0);

  // A minimal frame-gating/time-rebasing `Sequence`, additive to this file's
  // existing coverage: every test before fix round 1 drove a `TransitionNode`
  // directly (`pictureOf`), never through `NodeTransitionDemo`/
  // `buildVideoNodes`, so the REAL `Sequence` (which needs a registered
  // `<Composition>` jsdom has none of) was never exercised here. Task 2.1 fix
  // round 1's "the gallery composition renders every kind" pin (below) is the
  // first thing in this file that does.
  const Sequence: React.FC<{
    from?: number;
    durationInFrames?: number;
    layout?: 'none' | 'absolute-fill';
    children?: React.ReactNode;
  }> = ({ from = 0, durationInFrames = Number.POSITIVE_INFINITY, children }) => {
    const parentOffset = react.useContext(Offset);
    const offset = parentOffset + from;
    const local = clock.frame - offset;
    if (local < 0 || local >= durationInFrames) return null;
    return react.createElement(Offset.Provider, { value: offset }, children);
  };

  return {
    ...actual,
    Sequence,
    useCurrentFrame: () => clock.frame - react.useContext(Offset),
    useVideoConfig: () => ({
      width: 1920, height: 1080, fps: 30, durationInFrames: 300,
      id: 'test', defaultProps: {}, props: {},
    }),
    staticFile: (s: string) => s,
  };
});

import { wipe as officialWipe } from '@remotion/transitions/wipe';
import { defaultTransition } from '@video-toolkit/lib/reel-config-base/transition-schema';
import type { TransitionKind } from '@video-toolkit/lib/reel-config-base/transition-schema';
import {
  transitionNodeFor,
  fromRemotionPresentation,
  type TransitionNode,
  type TransitionNodeProps,
  type TransitionRecord,
} from '@video-toolkit/lib/render/at-cut-transitions';
import { TRANSITIONS, transitionMap } from '@video-toolkit/lib/transitions/TransitionGallery';
import { ActiveTransitionProgressContext } from '@video-toolkit/lib/render/video-track-plan';
import { resetWarnOnce } from '@video-toolkit/lib/render/warn-once';

/** The gallery's composition size. Stated here rather than imported, so this
 *  file's RED is an assertion about behaviour and not a missing export. */
const GALLERY_DIMS = { width: 1920, height: 1080, fps: 30 };

/** `glitch` and `burn` mint a per-MOUNT id for their SVG filter/mask
 *  (`String(random(null)).slice(2, 10)`), so two mounts of the SAME component
 *  differ in those digits and in nothing else. Normalised here — anchored to
 *  `id="…"` and `url(#…)` so ordinary numbers inside styles are untouched —
 *  because otherwise this pin would be testing Remotion's `random(null)`
 *  rather than which component the gallery shows. A gallery showing a
 *  different component still differs in structure and style, which is what the
 *  comparison is for. */
const normalizeMountIds = (html: string): string =>
  html.replace(/(\bid="|url\(#)[^"')]*/g, '$1UID');

// Phase 5 Task 1.1 widened `TransitionNode` into a `plan`/`composite` union.
// Task 2.1 is the first to make a CATALOG kind resolve to `plan`
// (`fade`/`dissolve`/`slide`/`flip`/`clock-wipe`/`iris`/colourless
// `fade-to-color`), so `pictureOf` below now branches on the arm instead of
// assuming composite-only.
function compositeOf(node: TransitionNode): React.ComponentType<TransitionNodeProps> {
  if (typeof node.plan === 'function') throw new Error('expected a composite-arm TransitionNode in this test');
  return node.composite;
}

/** The picture a `plan`-arm node draws across its whole window — mirrors what
 *  `LayerShell` (`lib/render/video-track-plan.tsx`) actually applies to an
 *  already-mounted layer: `op.style`/`op.z` as the shell's own style, `op.wrap`
 *  (when declared) mounted `active` around the content, and the live
 *  progress delivered through `ActiveTransitionProgressContext` — the same
 *  context a real `wrap` reads, not a prop. */
const planPictureOf = (node: TransitionNode, durationInFrames = 40): string =>
  [0, 0.25, 0.5, 0.75, 1]
    .map((progress) => {
      const frame = Math.round(progress * durationInFrames);
      const composite = node.plan!({
        from: { range: [0, durationInFrames] },
        to: { range: [0, durationInFrames] },
        progress,
        frame,
        durationInFrames,
        params: {},
        dims: { width: GALLERY_DIMS.width, height: GALLERY_DIMS.height, fps: GALLERY_DIMS.fps },
        palette: [],
        background: 'transparent',
      });
      const renderSide = (side: 'from' | 'to', content: React.ReactNode) => {
        const op = composite[side];
        const style: React.CSSProperties = {
          ...(op?.style ?? {}),
          ...(op?.z === undefined ? {} : { zIndex: op.z }),
        };
        const Wrap = op?.wrap;
        return <div style={style}>{Wrap ? <Wrap active>{content}</Wrap> : content}</div>;
      };
      const { container, unmount } = render(
        <ActiveTransitionProgressContext.Provider value={{ progress, frame, durationInFrames }}>
          {renderSide('from', <div data-testid="a" />)}
          {renderSide('to', <div data-testid="b" />)}
        </ActiveTransitionProgressContext.Provider>,
      );
      const html = normalizeMountIds(container.innerHTML);
      unmount();
      return `p=${progress} ${html}`;
    })
    .join('\n');

/** The picture a node draws across its whole window, as one comparable string.
 *  Both inputs are inert markers, so any difference is the TRANSITION's. */
const pictureOf = (node: TransitionNode): string => {
  if (typeof node.plan === 'function') return planPictureOf(node);
  return [0, 0.25, 0.5, 0.75, 1]
    .map((progress) => {
      const Composite = compositeOf(node);
      const { container, unmount } = render(
        <Composite
          from={<div data-testid="a" />}
          to={<div data-testid="b" />}
          progress={progress}
          durationInFrames={40}
          width={GALLERY_DIMS.width}
          height={GALLERY_DIMS.height}
          fps={GALLERY_DIMS.fps}
          palette={[]}
          background="transparent"
        />,
      );
      const html = normalizeMountIds(container.innerHTML);
      unmount();
      return `p=${progress} ${html}`;
    })
    .join('\n');
};

/** What a REEL draws for this kind — the production resolver, at the gallery's
 *  own dimensions and with the kind's catalog defaults. */
const reelPictureFor = (kind: TransitionKind): string =>
  pictureOf(transitionNodeFor(defaultTransition(kind) as TransitionRecord, GALLERY_DIMS)!);

type Claim = { label: string; kind?: TransitionKind; node?: TransitionNode };

// BOTH TABLES, EACH CHECKED SEPARATELY — and that separation is the point.
//
// `TRANSITIONS` is what the gallery COMPOSITION renders; `transitionMap` only
// feeds `SingleTransitionPreview`. The first version of this file derived its
// cases from `transitionMap` alone, and the original fork could still be
// reconstructed in `TRANSITIONS` (`makeNodeEntry('wipe()','wipe',40)` →
// `makeTransitionEntry('wipe()', fade(), 40)`) with every test green: the
// surviving `transitionMap` entry kept satisfying a union-shaped check. A
// per-table `it.each` is what makes each table answer for itself.
//
// Task 2.6 collapsed the two tables' CONTENTS into one derivation (`transitionMap`
// is now an index into `TRANSITIONS`), and this stayed per-table anyway: they are
// still two distinct SURFACES — the composition and the interactive preview — and
// nothing but this shape stops a future hand-picked entry being slipped back into
// one of them. A union-shaped `claimed` list would let either surface answer on
// the other's behalf, which is exactly how the fork survived round one.
const TABLES: ReadonlyArray<readonly [string, readonly Claim[]]> = [
  ['TRANSITIONS (the gallery composition)', TRANSITIONS.map((e) => ({ label: e.kind, kind: e.kind, node: e.node }))],
  [
    'transitionMap (SingleTransitionPreview)',
    Object.entries(transitionMap).map(([label, e]) => ({ label, kind: e.kind, node: e.node })),
  ],
];

describe.each(TABLES)('the gallery shows what reels render — %s', (_table, entries) => {
  /** Entries claiming a catalog kind, derived rather than hardcoded, so a
   *  second kind added to the gallery is covered the day it is added. */
  const claimed = entries.filter((e) => e.kind !== undefined);

  it('demonstrates the catalog `wipe` at all', () => {
    expect(claimed.map((e) => e.kind)).toContain('wipe');
  });

  it.each(claimed.map((e) => [e.label, e.kind!, e.node] as const))(
    '%s renders exactly the node the reel path resolves for kind "%s"',
    (_label, kind, node) => {
      expect(node).toBeDefined();
      expect(pictureOf(node!)).toBe(reelPictureFor(kind));
    },
  );
});

describe('the gallery shows what reels render', () => {
  // THE FORK ITSELF, pinned. Before Task 2.5 the gallery's `wipe` was
  // @remotion/transitions' own — a clip-path reveal with no coloured sheet —
  // while a reel drew the toolkit's two-beat sweep. If this ever passes, the
  // two have silently become the same thing and the assertion above has stopped
  // meaning anything.
  it('does NOT show @remotion/transitions/wipe, which is a different component', () => {
    const official = pictureOf(fromRemotionPresentation(officialWipe() as never));
    expect(reelPictureFor('wipe')).not.toBe(official);
  });
});

// ---------------------------------------------------------------------------
// FIX ROUND 1 (Task 2.1 review, Important 1).
//
// `NodeTransitionDemo` used to drive every kind through `AtCutTransition`
// directly — the `composite` arm's own boundary compositor. Its `plan`
// branch is a DEFINED DEAD END (`at-cut-transition:plan-arm-wrong-entry-point`,
// warn-and-hard-cut — "reached through the wrong entry point", not "not built
// yet"). Task 2.1 moved seven catalog kinds (`fade`, `dissolve`, `slide`,
// `flip`, `clock-wipe`, `iris`, colourless `fade-to-color`) onto `plan`, so
// the showcase (`showcase/transitions/src/Root.tsx` renders `TransitionGallery`)
// silently stopped demonstrating seven of its commonest entries — and nothing
// in this file caught it, because `pictureOf`'s plan branch and
// `reelPictureFor` both drove the SAME hand-rolled harness, so their equality
// held by construction while the gallery's OWN render path
// (`NodeTransitionDemo`) went completely untested.
//
// FIXED by routing `NodeTransitionDemo` through `buildVideoNodes` (the actual
// per-boundary arm dispatch a reel uses) instead of `AtCutTransition`
// directly. This is the test that PROVES it, rather than inferring it from
// the implementation: render the ACTUAL gallery composition's own entries —
// `TRANSITIONS`, derived from the catalog, not a hand-picked subset — and
// assert the `plan-arm-wrong-entry-point` warning never fires for any of
// them. A silent hard cut has no OTHER reliable signature to assert on here
// (a hard cut still shows scene A or scene B — a real, non-blank picture —
// it just never shows the TRANSITION between them), which is exactly why
// this warning existing and being asserted-absent is the right instrument:
// the alternative (asserting a specific pixel per kind) would re-litigate
// `pictureOf`'s existing per-kind coverage instead of closing this file's
// actual gap, which is about the GALLERY'S OWN RENDER PATH, not the node's
// picture.
describe('the gallery composition renders every catalog kind through its OWN render path (fix round 1, Important 1)', () => {
  // FIX ROUND 2 (Important 1's own pin was vacuous). The first version of
  // this test sampled ONE hand-picked frame (`entry.sceneA`) on the theory
  // that it sat "inside the boundary window under any alignment" — false: it
  // sits exactly on the CLOSING edge of the OLD, pre-fix demo's window
  // (`[cutAt, sceneA)`, i.e. `[sceneA - duration, sceneA)`, HALF-OPEN), so
  // under the old code that frame is already past the boundary and into
  // "scene B alone" — no `AtCutTransition`, no warning, a false green. The
  // re-reviewer reconstructed the pre-fix file (`git show
  // 9884e98:lib/transitions/TransitionGallery.tsx`) and ran this exact test
  // file against it: 42/42 green, zero warnings, for every kind — the pin
  // could not have caught the regression it was written for.
  //
  // FIXED by making the assertion FRAME-INDEPENDENT instead of frame-lucky:
  // sweep EVERY frame of the segment's own duration (`sceneA + sceneB -
  // duration`, the exact span `TransitionGallery`'s own per-entry `Sequence`
  // gives it — see `getSegmentDuration` in the production file), for every
  // entry. Whatever frame either implementation's boundary window occupies,
  // a full sweep is inside it — there is no longer a "did I guess the right
  // frame" question for a reviewer (or the next task) to re-ask.
  it('never emits the plan-arm-wrong-entry-point warning, for any TRANSITIONS entry, at ANY frame across its full segment', () => {
    expect.hasAssertions();
    resetWarnOnce();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      for (const entry of TRANSITIONS) {
        const segmentFrames = entry.sceneA + entry.sceneB - entry.duration;
        for (let frame = 0; frame < segmentFrames; frame += 1) {
          clock.frame = frame;
          const { unmount } = render(<>{entry.render()}</>);
          unmount();
        }
      }
      const wrongEntryPoint = warn.mock.calls.filter(([m]) => String(m).includes('supplied `plan` instead of `composite`'));
      expect(wrongEntryPoint).toEqual([]);
    } finally {
      warn.mockRestore();
      resetWarnOnce();
    }
  });
});
