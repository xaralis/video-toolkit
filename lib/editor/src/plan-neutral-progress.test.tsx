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
it('PLAN_KINDS is exactly the sixteen Task 2.1+2.2+2.3 migrated kinds — re-derive; do not carry forward', () => {
  expect.hasAssertions();
  expect(PLAN_KINDS).toEqual([
    'dissolve', 'fade', 'fade-to-color', 'glitch', 'burn', 'light-leak',
    'slide', 'flip', 'whip-pan', 'zoom-through', 'zoom-blur',
    'clock-wipe', 'iris', 'wipe', 'gradient-wipe', 'pixelate',
  ]);
});

/** The style value the nearest ancestor carrying `prop` sets — `''` if none
 *  does. Walks past the two structurally-inert `LayerShell` divs (whichever
 *  one does NOT carry this boundary's `wrap`) to find the one `TransitionLayer`
 *  actually rendered into, without assuming which nesting depth that is (it
 *  differs between the exiting/outer and entering/inner shell — see
 *  `single-mount-assembly.test.tsx`'s `opacityAncestor`, the same technique). */
// PHASE 5 TASK 2.2 — widened with `filter` and `maskImage`. `pixelate` (its
// native `plan`) sets `filter` on both sides, and `gradient-wipe` sets
// `maskImage` on `to` alone; neither is `opacity`/`transform`/`clipPath`, so
// without this widening this pin would be BLIND to both — a genuinely inert
// mask/filter and a genuinely live one would read identically, which is
// exactly the "obviously the identity" trap the brief calls out for these two
// props.
function findStyle(
  el: Element,
  prop: 'opacity' | 'transform' | 'clipPath' | 'filter' | 'maskImage',
): string {
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

// PHASE 5 TASK 2.3 — per-FUNCTION identity, not a single "everything must be
// near zero" rule. `zoom-through`/`zoom-blur` both write `scale(N)`, whose
// IDENTITY is `1`, not `0` — a fact this file never had to know before this
// task, because every earlier plan kind's transform was translate/rotate-
// shaped (`translateX(N%)`/`rotateY(Ndeg)`), where `0` genuinely is the
// identity. Parsing per FUNCTION CALL (not just scraping every number in the
// string) is what lets `scale(1)` read as inert while `scale(1.8)` still
// fails loudly — a flat "every number near zero" rule would have required
// `scale`'s neutral to be `0`, which is not a real transform at all (it
// collapses the layer to nothing), so this was never a viable exception to
// bolt on to the old rule; it needed its own per-function identity.
const TRANSFORM_FN_IDENTITY: Record<string, number> = { scale: 1 };

function assertInertTransform(kind: string, side: 'exiting' | 'entering', transform: string): void {
  if (!transform || transform === 'none') return;
  const epsilon = kind === 'slide' && side === 'exiting' ? SLIDE_EXITING_EPSILON : 0;
  const calls = [...transform.matchAll(/([a-zA-Z]+)\(([^)]*)\)/g)];
  expect(calls.length).toBeGreaterThan(0); // a transform string with no function calls at all would be a parsing miss, not inertness
  for (const [, fn, argsStr] of calls) {
    const identity = TRANSFORM_FN_IDENTITY[fn] ?? 0;
    const numbers = [...argsStr.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
    expect(numbers.length).toBeGreaterThan(0);
    for (const n of numbers) {
      expect(Math.abs(n - identity)).toBeLessThanOrEqual(epsilon);
    }
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

// PHASE 5 TASK 2.3 — `light-leak` is the one kind whose neutral `filter` is
// NOT empty. Its `exposure` (the multiplier fed to `brightness(...)`) is
// computed by `interpolate(progress, [0, 0.4, 0.6, 1], [1, 1.3, 1.3, 1])`
// (`light-leak.tsx`), which lands on EXACTLY `1` — the numeric identity of
// `brightness()` — at BOTH endpoints, on both sides (exiting inverts
// `progress` to `1 - presentationProgress` before feeding it in, so its own
// neutral endpoint, presentationProgress 0, also lands on the interpolation's
// `progress === 1` endpoint). So the ancestor's `filter` style is always
// PRESENT (`light-leak.tsx` sets it unconditionally, unlike `whip-pan`/
// `zoom-blur`'s `blur > 0.5 ? … : undefined` gate) but is numerically inert
// at the boundary — the same class of divergence `slide`'s
// `SLIDE_EXITING_EPSILON` already carries for `transform`, applied here to
// `filter` instead. Narrow and argued, not a loosening for every kind: every
// other plan kind's neutral filter is still required to be exactly `''`.
function expectedNeutralFilter(kind: string): string {
  return kind === 'light-leak' ? 'brightness(1)' : '';
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
// PHASE 5 TASK 2.2 — three more rows. `wipe` sets `opacity` on both sides
// (like the Task 2.1 crossfades); `gradient-wipe`'s EXITING side is `from: {}`
// (untouched, so `false` — nothing widened OR pre-existing differs there) and
// its ENTERING side sets `maskImage` only (no opacity/transform/clipPath at
// all — this is the row that NEEDS the `findStyle` widening above, or it would
// read as `false` for the wrong reason: not "genuinely inert" but "this pin
// couldn't see the property that changes"); `pixelate` sets `opacity` AND
// (once `pixelIntensity` clears its own thresholds) `filter`/`transform` on
// both sides, so both are `true`.
// PHASE 5 TASK 2.3 — six more rows. `burn`'s NO-MASK fallback (the default
// `defaultTransition` seeds, no `mask` field) is `<AbsoluteFill>{children}
// </AbsoluteFill>` on EXITING — the identity, like `fade`/`dissolve` — and a
// plain `opacity: presentationProgress` on ENTERING, so `false`/`true` like
// the rest of that family. The other five (`glitch`, `light-leak`,
// `whip-pan`, `zoom-through`, `zoom-blur`) all apply a REAL, progress-driven
// opacity/transform/filter curve on BOTH sides — none of their exiting
// branches is the identity the way `fade`'s is — so all five are `true`/
// `true`.
const EXPECT_LIVE_DIFFERS: Record<string, { exiting: boolean; entering: boolean }> = {
  dissolve: { exiting: false, entering: true },
  fade: { exiting: false, entering: true },
  'fade-to-color': { exiting: false, entering: true },
  glitch: { exiting: true, entering: true },
  burn: { exiting: false, entering: true },
  'light-leak': { exiting: true, entering: true },
  slide: { exiting: true, entering: true },
  flip: { exiting: true, entering: true },
  'whip-pan': { exiting: true, entering: true },
  'zoom-through': { exiting: true, entering: true },
  'zoom-blur': { exiting: true, entering: true },
  'clock-wipe': { exiting: false, entering: true },
  iris: { exiting: false, entering: true },
  wipe: { exiting: true, entering: true },
  'gradient-wipe': { exiting: false, entering: true },
  pixelate: { exiting: true, entering: true },
};

function pictureOf(
  el: Element,
): { opacity: string; transform: string; clipPath: string; filter: string; maskImage: string } {
  return {
    opacity: findStyle(el, 'opacity'),
    transform: findStyle(el, 'transform'),
    clipPath: findStyle(el, 'clipPath'),
    filter: findStyle(el, 'filter'),
    maskImage: findStyle(el, 'maskImage'),
  };
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
      // No `plan`-arm kind's EXITING side sets `filter` unconditionally
      // except `light-leak` (see `expectedNeutralFilter`'s own comment) —
      // `pixelate`'s shared filter/transform IS applied to `from` too, but
      // only while the boundary is LIVE (a bare `LayerOp.style`, unlike
      // `wrap`, is never even attempted outside the window — see
      // `LayerShell`'s `op` lookup), so far outside it there is nothing here.
      // `maskImage` is absent for every kind, no exception.
      expect(neutral.filter).toBe(expectedNeutralFilter(kind));
      expect(neutral.maskImage).toBe('');

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
      // `gradient-wipe`'s ENTERING side is the ONLY thing in this whole file
      // that sets `maskImage` at all — well outside its window it must be
      // absent, exactly like every other kind's opacity/transform/clip-path.
      expect(neutral.filter).toBe(expectedNeutralFilter(kind));
      expect(neutral.maskImage).toBe('');

      if (EXPECT_LIVE_DIFFERS[kind].entering) {
        clock.frame = window.start + Math.floor(window.frames / 2);
        rerender(enterTree());
        const live = pictureOf(container.querySelector('[data-testid="vid-y"]')!);
        expect(live).not.toEqual(neutral);
      }
    });
  },
);
