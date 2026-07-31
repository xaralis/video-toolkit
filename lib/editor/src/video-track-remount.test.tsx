// TASK R1 — the DOM-IDENTITY probe, promoted to a kept test.
//
// Diagnosed in
// .superpowers/sdd/2026-07-26-phase4-node-contract/editor-transition-regression.md:
// Phase 4 Task 1.3 (`8ed0c13`) renders an item's content at a DIFFERENT
// POSITION in the React tree for the frames a boundary owns (once under the
// item's own Sequence, once re-based inside the boundary's compositor).
// React reconciles by position, so a footage `<video>` is destroyed and
// recreated TWICE per boundary — once on the OPENING edge (the boundary's
// re-based copies mount cold) and once on the CLOSING edge (the item's own
// copy was unmounted for the whole window and has to mount fresh the instant
// the window closes). In the editor's `<Player>` that is a real re-fetch +
// re-seek: a background-colour flash and a stall. At render time frames are
// extracted independently of any DOM, so it is invisible there — which is why
// the fixes below are PREVIEW-GATED (`isPreviewEnvironment`,
// lib/render/preview-environment.ts) rather than universal.
//
// GEOMETRY, straight from the diagnosis: two 3s clips, a 20-frame `fade` on
// the cut, 30fps — boundary window is composition frames 80-100 inclusive
// (BOUNDARY_TAIL makes it `frames + 1` = 21 long).
//
// The Sequence mock below is `transition-alignment-render.test.tsx`'s
// frame-gating + time-rebasing mock, EXTENDED to actually implement
// `premountFor` (mount early, hidden, inheriting into nested Sequences via a
// Premounting context) — real Remotion propagates premounting to children
// exactly this way (see `Sequence.js`'s `premounting = parentSequence
// premounting || …`), so this is not a stand-in shape, it is the same
// mechanism at the one property these tests read.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    // Controllable stand-in for the real `getRemotionEnvironment` — the same
    // function `isPreviewEnvironment` calls. `isPlayer`/`isStudio` are what
    // gate Fixes 1-2; jsdom has neither `window.remotion_isPlayer` nor
    // `window.remotion_isStudio`, so the real function would always read
    // "not preview" here regardless — this mock is what lets the test choose.
    getRemotionEnvironment: () => ({
      isStudio: clock.preview,
      isPlayer: false,
      isRendering: !clock.preview,
      isClientSideRendering: false,
      isReadOnlyStudio: false,
    }),
  };
});

import { buildVideoNodes, computeVideoLayout } from '@video-toolkit/lib/render/video-track';
import type { VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

const clip = (id: string, startMs: number, endMs: number, extra: Record<string, unknown> = {}): VideoItem =>
  ({ id, kind: 'clip', startMs, endMs, source: `${id}.mp4`, sourceInMs: 0, sourceOutMs: endMs - startMs, ...extra }) as VideoItem;

// a: 0-3000ms with a 20-frame fade out. b: 3000-6000ms. 30fps -> cut at frame
// 90, `fade`'s default (center) alignment gives a window of [80, 100].
const reel = (): VideoItem[] => [
  clip('a', 0, 3000, { transitionOut: { kind: 'fade', frames: 20 } }),
  clip('b', 3000, 6000),
];

const tree = () => (
  <>
    {buildVideoNodes(reel(), {
      renderItem: (item) => <video data-testid={`vid-${item.id}`} />,
      width: 540,
      height: 960,
      fps: 30,
      palette: undefined,
    })}
  </>
);

beforeEach(() => {
  clock.preview = false;
});

describe('closing edge — item b keeps its own DOM identity across the boundary (Fix 1)', () => {
  it('does not remount b when the boundary hands its frames back at frame 101', () => {
    clock.preview = true;
    clock.frame = 80;
    const { container, rerender } = render(tree());
    const atOpen = container.querySelectorAll('[data-testid="vid-b"]');
    // With Fix 1, b's own Sequence keeps its child mounted (hidden) through
    // the whole window, alongside the boundary's own visible copy: TWO nodes
    // exist simultaneously. The FIRST in document order is b's own — item
    // Sequences are pushed into buildVideoNodes' array before the boundary
    // that owns them (see video-track.tsx, `items.forEach`).
    expect(atOpen.length).toBe(2);
    const ownAtOpen = atOpen[0];

    clock.frame = 100;
    rerender(tree());
    const ownAtWindowEnd = container.querySelectorAll('[data-testid="vid-b"]')[0];
    expect(ownAtWindowEnd).toBe(ownAtOpen);

    clock.frame = 101;
    rerender(tree());
    const afterWindow = container.querySelectorAll('[data-testid="vid-b"]');
    // The boundary has closed: only b's own copy remains.
    expect(afterWindow.length).toBe(1);
    expect(afterWindow[0]).toBe(ownAtOpen);
  });
});

describe('opening edge — the boundary premounts before its window opens (Fix 2)', () => {
  it('mounts the boundary (and its re-based copies) before frame 80, and keeps that identity once the window opens', () => {
    clock.preview = true;
    clock.frame = 65; // 15 frames before the window opens
    const { container, rerender } = render(tree());
    const premounted = container.querySelectorAll('[data-testid="vid-b"]');
    expect(premounted.length).toBe(1); // the boundary's premounted, hidden copy
    const premountedNode = premounted[0];

    clock.frame = 80;
    rerender(tree());
    const atOpen = container.querySelectorAll('[data-testid="vid-b"]');
    // Fix 1 also applies here (preview), so b's own hidden copy joins in —
    // the boundary's copy (now visible) is what must have SURVIVED from the
    // premount frame with no new mount.
    expect(atOpen).toContain(premountedNode);
  });
});

describe('preview gate — the render path takes neither fix (parity statement)', () => {
  it('Fix 1: ItemBody still unmounts on blanked frames outside preview', () => {
    clock.preview = false;
    clock.frame = 85; // inside the window
    const { container } = render(tree());
    // No hidden own-copy of b coexisting with the boundary's copy — exactly
    // one node, the boundary's, as before Task R1.
    expect(container.querySelectorAll('[data-testid="vid-b"]').length).toBe(1);
  });

  it('Fix 2: the boundary does not premount outside preview', () => {
    clock.preview = false;
    clock.frame = 65; // 15 frames before the window opens
    const { container } = render(tree());
    expect(container.querySelectorAll('[data-testid="vid-b"]').length).toBe(0);
  });
});

// TASK R2 — THE RESIDUAL COST, PINNED. R1 removed every remount of a SHOWN
// media element, but left up to FOUR alive around one cut in preview (item a's
// own copy, item b's own copy, and the boundary's two re-based copies), two of
// them decoding the same frames of the same file at the same time. Nothing
// asserted that count, so nothing could tell an improvement from a regression.
//
// Three is the FLOOR under Task 1.3's contract, and the argument is structural,
// not empirical: a node RENDERS its two inputs as children, so an input that
// outlives the boundary window has to exist inside the node AND in its own
// Sequence. The one copy that is neither of those — the OUTGOING clip's own
// copy, hidden for a window that runs to the end of its Sequence and therefore
// never shown again — is what Task R2 releases.
describe('media elements alive around a footage cut (Task R2)', () => {
  it('preview: exactly three — the incoming clip keeps its own copy, the outgoing clip does not', () => {
    clock.preview = true;
    clock.frame = 85; // mid-window
    const { container } = render(tree());
    // a: only the boundary's re-based copy. Its own copy is blanked from frame
    // 80 to the end of its Sequence (frame 99), so it can never be shown again.
    expect(container.querySelectorAll('[data-testid="vid-a"]').length).toBe(1);
    // b: its own copy (hidden, warm, and it IS shown again at frame 101) plus
    // the boundary's re-based copy.
    expect(container.querySelectorAll('[data-testid="vid-b"]').length).toBe(2);
    expect(container.querySelectorAll('video').length).toBe(3);
  });

  it('render path: exactly two — the boundary\'s own two copies, unchanged since Task 1.3', () => {
    clock.preview = false;
    clock.frame = 85;
    const { container } = render(tree());
    expect(container.querySelectorAll('[data-testid="vid-a"]').length).toBe(1);
    expect(container.querySelectorAll('[data-testid="vid-b"]').length).toBe(1);
    expect(container.querySelectorAll('video').length).toBe(2);
  });

  it('releases the outgoing clip\'s own copy on the FIRST frame the boundary claims, not one before it', () => {
    clock.preview = true;
    clock.frame = 79; // a's last unclaimed frame — it is still DRAWN here
    const { container, rerender } = render(tree());
    // a's own (visible) copy + the boundary's premounted re-based one.
    expect(container.querySelectorAll('[data-testid="vid-a"]').length).toBe(2);

    clock.frame = 80; // the boundary's first frame
    rerender(tree());
    expect(container.querySelectorAll('[data-testid="vid-a"]').length).toBe(1);
  });
});

// PHASE 5 TASK 1.2 — THE SHELLS ARE INERT HERE, AND THAT IS THE POINT.
//
// Every video item is now wrapped in two always-mounted, style-only shells and
// the whole track in one wrapper (lib/render/video-track-plan.tsx), so that a
// `plan`-arm boundary has something to style. `fade` is a `composite`-arm kind
// and every kind in the catalog still is, so this file's geometry, counts and
// identities above must be UNCHANGED by their arrival — which is what makes
// them a parity statement for the shells rather than only for R1/R2.
//
// The single-mount path's own identity assertions live in
// `single-mount-assembly.test.tsx`; this file stays the pin for the composite
// arm, which is what the whole staged migration is measured against.
describe('Phase 5 Task 1.2 — the shells do not disturb the composite arm', () => {
  it('wraps the item in two extra divs without changing its DOM identity across the window', () => {
    clock.preview = true;
    clock.frame = 80;
    const { container, rerender } = render(tree());
    const own = container.querySelectorAll('[data-testid="vid-b"]')[0];
    // ItemBody's preview wrapper + the two shells = three divs between the
    // clip and its Sequence. Asserted as a COUNT so a shell silently
    // disappearing (or a third appearing) is caught here too.
    let depth = 0;
    for (let el = own.parentElement; el && el !== container; el = el.parentElement) depth += 1;
    expect(depth).toBe(4); // 3 wrappers + the track wrapper

    clock.frame = 101;
    rerender(tree());
    expect(container.querySelectorAll('[data-testid="vid-b"]')[0]).toBe(own);
  });

  it('returns ONE node — the always-mounted track wrapper — not one per item', () => {
    const nodes = buildVideoNodes(reel(), {
      renderItem: () => null, width: 540, height: 960, fps: 30, palette: undefined,
    });
    expect(nodes.length).toBe(1);
  });
});

describe('the amplifier — a boundary keeps its node identity across an unrelated re-render (Fix 3)', () => {
  it('does not remount the boundary contents when buildVideoNodes is called again with unchanged config', () => {
    clock.frame = 85; // inside the window, independent of the preview gate
    const { container, rerender } = render(tree());
    const first = Array.from(container.querySelectorAll('[data-testid="vid-a"], [data-testid="vid-b"]'));
    expect(first.length).toBeGreaterThan(0);

    // Simulates what happens to LayeredReelComposition on every inspector
    // edit: a fresh render, i.e. a fresh call to buildVideoNodes(), with the
    // reel's authored config UNCHANGED.
    rerender(tree());
    const second = Array.from(container.querySelectorAll('[data-testid="vid-a"], [data-testid="vid-b"]'));
    // `toEqual` on DOM nodes compares STRUCTURE (tag + attributes), which two
    // independently-mounted-but-identical <video> elements would satisfy even
    // after a real remount — exactly the false-positive this test exists to
    // rule out. Reference identity, element by element, is the only check
    // that actually pins "no remount happened".
    expect(second.length).toBe(first.length);
    second.forEach((el, i) => expect(el).toBe(first[i]));
  });
});

// =============================================================================
// PHASE 5 TASK 1.3 — THE DERIVED IDENTITY RATCHET.
//
// Everything above is HAND-WRITTEN, over one kind (`fade`) and one geometry.
// This section is DERIVED over the whole catalog (`TRANSITION_CATALOG`), so a
// kind is covered the day it migrates from the `composite` arm to the `plan`
// arm, not the day someone remembers to add a case for it.
//
// THE INSTRUMENT. The pixel harness renders 300 fully independent stills, so
// it structurally cannot see a component persisting or remounting ACROSS
// frames. The only thing that can is DOM element identity, re-queried every
// frame — which is exactly what this section builds, generatively.
//
// THE PARTITION. `typeof node.plan === 'function'` (never `'plan' in node` —
// see `TransitionNode`'s own doc comment in lib/theming/transitions.ts) is the
// one decider, applied here through `transitionNodeFor` — the SAME function
// `buildVideoNodes` calls, not a re-derivation of its logic. Two buckets fall
// out of it:
//
//   PLAN kinds MUST pass the identity assertion — the whole point of Stage 2.
//   COMPOSITE kinds are EXPECTED TO FAIL it TODAY, and the failure is
//   asserted, not skipped — a composite kind that starts passing before it
//   migrates means this instrument is vacuous or the assembly is doing
//   something nobody understands (see the task brief).
//
// `cut` is excluded from both buckets: it is the "no transition" literal
// (`isCut`), not a transition kind — it resolves no `TransitionNode` at all
// (`PRESENTATIONS[CUT_KIND] = () => null`), so there is no boundary, no
// window, and nothing to sweep. Same exclusion `transition-gallery-catalog
// .test.tsx`'s `DEMONSTRABLE` already makes, for the same reason.
import {
  TRANSITION_CATALOG, TRANSITION_ALIGNMENTS, defaultTransition, isCut,
  type TransitionAlignment,
} from '@video-toolkit/lib/reel-config-base/transition-schema';
import { transitionNodeFor, getTransitionRecord, resetTransitionNodeCache } from '@video-toolkit/lib/render/at-cut-transitions';
import { resetWarnOnce } from '@video-toolkit/lib/render/warn-once';
import type { TransitionComposite, TransitionPlanProps, TransitionRegistry } from '@video-toolkit/lib/theming/transitions';

const IDENTITY_FRAMES = 20;
const IDENTITY_FPS = 30;
const RESOLVE_DIMS = { width: 540, height: 960 };

const CATALOG_KINDS = TRANSITION_CATALOG.map((e) => e.kind).filter((k) => !isCut(k));

/** THE PARTITION RULE — a function, not a list, so it re-derives on every run
 *  rather than going stale the way a hand-maintained set of kind names would
 *  (this programme has been bitten by exactly that shape four times in its own
 *  docs, per the task brief). Reads the resolved node through the identical
 *  entry point `buildVideoNodes` uses (`transitionNodeFor`), with no brand
 *  `transitions` registry — this is the CATALOG's own partition, independent
 *  of what any one brand registers.
 *
 *  `getTransitionRecord` — not a cast — is what turns `defaultTransition`'s
 *  loosely-typed `DraftTransition` (`{ kind: string; frames?: number; [key:
 *  string]: unknown }`) into a real `TransitionRecord`: it is the SAME
 *  production function `computeVideoLayout` calls to do exactly this
 *  narrowing (`transition-record.ts`), so reusing it here means the type
 *  guarantee comes from real validation logic, not an `as unknown as` escape
 *  hatch past the type system at the one point the entire partition is
 *  derived from. `DraftTransition`'s index signature makes it a structural
 *  `Record<string, unknown>`, which is the exact alternative
 *  `getTransitionRecord` already accepts — no cast needed at the call site
 *  either. */
function armOf(kind: string): 'plan' | 'composite' {
  const record = getTransitionRecord(defaultTransition(kind, { frames: IDENTITY_FRAMES }));
  const node = transitionNodeFor(record, RESOLVE_DIMS);
  return typeof node?.plan === 'function' ? 'plan' : 'composite';
}

resetTransitionNodeCache();
const PLAN_KINDS = CATALOG_KINDS.filter((k) => armOf(k) === 'plan');
const COMPOSITE_KINDS = CATALOG_KINDS.filter((k) => armOf(k) !== 'plan');

describe('DERIVED — the plan/composite partition over the catalog is pinned', () => {
  it('excludes exactly the cut literal — "no transition" is not a transition kind', () => {
    expect.hasAssertions();
    expect(TRANSITION_CATALOG.map((e) => e.kind)).toContain('cut');
    expect(CATALOG_KINDS.length).toBe(TRANSITION_CATALOG.length - 1);
  });

  // THE PIN ITSELF. Deliberately `toEqual([])`, not `toHaveLength(0)`: a
  // failure here prints the offending kind NAMES, which is what a Stage 2
  // migration needs to see to update this line deliberately, rather than a
  // bare count telling it only that something moved.
  it('is EMPTY today — zero catalog kinds resolve to a plan node (re-derive; do not carry forward)', () => {
    expect.hasAssertions();
    expect(PLAN_KINDS).toEqual([]);
    expect(COMPOSITE_KINDS.length).toBe(CATALOG_KINDS.length);
  });
});

const identityTree = (
  items: VideoItem[],
  registry?: TransitionRegistry,
) => (
  <>
    {buildVideoNodes(items, {
      renderItem: (item) => <video data-testid={`vid-${item.id}`} />,
      width: 540,
      height: 960,
      fps: IDENTITY_FPS,
      palette: undefined,
      transitions: registry,
    })}
  </>
);

/** Every DOM element currently matching `testid`, re-queried fresh — never
 *  cached — which is the difference between an identity check and a `toBe`
 *  comparing a captured reference to itself (Task R1's own trap, restated in
 *  the task brief). Deliberately NOT filtered by CSS visibility: this file's
 *  `Sequence` mock implements the FRAME-GATING half of `premountFor` (a
 *  premounting subtree renders) but not Remotion's own `display:none`
 *  styling of it (`use-premounting.js`'s `hideWhilePremounted`, real-DOM-only
 *  machinery this mock has no reason to reproduce — see the mock's own
 *  docblock at the top of this file). A visibility filter would therefore
 *  under-count on this mock, not over-count: it would let a genuinely SEPARATE
 *  premounted element pass as "not there yet" for kinds not yet audited to
 *  confirm it stays hidden. Counting every MATCHED element, hidden or not, is
 *  the stricter and more honest reading of "does a second DOM node exist for
 *  this item at all" — which is also the literal cost Task R2's docblock
 *  measures ("two of them decoding the same frames of the same file at the
 *  same time"). */
function instancesOf(container: HTMLElement, testid: string): Element[] {
  return Array.from(container.querySelectorAll(`[data-testid="${testid}"]`));
}

/** Sweeps EVERY frame in `[window.start - PAD, window.start + window.frames +
 *  PAD]` (clamped at 0) — not spot samples — and returns TWO metrics, used by
 *  DIFFERENT buckets below for a reason (Review Round 1, Important 1):
 *
 *  `distinct` — the size of the union of every element reference ever
 *  matched. This is what the COMPOSITE bucket asserts on (`distinct > 1`):
 *  the `composite` arm has NO legitimate multi-mount concept at all —
 *  `TransitionNode`'s `composite` arm is a plain JSX component with no
 *  `ghosts`-shaped contract — so ANY second element it produces is the
 *  unauthorised extra copy the whole ratchet exists to catch. Verified this
 *  is not merely assumed: `rgb-split` (still composite today) already
 *  renders its `children` prop into three separate `<AbsoluteFill>` siblings
 *  (main + a red-shifted copy + a cyan-shifted copy,
 *  `lib/transitions/presentations/rgb-split.tsx`) — the SAME element
 *  reference reused at three tree positions, which React mounts as three
 *  separate DOM nodes — so `distinct === 3` there, correctly flagged.
 *
 *  `persists` — whether every reference present on the FIRST frame the item
 *  is observed at all (`baseline`) is still present — by reference, via
 *  `Array.includes`, not structural equality — on every LATER frame the item
 *  is on screen (a frame with zero matches is not "on screen" and is not
 *  checked). This is what the PLAN bucket (and the ghost-tolerance proof)
 *  assert on: a `plan`'s `LayerOp.ghosts` is a documented, DELIBERATE
 *  feature — "each entry is one extra MOUNT of the clip" — whose only
 *  invariant is a progress-INVARIANT count, so a stable ghost must not fail
 *  the plan bucket. `distinct > 1` would fail it anyway (a ghost is a real
 *  second element); `persists` does not, because nothing that was already on
 *  screen had to leave for the ghost to appear. A reference that WAS there
 *  and stops answering — the composite arm's own copy being released (Task
 *  R2's `drawnThrough`), or a REBASED copy being swapped in behind it — DOES
 *  fail `persists`, because `baseline` still names it.
 *
 *  WHY THE COMPOSITE BUCKET CANNOT JUST USE `persists` TOO — the finding that
 *  drove this split. `wipe` (a native two-input node, one-sided-per-half:
 *  "ONE continuous sheet motion... the swap happens behind the sheet at the
 *  midpoint", `lib/transitions/presentations/wipe.tsx`) renders only ONE of
 *  its two inputs at a time. Measured directly (`interior/center/incoming`,
 *  30fps, 20-frame window at [80,100]): `vid-b` has 0 matches at frames
 *  75-79, 1 match (b's own hidden copy via Fix 1) at 80-89 (progress < 0.5,
 *  only `from` renders), 2 matches at 90-100 (progress >= 0.5, the rebased
 *  `to` copy joins it), back to 1 at 101+. `baseline` is captured at frame
 *  80 — the FIRST frame with any match — where only b's own copy exists, so
 *  the REBASED copy that appears later is, from `persists`' point of view,
 *  indistinguishable from a legitimate ghost: it was never in baseline, so
 *  its later disappearance is not a violation. `persists` reports `true` for
 *  a kind that plainly duplicates the mount (`distinct === 2` on the very
 *  same sweep). This is exactly the class the task brief warned about
 *  ("stop and report" an unexpectedly-passing composite kind) — reported
 *  here, and resolved by NOT using `persists` for the composite bucket at
 *  all, rather than special-casing `wipe`.
 *
 *  `observed` is the VACUITY GUARD every caller must check before trusting
 *  either metric: a query matching nothing makes `observed === 0` (and both
 *  `distinct === 0` and `persists === true` trivially, since nothing was
 *  ever checked), and a query matching on exactly ONE frame also leaves both
 *  trivially "nothing happened" — Task R1's "compare a captured reference to
 *  itself" trap, one level up. `observed`'s own floor is derived from the
 *  window's geometry (see `IDENTITY_OBSERVED_FLOOR`), not a fixed constant —
 *  Review Round 1, Important 2: a fixed `>= 2` left a wide corridor (measured
 *  values on this fixture run 15-31 in a 26-31-frame sweep) where a refactor
 *  collapsing real coverage down to a handful of frames would still pass. */
const IDENTITY_PAD = 5;

/** The conservative floor for `observed`, derived from `window.frames`
 *  rather than a magic number — `Math.ceil(window.frames / 2)`, not
 *  `window.frames` itself. A first draft used the full window length and
 *  broke on `wipe`'s OUTGOING side: its own copy is released (Task R2)
 *  exactly when the window opens, and `wipe` only renders `from` for the
 *  FIRST HALF of the window (see `sweepIdentity`'s docblock) — so the
 *  measured floor for that axis is `IDENTITY_PAD` (5, guaranteed pre-window)
 *  plus half the window (10), i.e. 15 on this fixture, genuinely below
 *  `window.frames` (20). Half the window is what survives that: SOME frame
 *  in each half of the window draws something (a two-beat design still has
 *  to show each side at least once), so at least half the window plus
 *  whatever pre/post-window life the item has is a safe lower bound for
 *  every kind measured — while remaining far tighter than the old fixed `2`,
 *  high enough that a sweep collapsing to a handful of frames still fails
 *  it. */
const IDENTITY_OBSERVED_FLOOR = (window: { frames: number }) => Math.ceil(window.frames / 2);

function sweepIdentity(
  items: VideoItem[],
  testid: string,
  window: { start: number; frames: number },
  registry?: TransitionRegistry,
): { distinct: number; persists: boolean; observed: number } {
  // Preview only — the R1/R2 defect class (and therefore the `plan` arm's
  // whole reason to exist) is gated on `isPreviewEnvironment()`; outside
  // preview `ItemBody` returns `null` on every blanked frame regardless of
  // arm, byte-identical to before Task R1. Sweeping the render-mode axis too
  // is out of scope for this task, not an oversight — noted explicitly so a
  // reader doesn't mistake the absence of a `preview` parameter for one.
  clock.preview = true;
  const from = Math.max(0, window.start - IDENTITY_PAD);
  const to = window.start + window.frames + IDENTITY_PAD;
  clock.frame = from;
  const { container, rerender } = render(identityTree(items, registry));
  const seen = new Set<Element>();
  let baseline: Element[] | null = null;
  let persists = true;
  let observed = 0;
  for (let f = from; f <= to; f += 1) {
    clock.frame = f;
    rerender(identityTree(items, registry));
    const matches = instancesOf(container, testid);
    if (matches.length === 0) continue;
    observed += 1;
    for (const el of matches) seen.add(el);
    if (baseline === null) {
      baseline = matches;
      continue;
    }
    if (!baseline.every((el) => matches.includes(el))) persists = false;
  }
  return { distinct: seen.size, persists, observed };
}

interface IdentityCase {
  label: string;
  items: VideoItem[];
  testid: string;
  window: { start: number; frames: number };
}

// Three axes, crossed generatively rather than hand-enumerated: INTERIOR (both
// sides, all three `TRANSITION_ALIGNMENTS`), LEADING (the reel's own edge,
// `from === null`), TRAILING (the reel's own edge, `to === null`). Task 1.2
// shipped a Critical defect precisely because a sweep covered one edge and not
// its twin — leading and trailing are both here, and so are the incoming and
// outgoing side of the interior cut.
//
// Alignment does not vary the LEADING/TRAILING geometry: `computeVideoLayout`
// only lends a handle FROM a neighbour, and a reel edge has none — `inHalf`/
// `outHalf` are forced to 0 by the `!isFirst`/`!isLast` guards regardless of
// the authored alignment (verified against `video-track-layout.ts:87-88`), so
// the window is always exactly `frames` long, flush with the edge. That is why
// only the interior axis is crossed with `TRANSITION_ALIGNMENTS` below.
function interiorCases(kind: string): IdentityCase[] {
  return TRANSITION_ALIGNMENTS.flatMap((alignment: TransitionAlignment) => {
    const items: VideoItem[] = [
      clip('a', 0, 3000, { transitionOut: defaultTransition(kind, { frames: IDENTITY_FRAMES, alignment }) }),
      clip('b', 3000, 6000),
    ];
    const layout = computeVideoLayout(items, IDENTITY_FPS);
    const outWindow = {
      start: layout[0].seqFrom + layout[0].seqDuration - layout[0].outFrames,
      frames: layout[0].outFrames,
    };
    const inWindow = { start: layout[1].seqFrom, frames: layout[1].inFrames };
    return [
      { label: `interior/${alignment}/outgoing(a, from-side)`, items, testid: 'vid-a', window: outWindow },
      { label: `interior/${alignment}/incoming(b, to-side)`, items, testid: 'vid-b', window: inWindow },
    ];
  });
}

function leadingCase(kind: string): IdentityCase {
  const items: VideoItem[] = [
    clip('solo', 0, 3000, { transitionIn: defaultTransition(kind, { frames: IDENTITY_FRAMES }) }),
  ];
  const layout = computeVideoLayout(items, IDENTITY_FPS);
  return {
    label: 'leading-edge/incoming(solo, from===null)',
    items,
    testid: 'vid-solo',
    window: { start: layout[0].seqFrom, frames: layout[0].inFrames },
  };
}

function trailingCase(kind: string): IdentityCase {
  const items: VideoItem[] = [
    clip('solo', 0, 3000, { transitionOut: defaultTransition(kind, { frames: IDENTITY_FRAMES }) }),
  ];
  const layout = computeVideoLayout(items, IDENTITY_FPS);
  return {
    label: 'trailing-edge/outgoing(solo, to===null)',
    items,
    testid: 'vid-solo',
    window: {
      start: layout[0].seqFrom + layout[0].seqDuration - layout[0].outFrames,
      frames: layout[0].outFrames,
    },
  };
}

function casesFor(kind: string): IdentityCase[] {
  return [...interiorCases(kind), leadingCase(kind), trailingCase(kind)];
}

beforeEach(() => {
  resetWarnOnce();
  resetTransitionNodeCache();
});

// COMPOSITE kinds are asserted to FAIL — every kind in the catalog, today —
// on `distinct > 1`, DELIBERATELY NOT `persists` (see `sweepIdentity`'s
// docblock, "WHY THE COMPOSITE BUCKET CANNOT JUST USE `persists` TOO"): the
// composite arm has no legitimate multi-mount concept, so any second element
// it produces is the defect, whether or not it ever displaces the item's
// original reference (`wipe`'s two-beat design produces exactly that shape).
// `toBeGreaterThan(1)`, never `.not.toBe(1)`: the latter is satisfied
// vacuously by `distinct === 0` (a broken query), which is precisely the
// "empty set passes trivially" trap the task brief calls out. `observed`'s
// own floor is asserted FIRST and separately, so a broken query fails loudly
// on ITS OWN assertion rather than being laundered through `distinct`.
describe.each(COMPOSITE_KINDS)('DERIVED — composite-arm "%s" remounts across the crossing (ratchet: RED today)', (kind) => {
  it.each(casesFor(kind).map((c): [string, IdentityCase] => [c.label, c]))('%s', (_label, c) => {
    expect.hasAssertions();
    const { distinct, observed } = sweepIdentity(c.items, c.testid, c.window);
    expect(observed).toBeGreaterThanOrEqual(IDENTITY_OBSERVED_FLOOR(c.window));
    expect(distinct).toBeGreaterThan(1);
  });
});

// PLAN kinds are asserted to PASS. Zero iterations today (`PLAN_KINDS` is
// pinned empty above) — `describe.each([])` runs no tests, which is exactly
// the "derived assertion over an empty set" the brief warns can pass
// trivially by having nothing to check. The block immediately below is what
// keeps this branch from being vacuous: it proves, with a test-only plan node
// built the same way a Stage 2+ brand registration would build one, that this
// SAME machinery (`sweepIdentity`, `casesFor`'s geometry) actually reports
// `persists === true` for a real single-mount boundary — not just that it
// never gets the chance to fail.
describe.each(PLAN_KINDS)('DERIVED — plan-arm "%s" never remounts across the crossing (ratchets green as kinds migrate)', (kind) => {
  it.each(casesFor(kind).map((c): [string, IdentityCase] => [c.label, c]))('%s', (_label, c) => {
    expect.hasAssertions();
    const { persists, observed } = sweepIdentity(c.items, c.testid, c.window);
    expect(observed).toBeGreaterThanOrEqual(IDENTITY_OBSERVED_FLOOR(c.window));
    expect(persists).toBe(true);
  });
});

describe('DERIVED proof — the identity sweep is capable of PASSING, not only of failing', () => {
  // Built exactly the way a Stage 2 brand registration would build one — a
  // `plan` returning ops on the already-mounted shells, nothing more — and
  // registered under a kind that is NOT in `TRANSITION_CATALOG`, so this can
  // never be confused with a catalog kind quietly migrating. `PLAN_KINDS`
  // stays empty; this is scaffolding for the assertion, not a fifth bucket.
  //
  // `planCalls` closes a vacuity gap `persists` alone cannot: a HARD CUT
  // (unrecognised kind, or a typo the registry doesn't match) ALSO produces
  // `persists === true`, for a completely different and unwanted reason —
  // there is no boundary at all, so nothing ever duplicates OR displaces the
  // item either. A green assertion on `persists` alone cannot tell "the plan
  // arm mounted once" from "there was no transition here to begin with".
  // Counting real calls to the plan is the positive evidence that the plan
  // path — not a silent fallback — is what actually ran.
  let planCalls = 0;
  const testPlan = (p: TransitionPlanProps): TransitionComposite => {
    planCalls += 1;
    return {
      from: { style: { opacity: 1 - p.progress } },
      to: { style: { opacity: p.progress } },
    };
  };
  const REGISTRY: TransitionRegistry = { 'single-mount-probe': { renderer: () => ({ plan: testPlan }) } };
  const layoutOpts = { brandKinds: new Set(Object.keys(REGISTRY)) };

  const buildCases = (kind: string): IdentityCase[] => {
    const interior: VideoItem[] = [
      clip('a', 0, 3000, { transitionOut: { kind, frames: IDENTITY_FRAMES } }),
      clip('b', 3000, 6000),
    ];
    const layoutInterior = computeVideoLayout(interior, IDENTITY_FPS, layoutOpts);
    const outWindow = {
      start: layoutInterior[0].seqFrom + layoutInterior[0].seqDuration - layoutInterior[0].outFrames,
      frames: layoutInterior[0].outFrames,
    };
    const inWindow = { start: layoutInterior[1].seqFrom, frames: layoutInterior[1].inFrames };

    const leading: VideoItem[] = [
      clip('solo', 0, 3000, { transitionIn: { kind, frames: IDENTITY_FRAMES } }),
    ];
    const layoutLeading = computeVideoLayout(leading, IDENTITY_FPS, layoutOpts);

    const trailing: VideoItem[] = [
      clip('solo', 0, 3000, { transitionOut: { kind, frames: IDENTITY_FRAMES } }),
    ];
    const layoutTrailing = computeVideoLayout(trailing, IDENTITY_FPS, layoutOpts);

    return [
      { label: 'interior/outgoing', items: interior, testid: 'vid-a', window: outWindow },
      { label: 'interior/incoming', items: interior, testid: 'vid-b', window: inWindow },
      {
        label: 'leading',
        items: leading,
        testid: 'vid-solo',
        window: { start: layoutLeading[0].seqFrom, frames: layoutLeading[0].inFrames },
      },
      {
        label: 'trailing',
        items: trailing,
        testid: 'vid-solo',
        window: {
          start: layoutTrailing[0].seqFrom + layoutTrailing[0].seqDuration - layoutTrailing[0].outFrames,
          frames: layoutTrailing[0].outFrames,
        },
      },
    ];
  };

  it('reports persists === true for a real (test-only) plan-arm boundary, interior and both edges', () => {
    expect.hasAssertions();
    planCalls = 0;
    for (const c of buildCases('single-mount-probe')) {
      const { persists, observed } = sweepIdentity(c.items, c.testid, c.window, REGISTRY);
      expect(observed, c.label).toBeGreaterThanOrEqual(IDENTITY_OBSERVED_FLOOR(c.window));
      expect(persists, c.label).toBe(true);
    }
    // The positive check: the plan actually ran. Without this, a broken
    // registry wiring (a typo'd kind, a dropped `transitions` option) would
    // silently degrade to a hard cut and pass `persists === true` for the
    // wrong reason — see this block's docblock.
    expect(planCalls).toBeGreaterThan(0);
  });

  // REVIEW ROUND 1, IMPORTANT 1 — THE TOLERANCE PROOF. A stable, legal
  // `ghosts` entry (count does not vary with progress, exactly the
  // `LayerOp.ghosts` invariant) must PASS, because nothing that was already
  // on screen had to leave for the ghost to appear. This is the case that
  // would have failed `rgb-split`'s eventual migration under the old
  // distinct-count formulation.
  // The ghost is on the `from` (outgoing, `a`) side deliberately, not `to`:
  // `a`'s own Sequence starts at composition frame 0, well before this
  // boundary's window, so the sweep observes several genuine PRE-window
  // frames (no ghost yet) before `baseline` is captured. `b` (incoming) would
  // be the wrong choice here — its own Sequence is borrowed to start exactly
  // AT the window's opening frame (same coincidence documented in
  // `sweepIdentity`'s `wipe` finding above), so `baseline` would capture the
  // ghost as part of the FIRST observed frame, and its later disappearance
  // (once the window closes) would then — correctly, by the same rule — read
  // as a violation. That is not a bug in `persists`; it is why this proof
  // is built on the side that actually has pre-window life to establish a
  // ghost-free baseline against.
  const ghostPlan = (p: TransitionPlanProps): TransitionComposite => ({
    from: { style: { opacity: 1 - p.progress }, ghosts: [{ opacity: 0.5 }] },
    to: { style: { opacity: p.progress } },
  });
  const GHOST_REGISTRY: TransitionRegistry = { 'single-mount-ghost-probe': { renderer: () => ({ plan: ghostPlan }) } };
  const ghostLayoutOpts = { brandKinds: new Set(Object.keys(GHOST_REGISTRY)) };

  it('tolerates a stable, legal ghost — persists === true even though a second element genuinely exists', () => {
    expect.hasAssertions();
    const interior: VideoItem[] = [
      clip('a', 0, 3000, { transitionOut: { kind: 'single-mount-ghost-probe', frames: IDENTITY_FRAMES } }),
      clip('b', 3000, 6000),
    ];
    const layout = computeVideoLayout(interior, IDENTITY_FPS, ghostLayoutOpts);
    const outWindow = {
      start: layout[0].seqFrom + layout[0].seqDuration - layout[0].outFrames,
      frames: layout[0].outFrames,
    };
    // `a` (the `from` side) is the one carrying the ghost — confirm the ghost
    // is actually there (a vacuity guard of its own: a query that happens to
    // match nothing would make this proof meaningless), then confirm
    // `persists` is still `true` despite it.
    clock.preview = true;
    clock.frame = outWindow.start + Math.floor(outWindow.frames / 2);
    const { container } = render(identityTree(interior, GHOST_REGISTRY));
    expect(instancesOf(container, 'vid-a').length).toBeGreaterThanOrEqual(2);

    const { persists, observed } = sweepIdentity(interior, 'vid-a', outWindow, GHOST_REGISTRY);
    expect(observed).toBeGreaterThanOrEqual(IDENTITY_OBSERVED_FLOOR(outWindow));
    expect(persists).toBe(true);
  });
});
