// PHASE 5 TASK 2.1, FIX ROUND 1 — IMPORTANT 2.
//
// `wrapRemotionPresentation` (lib/render/at-cut-transitions.tsx) mounts every
// migrated kind's presentation LIFE-LONG, not only while its boundary is
// live — the whole point of Task 1.4's `active` contract. While inactive it
// feeds `TransitionLayer` a NEUTRAL progress instead of skipping the render:
// `NEUTRAL_PROGRESS = direction === 'exiting' ? 0 : 1`. Review round 1 found
// this line one-mutable with a fully green suite: only the ENTERING value
// had any coverage at all (`single-mount-assembly.test.tsx`'s frame-150
// assertion on `b`'s opacity), and the EXITING value's only companion
// assertion (frame-50, on `a`) passes for ANY exiting value because `fade`'s
// exiting branch is `opacity: 1` regardless of progress — it cannot
// distinguish a correct neutral from a wrong one. Nothing anywhere rendered
// `slide`, `flip`, `clock-wipe` or `iris` OUTSIDE their own window at all.
//
// This file is that missing surface: DERIVED over `PLAN_KINDS` (not
// hand-listed — a future migrated kind is covered the day it lands, the
// exact axis-is-itself-a-list miss this programme has made twice already),
// asserting the wrapped subtree is INERT (opacity 1, no non-identity
// transform, no clip-path narrower than the frame) at a frame FAR from any
// live window, on BOTH sides independently (a kind's exiting and entering
// branches are different functions with different neutral endpoints).
//
// THE KNOWN, ARGUED EXCEPTION: `slide`'s own two `from-left`/`from-top`
// EXITING directions carry a real, non-zero sub-pixel `translate` at
// progress 0 — `@remotion/transitions/slide.js`'s own deliberate anti-seam
// epsilon (0.01%), not something this lift introduces (documented in
// `wrapRemotionPresentation`'s own comment). Encoded explicitly below as a
// named, narrow tolerance for exactly that one kind/side pair — every other
// kind/side must be EXACTLY inert, not merely "close".
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';

const clock = vi.hoisted(() => ({ frame: 0, preview: false }));

vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  const react = await import('react');
  const Offset = react.createContext(0);
  const Premounting = react.createContext(false);

  const Sequence: React.FC<{
    from?: number;
    durationInFrames?: number;
    premountFor?: number;
    layout?: 'none' | 'absolute-fill';
    children?: React.ReactNode;
  }> = ({ from = 0, durationInFrames = Number.POSITIVE_INFINITY, premountFor, children }) => {
    const parentOffset = react.useContext(Offset);
    const parentPremounting = react.useContext(Premounting);
    const offset = parentOffset + from;
    const local = clock.frame - offset;
    const ownPremounting = premountFor !== undefined && local < 0 && local >= -premountFor;
    const active = parentPremounting || ownPremounting;
    const inRange = local >= 0 && local < durationInFrames;
    if (!inRange && !active) return null;
    return react.createElement(
      Offset.Provider,
      { value: offset },
      react.createElement(Premounting.Provider, { value: active }, children),
    );
  };

  return {
    ...actual,
    Sequence,
    useCurrentFrame: () => clock.frame - react.useContext(Offset),
    useVideoConfig: () => ({
      width: 540, height: 960, fps: 30, durationInFrames: 300, id: 't', defaultProps: {}, props: {},
    }),
    staticFile: (s: string) => s,
    getRemotionEnvironment: () => ({
      isStudio: clock.preview,
      isPlayer: false,
      isRendering: !clock.preview,
      isClientSideRendering: false,
      isReadOnlyStudio: false,
    }),
  };
});

import { makeCircle, makePie } from '@remotion/shapes';
import { translatePath } from '@remotion/paths';
import { buildVideoNodes, computeVideoLayout } from '@video-toolkit/lib/render/video-track';
import {
  getTransitionRecord, transitionNodeFor, resetTransitionNodeCache,
} from '@video-toolkit/lib/render/at-cut-transitions';
import { resetWarnOnce } from '@video-toolkit/lib/render/warn-once';
import {
  TRANSITION_CATALOG, defaultTransition, isCut,
} from '@video-toolkit/lib/reel-config-base/transition-schema';
import type { VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

const FPS = 30;
const FRAMES = 20;
const DIMS = { width: 540, height: 960 };
const FAR = 40; // frames clear of any 20-frame window — genuinely "outside", not just past the edge

const clip = (id: string, startMs: number, endMs: number, extra: Record<string, unknown> = {}): VideoItem =>
  ({ id, kind: 'clip', startMs, endMs, source: `${id}.mp4`, sourceInMs: 0, sourceOutMs: endMs - startMs, ...extra }) as VideoItem;

// Same derivation `video-track-remount.test.tsx` pins — the CATALOG's own
// partition, not a hand-copied list, so this file tracks that one rather than
// drifting from it.
const CATALOG_KINDS = TRANSITION_CATALOG.map((e) => e.kind).filter((k) => !isCut(k));
function armOf(kind: string): 'plan' | 'composite' {
  const record = getTransitionRecord(defaultTransition(kind, { frames: FRAMES }));
  const node = transitionNodeFor(record, DIMS);
  return typeof node?.plan === 'function' ? 'plan' : 'composite';
}
resetTransitionNodeCache();
const PLAN_KINDS = CATALOG_KINDS.filter((k) => armOf(k) === 'plan');

beforeEach(() => {
  clock.preview = false;
  resetWarnOnce();
  resetTransitionNodeCache();
});

// THE PIN'S OWN VACUITY GUARD. `describe.each(PLAN_KINDS)` below silently
// shrinks — with NO red anywhere — if a kind falls off `WRAP_PLAN_KINDS`
// entirely (it would just stop appearing in this derived list, the same
// "empty describe.each passes trivially" trap `video-track-remount.test.tsx`
// already guards against for the identity ratchet). A literal array, not a
// count, so a shrink prints exactly which kind went missing.
it('PLAN_KINDS is exactly the seven Task 2.1 migrated kinds — re-derive; do not carry forward', () => {
  expect.hasAssertions();
  expect(PLAN_KINDS).toEqual(['dissolve', 'fade', 'fade-to-color', 'slide', 'flip', 'clock-wipe', 'iris']);
});

/** The style value the nearest ancestor carrying `prop` sets — `''` if none
 *  does. Walks past the two structurally-inert `LayerShell` divs (whichever
 *  one does NOT carry this boundary's `wrap`) to find the one `TransitionLayer`
 *  actually rendered into, without assuming which nesting depth that is (it
 *  differs between the exiting/outer and entering/inner shell — see
 *  `single-mount-assembly.test.tsx`'s `opacityAncestor`, the same technique). */
function findStyle(el: Element, prop: 'opacity' | 'transform' | 'clipPath'): string {
  for (let cur = el.parentElement; cur; cur = cur.parentElement) {
    const v = (cur as HTMLElement).style[prop];
    if (v) return v;
  }
  return '';
}

// THE ONE NAMED, ARGUED EXCEPTION — see the module docblock. `0.02` comfortably
// clears slide.js's own `0.01` (in the SAME percentage units the transform
// string uses) while still catching anything that isn't sub-pixel (the
// mutation this file exists to catch moves this value to 100).
const SLIDE_EXITING_EPSILON = 0.02;

function assertInertTransform(kind: string, side: 'exiting' | 'entering', transform: string): void {
  if (!transform || transform === 'none') return;
  const epsilon = kind === 'slide' && side === 'exiting' ? SLIDE_EXITING_EPSILON : 0;
  const numbers = [...transform.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  expect(numbers.length).toBeGreaterThan(0); // a transform string with no numbers at all would be a parsing miss, not inertness
  for (const n of numbers) {
    expect(Math.abs(n)).toBeLessThanOrEqual(epsilon);
  }
}

/** The EXACT expected `clip-path`, computed with the SAME functions
 *  (`makeCircle`/`makePie` + `translatePath`) `iris.js`/`clock-wipe.js`
 *  themselves call, at the SAME neutral endpoint (progress 1, entering) —
 *  not a heuristic, an equality against the real geometry. `null` for every
 *  other kind, meaning "no clip-path at all, on either side". */
function expectedNeutralClipPath(kind: string): string | null {
  if (kind === 'iris') {
    const maxRadius = Math.sqrt(DIMS.width ** 2 + DIMS.height ** 2) / 2;
    const { path } = makeCircle({ radius: maxRadius });
    const translated = translatePath(path, DIMS.width / 2 - maxRadius, DIMS.height / 2 - maxRadius);
    return `path("${translated}")`;
  }
  if (kind === 'clock-wipe') {
    const finishedRadius = Math.sqrt(DIMS.width ** 2 + DIMS.height ** 2) / 2;
    const { path } = makePie({ radius: finishedRadius, progress: 1 });
    const translated = translatePath(
      path,
      -(finishedRadius * 2 - DIMS.width) / 2,
      -(finishedRadius * 2 - DIMS.height) / 2,
    );
    return `path("${translated}")`;
  }
  return null;
}

/** Whether this kind/side's picture is expected to differ between the
 *  neutral (far outside the window) sample and a LIVE mid-window one — the
 *  positive half of the vacuity guard: proving the apparatus (the `wrap`,
 *  the context wiring) is genuinely exercised, not merely silent. `false`
 *  entries are not gaps — they are the SAME progress-invariance
 *  `wrapRemotionPresentation`'s own doc comment argues for `fade`/`dissolve`'s
 *  and `clock-wipe`/`iris`'s EXITING branch (`opacity: 1`/`clipPath:
 *  undefined` regardless of progress), so there is genuinely nothing to
 *  differ there. */
const EXPECT_LIVE_DIFFERS: Record<string, { exiting: boolean; entering: boolean }> = {
  dissolve: { exiting: false, entering: true },
  fade: { exiting: false, entering: true },
  'fade-to-color': { exiting: false, entering: true },
  slide: { exiting: true, entering: true },
  flip: { exiting: true, entering: true },
  'clock-wipe': { exiting: false, entering: true },
  iris: { exiting: false, entering: true },
};

function pictureOf(el: Element): { opacity: string; transform: string; clipPath: string } {
  return { opacity: findStyle(el, 'opacity'), transform: findStyle(el, 'transform'), clipPath: findStyle(el, 'clipPath') };
}

describe.each(PLAN_KINDS)(
  'DERIVED — plan-arm "%s" is neutral OUTSIDE its window, on both sides (fix round 1, Important 2)',
  (kind) => {
    // a --kind--> b. `a`'s exiting side has full PRE-window life (it is on
    // screen from frame 0), which is what "far before the window opens"
    // needs.
    const exitReel = (): VideoItem[] => [
      clip('a', 0, 3000, { transitionOut: defaultTransition(kind, { frames: FRAMES }) }),
      clip('b', 3000, 6000),
    ];
    // x --kind--> y --cut--> z. A boundary is read off the ENTERING item's
    // PREDECESSOR's `transitionOut` for every interior cut (`transitionIn` is
    // read only on the reel's very FIRST item — `video-track-layout.ts`'s own
    // comment) — so the authored kind sits on `x`, not `y`, even though `y`
    // is the side under test. `y`'s entering side has NO pre-window life (its
    // own Sequence starts exactly at the window, design §1.2) but DOES have
    // life well past the window's close, up to its own next boundary — which
    // is what "far after the window has closed" needs. The trailing `z` item
    // is what gives `y` that runway (a 2-item reel would end `y`'s Sequence
    // too soon to sample +40 past a window near its own middle).
    const enterReel = (): VideoItem[] => [
      clip('x', 0, 3000, { transitionOut: defaultTransition(kind, { frames: FRAMES }) }),
      clip('y', 3000, 6000),
      clip('z', 6000, 9000),
    ];

    const exitTree = () => (
      <>
        {buildVideoNodes(exitReel(), {
          renderItem: (item) => <video data-testid={`vid-${item.id}`} />,
          width: DIMS.width, height: DIMS.height, fps: FPS, palette: undefined,
        })}
      </>
    );
    const enterTree = () => (
      <>
        {buildVideoNodes(enterReel(), {
          renderItem: (item) => <video data-testid={`vid-${item.id}`} />,
          width: DIMS.width, height: DIMS.height, fps: FPS, palette: undefined,
        })}
      </>
    );

    const exitWindow = () => {
      const layout = computeVideoLayout(exitReel(), FPS);
      return { start: layout[0].seqFrom + layout[0].seqDuration - layout[0].outFrames, frames: layout[0].outFrames };
    };
    const enterWindow = () => {
      const layout = computeVideoLayout(enterReel(), FPS);
      return { start: layout[1].seqFrom, frames: layout[1].inFrames };
    };

    it('EXITING side: inert far before the window opens, and — where the picture genuinely varies — different from a live mid-window frame', () => {
      expect.hasAssertions();
      const window = exitWindow();
      clock.frame = Math.max(0, window.start - FAR);
      const { container, rerender } = render(exitTree());
      const video = container.querySelector('[data-testid="vid-a"]')!;
      const neutral = pictureOf(video);
      expect(neutral.opacity === '' || neutral.opacity === '1').toBe(true);
      assertInertTransform(kind, 'exiting', neutral.transform);
      expect(neutral.clipPath).toBe(''); // no kind's EXITING branch ever sets a clip-path

      if (EXPECT_LIVE_DIFFERS[kind].exiting) {
        clock.frame = window.start + Math.floor(window.frames / 2);
        rerender(exitTree());
        const live = pictureOf(container.querySelector('[data-testid="vid-a"]')!);
        expect(live).not.toEqual(neutral);
      }
    });

    it('ENTERING side: inert well after the window has closed, and — where the picture genuinely varies — different from a live mid-window frame', () => {
      expect.hasAssertions();
      const window = enterWindow();
      clock.frame = window.start + window.frames + FAR;
      const { container, rerender } = render(enterTree());
      const video = container.querySelector('[data-testid="vid-y"]')!;
      const neutral = pictureOf(video);
      expect(neutral.opacity === '' || neutral.opacity === '1').toBe(true);
      assertInertTransform(kind, 'entering', neutral.transform);
      expect(neutral.clipPath).toBe(expectedNeutralClipPath(kind) ?? '');

      if (EXPECT_LIVE_DIFFERS[kind].entering) {
        clock.frame = window.start + Math.floor(window.frames / 2);
        rerender(enterTree());
        const live = pictureOf(container.querySelector('[data-testid="vid-y"]')!);
        expect(live).not.toEqual(neutral);
      }
    });
  },
);
