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

// a: 0-3000ms with a 20-frame burn out. b: 3000-6000ms. 30fps -> cut at frame
// 90, the default (center) alignment gives a window of [80, 100].
//
// PHASE 5 TASK 2.1 changed this fixture's KIND from `fade` to `burn` —
// deliberately, not incidentally. Every hand-written test below (Fix 1/2/3,
// R2, and the Task 1.2 shell-parity test) exercises `composite`-arm
// mechanics specifically: the boundary Sequence, `rebased()` copies,
// `ItemBody`'s blanking, the R1/R2 mount-count floors. `fade` migrated to
// the `plan` arm this task, which does not blank, has no boundary Sequence
// and no rebased copies at all — so this whole file's geometry, counts and
// identities would silently start asserting something else entirely (or
// simply fail, which is what happened here first: confirmed RED against the
// unchanged fixture, `npx vitest run --no-file-parallelism
// video-track-remount.test.tsx` failing exactly these 5 composite-arm
// tests). `burn` is Stage 2.3's, not this task's, and keeps this file
// pinning the arm it says it pins. The DERIVED section below (Task 1.3)
// still names `fade` directly where it means to — this substitution is
// scoped to the hand-written fixture alone.
const reel = (): VideoItem[] => [
  clip('a', 0, 3000, { transitionOut: { kind: 'burn', frames: 20 } }),
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
// `plan`-arm boundary has something to style. `burn` (this file's fixture
// kind since Task 2.1 moved `fade` to the `plan` arm) is still a
// `composite`-arm kind, so this file's geometry, counts and identities above
// must be UNCHANGED by the shells' arrival — which is what makes them a
// parity statement for the shells rather than only for R1/R2.
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

  // THE PIN ITSELF. Deliberately a literal array, not a `.length` count: a
  // failure here prints the offending kind NAMES, which is what the NEXT
  // migration needs to see to update this line deliberately, rather than a
  // bare count telling it only that something moved.
  //
  // PHASE 5 TASK 2.1 moved exactly SEVEN catalog kinds across this
  // partition — `fromRemotionPresentation` → `LayerOp.wrap` for the five
  // official `@remotion/transitions` presentations, the `fade`/`dissolve`
  // alias, and `fade-to-color` AT ITS CATALOG DEFAULT: `defaultTransition`
  // seeds no `color` (only booleans get seeded — `transition-schema.ts`'s
  // own note), so the record `armOf` builds for it has none, which resolves
  // through the plain `fade()` exactly like `fade` and `dissolve` do (see
  // `WRAP_PLAN_KINDS` in `at-cut-transitions.tsx`).
  //
  // PHASE 5 TASK 2.2 adds THREE more — `wipe`, `gradient-wipe`, `pixelate` —
  // by a DIFFERENT mechanism: these are native two-input nodes whose factory
  // now returns `{ plan }` instead of `{ composite }` directly (no
  // `WRAP_PLAN_KINDS` entry needed or added for them; a native node is
  // `isTransitionNode(resolved)` straight out of `resolveTransition`, so
  // `transitionNodeFor`'s wrap-lift branch never runs for them at all).
  // `fade-to-color`'s COLOUR route also migrated this task, but
  // `defaultTransition('fade-to-color', …)` seeds no colour, so THIS derived
  // list — built off the catalog DEFAULT — still only ever reaches the
  // no-colour fallback already counted above; the colour route's own arm is
  // pinned separately in `at-cut-transitions.test.tsx`. Order matches
  // `CATALOG_KINDS`' own order (`TRANSITION_CATALOG`'s declaration order:
  // `dissolve`, `fade`, `fade-to-color`, …, `slide`, `flip`, …, `clock-wipe`,
  // `iris`, `wipe`, `gradient-wipe`, `pixelate`, …), not the brief's prose
  // order.
  it('is exactly the ten Task 2.1+2.2 migrated kinds — re-derive; do not carry forward', () => {
    expect.hasAssertions();
    expect(PLAN_KINDS).toEqual([
      'dissolve', 'fade', 'fade-to-color', 'slide', 'flip', 'clock-wipe', 'iris',
      'wipe', 'gradient-wipe', 'pixelate',
    ]);
    expect(COMPOSITE_KINDS.length).toBe(CATALOG_KINDS.length - PLAN_KINDS.length);
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

/** Two element arrays name the SAME SET of DOM references — order-independent,
 *  reference identity, not structural equality. Used only for the IN-WINDOW
 *  constancy check below (Review Round 2): a plain `.every(includes)` in one
 *  direction is not enough there, because it would not notice a reference
 *  being replaced by another of equal count (the exact "destroyed and
 *  recreated, count constant" case Review Round 2 flagged as the flaw in a
 *  count-only check). Both directions, at equal length, is what actually
 *  pins "the same references, no more, no fewer". */
function sameElements(a: readonly Element[], b: readonly Element[]): boolean {
  return a.length === b.length && a.every((el) => b.includes(el));
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
 *  separate DOM nodes, PLUS the item's own hidden copy (Fix 1) — so
 *  `distinct === 4` there (measured; an earlier version of this comment said
 *  3, counting only the presentation's own internal copies and missing the
 *  item's own — the assertion was never affected, only this count), and
 *  `distinct > 1` correctly flags it either way.
 *
 *  `persists` — REVIEW ROUND 2, IMPORTANT 1 REWRITE. The original
 *  formulation ("every reference on the first observed frame survives to
 *  every later on-screen frame") is FALSE on 4 of a kind's 8 derived plan-arm
 *  cases whenever a legal, stable ghost sits on the SIDE WHOSE OWN SEQUENCE
 *  STARTS EXACTLY AT `window.start`: `interior/incoming`, `leading` (and,
 *  symmetrically, any ghost authored on `to` — the axis the first
 *  ghost-tolerance proof happened not to exercise, having been built on
 *  `from` instead). On that side there are no PRE-window on-screen frames, so
 *  `baseline` is captured on the window's own first frame — WITH the ghost
 *  already in it — and the ghost's mandatory disappearance at window close
 *  then reads, correctly by the old rule but WRONGLY in intent, as a lost
 *  baseline reference. Measured: `interior/incoming` and `leading` both
 *  report `persists === false` for a plan with one stable ghost on `to`,
 *  while `interior/outgoing` and `trailing` (ghost on `from`, which DOES have
 *  pre-window life) report `true` — the same plan, the same invariant, one
 *  formulation, inconsistent by which side happens to have run-up frames.
 *
 *  `rgb-split` is why this cannot be dismissed as an edge case nobody hits:
 *  it is Stage 3, its whole migration IS `ghosts`, and `@remotion/
 *  transitions` applies a per-SIDE presentation — meaning the migrated node
 *  puts its ghosts on `to`, exactly the axis the old formulation broke on.
 *
 *  The fix is two SEPARATE criteria, both required, each catching a
 *  different half of "did this item genuinely remount":
 *
 *  1. BASE-MOUNT PERSISTENCE, across EVERY on-screen frame (not just
 *     in-window ones): the running INTERSECTION of every observed frame's
 *     matches. A reference survives in this intersection only if it appears
 *     at EVERY frame the item is on screen anywhere in the sweep — before,
 *     during, and after the window. Non-empty at the end means the item had
 *     ONE mount that was never destroyed. This is what fails the composite
 *     arm's own copy being released (R2's `drawnThrough`, or a REBASED copy
 *     swapped in behind it): neither the pre-window "own" reference nor a
 *     window-only "rebased" reference can be in EVERY frame's matches, so the
 *     intersection collapses to empty. It does NOT fail a ghost — a ghost is
 *     never expected to survive OUTSIDE the window, so it was never going to
 *     be in this intersection regardless of whether it behaves.
 *  2. IN-WINDOW REFERENCE-SET CONSTANCY: the exact SET of matches (by
 *     reference, via `sameElements`, not merely by COUNT — Review Round 2's
 *     explicit warning: a ghost destroyed and recreated mid-window keeps the
 *     count constant while the identity changes, which a count-only check
 *     would miss entirely) must be IDENTICAL across every frame WITHIN
 *     `[window.start, window.start + window.frames]`. A stable ghost is
 *     present on every in-window frame with the same reference, so this
 *     holds; a ghost whose COUNT varies with progress, or whose identity
 *     changes frame to frame while the count stays fixed, both break it.
 *     This check says nothing about frames outside the window, which is
 *     exactly why a ghost legitimately appearing at window-open and vanishing
 *     at window-close never trips it — those transitions happen AT the
 *     window boundary, never observed as an in-window inconsistency.
 *
 *  `persists` is the AND of both. Verified against all four axis shapes with
 *  a stable ghost (ghost on whichever side is under test): all four now
 *  report `persists === true` — see the ghost-tolerance proofs below, one per
 *  axis. Verified against an UNSTABLE `wrap` (a fresh component reference
 *  every call, forcing a real remount): criterion 1 collapses to an empty
 *  intersection within two frames, `persists === false`, unchanged from
 *  before. Verified against a ghost whose COUNT varies with progress:
 *  criterion 2 breaks the moment the in-window set size changes, `persists
 *  === false` — see the "varying ghost count" pin below, closing a coverage
 *  gap Review Round 2 flagged: after Round 1's fix, nothing in this file
 *  could see a varying ghost count at all (it was covered only as collateral
 *  of failing EVERY ghost under the old rule).
 *
 *  `observed` is the VACUITY GUARD every caller must check before trusting
 *  either metric: a query matching nothing makes `observed === 0`,
 *  `distinct === 0`, and `persists === false` (the base intersection is
 *  never established, so it defaults to size 0 — deliberately NOT a
 *  trivial pass; a broken query should never read as a clean result on
 *  either metric). A query matching on exactly ONE frame is the more
 *  dangerous case — Task R1's "compare a captured reference to itself" — and
 *  IS trivially a pass on both metrics (one frame is its own intersection
 *  and its own in-window baseline), which is exactly why `observed` must be
 *  checked before either metric is trusted, every time. `observed`
 *  has PER-ARM floors (see `IDENTITY_OBSERVED_FLOOR_COMPOSITE` /
 *  `_PLAN`), not one shared constant — Review Round 2's "consider, not
 *  require" note: the composite arm's own copy can be released mid-window
 *  (R2's `drawnThrough`) and `wipe` additionally shows only one side per
 *  half, so its floor stays loose (`Math.ceil(frames / 2)`, Review Round 1);
 *  the PLAN arm never blanks at all (`video-track.tsx`'s `blanked` map is
 *  built from composite boundaries only), so its measured minimum on this
 *  fixture is `window.frames + IDENTITY_PAD` exactly (25 of 20+5, the
 *  tightest of the four axes) — a floor roughly 3x tighter than the
 *  composite one is both correct and cheap to state precisely, so it is
 *  stated precisely rather than left at the loose shared constant. */
const IDENTITY_PAD = 5;

/** See `sweepIdentity`'s docblock, "`observed` is the VACUITY GUARD...". A
 *  first draft used this same formula (`Math.ceil(window.frames / 2)`) for
 *  BOTH arms; kept here for the composite bucket specifically because it is
 *  the one arm whose own copy can be released mid-window (R2) and whose
 *  `wipe` axis is measured at 15 of a 20-frame window (5 pre-window PAD +
 *  half the window, `wipe` rendering only one side per half). */
const IDENTITY_OBSERVED_FLOOR_COMPOSITE = (window: { frames: number }) => Math.ceil(window.frames / 2);

/** The PLAN arm never blanks (`video-track.tsx`: `blanked` is built from
 *  composite boundaries only), so an item is on screen for essentially the
 *  ENTIRE sweep bar the one side of PAD it genuinely has no life in (a
 *  leading-edge item has no pre-window frames; a trailing/outgoing item has
 *  no post-window frames). `window.frames + IDENTITY_PAD` is therefore a
 *  safe, precise floor — measured minimum on this fixture is exactly 25 (a
 *  20-frame window + 5-frame PAD), the tightest of the four axis shapes —
 *  roughly 3x tighter than the composite floor, stated as its own constant
 *  rather than left at the shared, looser one. */
const IDENTITY_OBSERVED_FLOOR_PLAN = (window: { frames: number }) => window.frames + IDENTITY_PAD;

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
  let baseIntersection: Set<Element> | null = null;
  let inWindowBaseline: Element[] | null = null;
  let inWindowConstant = true;
  let observed = 0;
  for (let f = from; f <= to; f += 1) {
    clock.frame = f;
    rerender(identityTree(items, registry));
    const matches = instancesOf(container, testid);
    if (matches.length === 0) continue;
    observed += 1;
    for (const el of matches) seen.add(el);

    // Criterion 1: base-mount persistence, over the WHOLE sweep.
    if (baseIntersection === null) {
      baseIntersection = new Set(matches);
    } else {
      for (const el of baseIntersection) if (!matches.includes(el)) baseIntersection.delete(el);
    }

    // Criterion 2: in-window reference-set constancy, IN-WINDOW frames only.
    if (f >= window.start && f <= window.start + window.frames) {
      if (inWindowBaseline === null) {
        inWindowBaseline = matches;
      } else if (!sameElements(inWindowBaseline, matches)) {
        inWindowConstant = false;
      }
    }
  }
  const basePersists = (baseIntersection?.size ?? 0) > 0;
  return { distinct: seen.size, persists: basePersists && inWindowConstant, observed };
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
    expect(observed).toBeGreaterThanOrEqual(IDENTITY_OBSERVED_FLOOR_COMPOSITE(c.window));
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
    expect(observed).toBeGreaterThanOrEqual(IDENTITY_OBSERVED_FLOOR_PLAN(c.window));
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
      expect(observed, c.label).toBeGreaterThanOrEqual(IDENTITY_OBSERVED_FLOOR_PLAN(c.window));
      expect(persists, c.label).toBe(true);
    }
    // The positive check: the plan actually ran. Without this, a broken
    // registry wiring (a typo'd kind, a dropped `transitions` option) would
    // silently degrade to a hard cut and pass `persists === true` for the
    // wrong reason — see this block's docblock.
    expect(planCalls).toBeGreaterThan(0);
  });

});

// ---------------------------------------------------------------------------
// REVIEW ROUND 1, IMPORTANT 1 (the tolerance proof) → REVIEW ROUND 2,
// IMPORTANT 1 (the same proof, rewritten, run on all four axis shapes).
//
// A stable, legal `ghosts` entry (count does not vary with progress, exactly
// the `LayerOp.ghosts` invariant) must PASS on every axis, because nothing
// that was already on screen had to leave for the ghost to appear. Round 1's
// proof was built ONLY on the `from` (outgoing) side, which is the one shape
// where tolerance was never structurally in doubt (that side always has
// genuine pre-window on-screen frames to establish a ghost-free baseline
// against). Round 2's re-review added a ghost on `to` and found the OLD
// `persists` formulation false on `interior/incoming` and `leading` — the two
// axes whose item Sequence starts exactly AT `window.start`, so there is no
// pre-window frame at all and the ghost is present on the very first frame
// ever observed. `sweepIdentity`'s current two-criterion formulation (base
// intersection over the WHOLE sweep + in-window set constancy) fixes this by
// construction — a ghost is never expected to survive OUTSIDE the window
// (criterion 1 doesn't require it to), and it IS present, stably, on EVERY
// in-window frame regardless of which side or axis it is authored on
// (criterion 2 only compares within the window). This is not asserted, it is
// run: all four axis shapes below, ghost on whichever side is actually under
// test.
//
// `rgb-split` — Stage 3, whose entire migration IS `ghosts`, applied per SIDE
// by `@remotion/transitions` — is why the `to`-side axes are not optional
// coverage: the migrated node's ghosts land on `to`, exactly the shape Round
// 1's proof did not exercise.
describe('DERIVED proof — a stable, legal ghost is tolerated on every axis shape', () => {
  const ghostPlanFrom = (p: TransitionPlanProps): TransitionComposite => ({
    from: { style: { opacity: 1 - p.progress }, ghosts: [{ opacity: 0.5 }] },
    to: { style: { opacity: p.progress } },
  });
  const ghostPlanTo = (p: TransitionPlanProps): TransitionComposite => ({
    from: { style: { opacity: 1 - p.progress } },
    to: { style: { opacity: p.progress }, ghosts: [{ opacity: 0.5 }] },
  });
  const GHOST_FROM_REGISTRY: TransitionRegistry = { 'single-mount-ghost-from-probe': { renderer: () => ({ plan: ghostPlanFrom }) } };
  const GHOST_TO_REGISTRY: TransitionRegistry = { 'single-mount-ghost-to-probe': { renderer: () => ({ plan: ghostPlanTo }) } };
  const fromOpts = { brandKinds: new Set(Object.keys(GHOST_FROM_REGISTRY)) };
  const toOpts = { brandKinds: new Set(Object.keys(GHOST_TO_REGISTRY)) };

  interface GhostCase extends IdentityCase { registry: TransitionRegistry }

  const ghostCases = (): GhostCase[] => {
    const interiorFrom: VideoItem[] = [
      clip('a', 0, 3000, { transitionOut: { kind: 'single-mount-ghost-from-probe', frames: IDENTITY_FRAMES } }),
      clip('b', 3000, 6000),
    ];
    const layoutFrom = computeVideoLayout(interiorFrom, IDENTITY_FPS, fromOpts);
    const outWindow = {
      start: layoutFrom[0].seqFrom + layoutFrom[0].seqDuration - layoutFrom[0].outFrames,
      frames: layoutFrom[0].outFrames,
    };

    const interiorTo: VideoItem[] = [
      clip('a', 0, 3000, { transitionOut: { kind: 'single-mount-ghost-to-probe', frames: IDENTITY_FRAMES } }),
      clip('b', 3000, 6000),
    ];
    const layoutTo = computeVideoLayout(interiorTo, IDENTITY_FPS, toOpts);
    const inWindow = { start: layoutTo[1].seqFrom, frames: layoutTo[1].inFrames };

    const leading: VideoItem[] = [
      clip('solo', 0, 3000, { transitionIn: { kind: 'single-mount-ghost-to-probe', frames: IDENTITY_FRAMES } }),
    ];
    const layoutLeading = computeVideoLayout(leading, IDENTITY_FPS, toOpts);

    const trailing: VideoItem[] = [
      clip('solo', 0, 3000, { transitionOut: { kind: 'single-mount-ghost-from-probe', frames: IDENTITY_FRAMES } }),
    ];
    const layoutTrailing = computeVideoLayout(trailing, IDENTITY_FPS, fromOpts);

    return [
      {
        label: 'interior/outgoing (ghost on from — the one Round 1 already proved)',
        items: interiorFrom, testid: 'vid-a', window: outWindow, registry: GHOST_FROM_REGISTRY,
      },
      {
        label: 'interior/incoming (ghost on to — the one that was false)',
        items: interiorTo, testid: 'vid-b', window: inWindow, registry: GHOST_TO_REGISTRY,
      },
      {
        label: 'leading (ghost on to — the other one that was false)',
        items: leading, testid: 'vid-solo',
        window: { start: layoutLeading[0].seqFrom, frames: layoutLeading[0].inFrames },
        registry: GHOST_TO_REGISTRY,
      },
      {
        label: 'trailing (ghost on from)',
        items: trailing, testid: 'vid-solo',
        window: {
          start: layoutTrailing[0].seqFrom + layoutTrailing[0].seqDuration - layoutTrailing[0].outFrames,
          frames: layoutTrailing[0].outFrames,
        },
        registry: GHOST_FROM_REGISTRY,
      },
    ];
  };

  it.each(ghostCases().map((c): [string, GhostCase] => [c.label, c]))(
    '%s — persists === true even though a second element genuinely exists',
    (_label, c) => {
      expect.hasAssertions();
      // Vacuity guard of its own: confirm the ghost is actually mounted
      // before trusting a green `persists` — a query matching nothing would
      // make this proof meaningless in the OTHER direction.
      clock.preview = true;
      clock.frame = c.window.start + Math.floor(c.window.frames / 2);
      const { container } = render(identityTree(c.items, c.registry));
      expect(instancesOf(container, c.testid).length).toBeGreaterThanOrEqual(2);

      const { persists, observed } = sweepIdentity(c.items, c.testid, c.window, c.registry);
      expect(observed).toBeGreaterThanOrEqual(IDENTITY_OBSERVED_FLOOR_PLAN(c.window));
      expect(persists).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
// REVIEW ROUND 2 — THE COVERAGE GAP LEFT BY TOLERATING GHOSTS AT ALL.
//
// `auditGhosts` (`lib/render/video-track-plan.tsx:161`) dev-warns at runtime
// when a boundary's `ghosts.length` varies with progress — the ONE invariant
// `LayerOp.ghosts` actually has. Before Review Round 1's fix, this file's
// `distinct === 1` formulation covered that defect class as pure collateral:
// EVERY ghost failed identity, varying or not, so nothing was lost by not
// naming the case explicitly. After tolerating a STABLE ghost, that
// collateral coverage is gone — nothing in this file could tell a varying
// ghost count from a stable one anymore. This pin closes that gap directly,
// independent of `auditGhosts`'s own dev-warning mechanism: a varying ghost
// count must fail `persists` HERE, on the identity ratchet, not only produce
// a console warning elsewhere.
describe('DERIVED proof — a ghost whose count VARIES with progress is NOT tolerated', () => {
  const varyingGhostPlan = (p: TransitionPlanProps): TransitionComposite => ({
    from: { style: { opacity: 1 - p.progress }, ghosts: p.progress < 0.5 ? [] : [{ opacity: 0.5 }] },
    to: { style: { opacity: p.progress } },
  });
  const VARYING_GHOST_REGISTRY: TransitionRegistry = {
    'single-mount-varying-ghost-probe': { renderer: () => ({ plan: varyingGhostPlan }) },
  };
  const varyingOpts = { brandKinds: new Set(Object.keys(VARYING_GHOST_REGISTRY)) };

  it('reports persists === false — the in-window reference SET is not constant', () => {
    expect.hasAssertions();
    const interior: VideoItem[] = [
      clip('a', 0, 3000, { transitionOut: { kind: 'single-mount-varying-ghost-probe', frames: IDENTITY_FRAMES } }),
      clip('b', 3000, 6000),
    ];
    const layout = computeVideoLayout(interior, IDENTITY_FPS, varyingOpts);
    const outWindow = {
      start: layout[0].seqFrom + layout[0].seqDuration - layout[0].outFrames,
      frames: layout[0].outFrames,
    };
    // Vacuity guard of its own: confirm the count genuinely DOES differ
    // across the window before trusting a red `persists` — this is the proof
    // that the fixture exercises the defect this test claims to catch.
    clock.preview = true;
    clock.frame = outWindow.start + Math.floor(outWindow.frames * 0.25); // progress < 0.5
    const { container, rerender } = render(identityTree(interior, VARYING_GHOST_REGISTRY));
    const early = instancesOf(container, 'vid-a').length;
    clock.frame = outWindow.start + Math.floor(outWindow.frames * 0.75); // progress >= 0.5
    rerender(identityTree(interior, VARYING_GHOST_REGISTRY));
    const late = instancesOf(container, 'vid-a').length;
    expect(late).toBeGreaterThan(early);

    const { persists, observed } = sweepIdentity(interior, 'vid-a', outWindow, VARYING_GHOST_REGISTRY);
    expect(observed).toBeGreaterThanOrEqual(IDENTITY_OBSERVED_FLOOR_PLAN(outWindow));
    expect(persists).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PHASE 5 TASK 1.4 — FINDING 1's FIX, PROVED ON THE SAME INSTRUMENT.
//
// Before this task, `LayerShell` (`video-track-plan.tsx`) read `wrap` off the
// LIVE per-frame composite alone — so a boundary whose plan declares a `wrap`
// at all had it present ONLY for the frames the boundary was actually live:
// absent outside the window, present inside it. That is a type change at
// `children`'s tree position at BOTH window edges, which remounts the clip —
// the exact defect class this phase removes, reached through the contract
// (`LayerOp.wrap`) rather than through the assembly. `wrapFor`
// (`video-track.tsx`) is the fix: it samples the plan ONCE, outside any live
// frame (`frame: -1`, unreachable from a real boundary window), so
// `LayerShell` has an answer for "does this side declare a wrap" on every
// frame the item is mounted, not only the live ones — and mounts the Wrap
// component (when declared) for the item's WHOLE life, passing `active` to
// say whether the boundary happens to be live this frame.
//
// CONFIRMED RED AGAINST THE PRE-1.4 TREE — measured, not assumed. Run via
// `git stash push -- lib/render/video-track.tsx lib/render/video-track-plan.tsx
// lib/theming/transitions.ts` (this test file and the rest of the fixture
// left in place: `wrap`'s pre-1.4 TYPE — `ComponentType<{ children }>`, no
// `active` — is structurally compatible with the `active`-carrying `Marker`
// below, since TypeScript accepts extra unused props on a function
// component, so no compile change was needed to observe the pre-fix runtime
// behaviour), then `npx vitest run --no-file-parallelism
// src/video-track-remount.test.tsx`: **6 of 176 failed, exactly the 6 below,
// every pre-existing test in the file unaffected** — all four `wrapCases`
// entries reported `persists === false` (not flaky; every run), and both
// dedicated OPENING/CLOSING-edge tests failed exactly where the pre-1.4
// `LayerShell` could not have passed them (no life-long mount at all, so no
// `wrap-marker` before the window opens, and no `active` on it either).
// `git stash pop` restored the fix and all 176 passed again. See the task
// report for the exact terminal output.
describe('DERIVED proof — TASK 1.4: a `wrap` is mounted for the item\'s WHOLE life, not only while its own boundary is live (Finding 1)', () => {
  // A component that renders visibly (so a test can tell it is actually
  // mounted, not merely declared) and echoes `active` into the DOM (so the
  // WIRING that delivers `active` — not just the presence of `Wrap` itself —
  // has something to be pinned by; see the `active`-delivery pin below).
  const Marker: React.FC<{ active: boolean; children: React.ReactNode }> = ({ active, children }) => (
    <span data-testid="wrap-marker" data-active={String(active)}>{children}</span>
  );
  const wrapPlanFrom = (p: TransitionPlanProps): TransitionComposite => ({
    from: { style: { opacity: 1 - p.progress }, wrap: Marker },
    to: { style: { opacity: p.progress } },
  });
  const wrapPlanTo = (p: TransitionPlanProps): TransitionComposite => ({
    from: { style: { opacity: 1 - p.progress } },
    to: { style: { opacity: p.progress }, wrap: Marker },
  });
  const WRAP_FROM_REGISTRY: TransitionRegistry = { 'single-mount-wrap-from-probe': { renderer: () => ({ plan: wrapPlanFrom }) } };
  const WRAP_TO_REGISTRY: TransitionRegistry = { 'single-mount-wrap-to-probe': { renderer: () => ({ plan: wrapPlanTo }) } };
  const fromOpts = { brandKinds: new Set(Object.keys(WRAP_FROM_REGISTRY)) };
  const toOpts = { brandKinds: new Set(Object.keys(WRAP_TO_REGISTRY)) };

  interface WrapCase extends IdentityCase { registry: TransitionRegistry }

  // The same four axis shapes the ghost-tolerance proof above uses, for the
  // same reason: `from` has genuine PRE-window on-screen life on
  // `interior/outgoing` and `trailing`; `to` does not on `interior/incoming`
  // and `leading` (its item's own Sequence starts exactly at `window.start`)
  // — the shape that broke `persists`'s first formulation (Review Round 2).
  // Both arms of `wrap` × both distinct edge shapes, per the task brief.
  const wrapCases = (): WrapCase[] => {
    const interiorFrom: VideoItem[] = [
      clip('a', 0, 3000, { transitionOut: { kind: 'single-mount-wrap-from-probe', frames: IDENTITY_FRAMES } }),
      clip('b', 3000, 6000),
    ];
    const layoutFrom = computeVideoLayout(interiorFrom, IDENTITY_FPS, fromOpts);
    const outWindow = {
      start: layoutFrom[0].seqFrom + layoutFrom[0].seqDuration - layoutFrom[0].outFrames,
      frames: layoutFrom[0].outFrames,
    };

    const interiorTo: VideoItem[] = [
      clip('a', 0, 3000, { transitionOut: { kind: 'single-mount-wrap-to-probe', frames: IDENTITY_FRAMES } }),
      clip('b', 3000, 6000),
    ];
    const layoutTo = computeVideoLayout(interiorTo, IDENTITY_FPS, toOpts);
    const inWindow = { start: layoutTo[1].seqFrom, frames: layoutTo[1].inFrames };

    const leading: VideoItem[] = [
      clip('solo', 0, 3000, { transitionIn: { kind: 'single-mount-wrap-to-probe', frames: IDENTITY_FRAMES } }),
    ];
    const layoutLeading = computeVideoLayout(leading, IDENTITY_FPS, toOpts);

    const trailing: VideoItem[] = [
      clip('solo', 0, 3000, { transitionOut: { kind: 'single-mount-wrap-from-probe', frames: IDENTITY_FRAMES } }),
    ];
    const layoutTrailing = computeVideoLayout(trailing, IDENTITY_FPS, fromOpts);

    return [
      {
        label: 'interior/outgoing (wrap on from — has pre-window life)',
        items: interiorFrom, testid: 'vid-a', window: outWindow, registry: WRAP_FROM_REGISTRY,
      },
      {
        label: 'interior/incoming (wrap on to — no pre-window life)',
        items: interiorTo, testid: 'vid-b', window: inWindow, registry: WRAP_TO_REGISTRY,
      },
      {
        label: 'leading (wrap on to — no pre-window life)',
        items: leading, testid: 'vid-solo',
        window: { start: layoutLeading[0].seqFrom, frames: layoutLeading[0].inFrames },
        registry: WRAP_TO_REGISTRY,
      },
      {
        label: 'trailing (wrap on from — has pre-window life)',
        items: trailing, testid: 'vid-solo',
        window: {
          start: layoutTrailing[0].seqFrom + layoutTrailing[0].seqDuration - layoutTrailing[0].outFrames,
          frames: layoutTrailing[0].outFrames,
        },
        registry: WRAP_FROM_REGISTRY,
      },
    ];
  };

  it.each(wrapCases().map((c): [string, WrapCase] => [c.label, c]))(
    '%s — persists === true across both window edges (the clip never leaves its Wrap)',
    (_label, c) => {
      expect.hasAssertions();
      // Vacuity guard: the Wrap marker is genuinely mounted before trusting a
      // green `persists` — otherwise a broken registry wiring could silently
      // degrade to "no wrap at all" and pass for the wrong reason.
      clock.preview = true;
      clock.frame = c.window.start + Math.floor(c.window.frames / 2);
      const { container } = render(identityTree(c.items, c.registry));
      expect(instancesOf(container, 'wrap-marker').length).toBeGreaterThanOrEqual(1);

      const { persists, observed } = sweepIdentity(c.items, c.testid, c.window, c.registry);
      expect(observed).toBeGreaterThanOrEqual(IDENTITY_OBSERVED_FLOOR_PLAN(c.window));
      expect(persists).toBe(true);
    },
  );

  // PIN THE WIRING, NOT THE PURE FUNCTION. `persists === true` alone would
  // also be satisfied by a `LayerShell` that dropped `wrap` on the floor
  // entirely (never mounting `Marker` at all) — the clip's own identity would
  // trivially persist with nothing wrapping it. This asserts the POSITIVE
  // fact the persistence check cannot: the Wrap element is mounted on every
  // frame the item is on screen (before, during and after the window) with
  // exactly ONE reference the whole time, and it carries the correct `active`
  // value on both sides of both edges.
  it('the OPENING edge: the Wrap element persists (one reference) from before the window through mid-window, with `active` flipping true', () => {
    expect.hasAssertions();
    // `from` side of an interior boundary — the one axis shape with genuine
    // PRE-window on-screen life (`interior/outgoing` in `wrapCases` above),
    // which is what this edge needs to exercise: the same Wrap reference must
    // already be there BEFORE the window opens.
    const items: VideoItem[] = [
      clip('a', 0, 3000, { transitionOut: { kind: 'single-mount-wrap-from-probe', frames: IDENTITY_FRAMES } }),
      clip('b', 3000, 6000),
    ];
    const layout = computeVideoLayout(items, IDENTITY_FPS, fromOpts);
    const outWindow = {
      start: layout[0].seqFrom + layout[0].seqDuration - layout[0].outFrames,
      frames: layout[0].outFrames,
    };

    clock.preview = true;
    clock.frame = outWindow.start - IDENTITY_PAD; // before the window opens; 'a' is already on screen
    const { container, rerender } = render(identityTree(items, WRAP_FROM_REGISTRY));
    const before = instancesOf(container, 'wrap-marker');
    expect(before.length).toBe(1);
    expect(before[0].getAttribute('data-active')).toBe('false');
    const markerRef = before[0];

    clock.frame = outWindow.start; // window opens
    rerender(identityTree(items, WRAP_FROM_REGISTRY));
    const atOpen = instancesOf(container, 'wrap-marker');
    expect(atOpen.length).toBe(1);
    expect(atOpen[0]).toBe(markerRef); // same reference — no remount at the opening edge
    expect(atOpen[0].getAttribute('data-active')).toBe('true');

    clock.frame = outWindow.start + Math.floor(outWindow.frames / 2); // mid-window
    rerender(identityTree(items, WRAP_FROM_REGISTRY));
    const mid = instancesOf(container, 'wrap-marker');
    expect(mid[0]).toBe(markerRef);
    expect(mid[0].getAttribute('data-active')).toBe('true');
  });

  it('the CLOSING edge: the Wrap element persists (one reference) from mid-window through well after it closes, with `active` flipping back to false', () => {
    expect.hasAssertions();
    // `to` side of an interior boundary — but the RECEIVING item's life must
    // outlast the window for a closing edge to be observable at all, so this
    // uses a THREE-item reel: `b`'s incoming boundary (from `a`) is the one
    // under test, and `b`'s own Sequence runs on well past that window's
    // close, right up to its own (unrelated, hard-cut) boundary with `c`.
    const items: VideoItem[] = [
      clip('a', 0, 3000, { transitionOut: { kind: 'single-mount-wrap-to-probe', frames: IDENTITY_FRAMES } }),
      clip('b', 3000, 6000),
      clip('c', 6000, 9000),
    ];
    const layout = computeVideoLayout(items, IDENTITY_FPS, toOpts);
    const inWindow = { start: layout[1].seqFrom, frames: layout[1].inFrames };

    clock.preview = true;
    clock.frame = inWindow.start; // window opens — 'b' has no pre-window life on this side
    const { container, rerender } = render(identityTree(items, WRAP_TO_REGISTRY));
    const atOpen = instancesOf(container, 'wrap-marker');
    expect(atOpen.length).toBe(1);
    expect(atOpen[0].getAttribute('data-active')).toBe('true');
    const markerRef = atOpen[0];

    clock.frame = inWindow.start + Math.floor(inWindow.frames / 2); // mid-window
    rerender(identityTree(items, WRAP_TO_REGISTRY));
    const mid = instancesOf(container, 'wrap-marker');
    expect(mid[0]).toBe(markerRef);
    expect(mid[0].getAttribute('data-active')).toBe('true');

    clock.frame = inWindow.start + inWindow.frames + 1; // one past the window's close
    rerender(identityTree(items, WRAP_TO_REGISTRY));
    const afterClose = instancesOf(container, 'wrap-marker');
    expect(afterClose.length).toBe(1);
    expect(afterClose[0]).toBe(markerRef); // same reference — no remount at the closing edge
    expect(afterClose[0].getAttribute('data-active')).toBe('false');
  });
});

// ---------------------------------------------------------------------------
// PHASE 5 TASK 1.4, FIX ROUND 1, IMPORTANT 1 — "A WRAP THAT DISAGREES BETWEEN
// THE SAMPLE AND A LIVE CALL" — the proof `LayerShell`'s and `wrapFor`'s doc
// comments cite by this exact phrase. Written because the comments cited it
// before it existed — the precise overclaim shape this phase has already had
// to walk back once (Task 1.1's `ghosts`/`warnOnce` promise).
//
// THE CASE, per the task brief: a plan whose LIVE `op.wrap` differs from what
// `wrapFor` sampled. `wrapFor` samples with the sentinel `frame: -1`, so
// `wrap: p.frame < 0 ? Stable : Live` returns `Stable` to the one-time sample
// and `Live` to every real per-frame call — a contract violation (the doc
// comment on `LayerOp.wrap` requires a reference stable for the item's whole
// life), but the exact shape the fix round exists to define behaviour for.
//
// BOTH HALVES OF THE MEASUREMENT:
//   1. Under the SHIPPED one-source code (`LayerShell` reads only
//      `wraps.get(...)`, never the live `op.wrap`), this test asserts
//      `persists === true` and the SAME DOM reference — still `Stable` —
//      before, at, and after the window opens: no flicker, because the live
//      `Live` value is never read at all.
//   2. The OLD two-source code (`Wrap = op?.wrap ?? wraps.get(...)`, deleted
//      by this fix round) is not present in the tree to run — but was
//      confirmed by manual mutation (re-adding that exact line) to fail this
//      same test: the DOM tag flips from `Stable` to `Live` at the window's
//      first live frame, changing `container.innerHTML`'s element type at
//      `children`'s position and producing `persists === false` (see
//      task-1.4-report.md's fix-round-1 mutation log for the exact command
//      and output).
describe('DERIVED proof — TASK 1.4 fix round 1: "a wrap that disagrees between the sample and a live call"', () => {
  it('does not flicker under the shipped one-source code — the live op.wrap is never read', () => {
    expect.hasAssertions();
    const Stable: React.FC<{ active: boolean; children: React.ReactNode }> = ({ active, children }) => (
      <span data-testid="wrap-marker" data-source="stable" data-active={String(active)}>{children}</span>
    );
    const Live: React.FC<{ active: boolean; children: React.ReactNode }> = ({ active, children }) => (
      <span data-testid="wrap-marker" data-source="live" data-active={String(active)}>{children}</span>
    );
    // `p.frame < 0` is true ONLY for `wrapFor`'s sentinel sample
    // (`{ progress: 0, frame: -1 }`) — never for a genuine live call, which
    // `VideoTrackHost` only ever makes with `frame` in `[0, b.frames]`. So
    // this plan is deliberately NON-compliant with `wrap`'s stable-reference
    // requirement, on purpose: it is the fixture for what happens when that
    // requirement is violated.
    const disagreeingPlan = (p: TransitionPlanProps): TransitionComposite => ({
      from: { style: { opacity: 1 - p.progress }, wrap: p.frame < 0 ? Stable : Live },
      to: { style: { opacity: p.progress } },
    });
    const REGISTRY: TransitionRegistry = {
      'single-mount-wrap-disagree-probe': { renderer: () => ({ plan: disagreeingPlan }) },
    };
    const opts = { brandKinds: new Set(Object.keys(REGISTRY)) };

    const items: VideoItem[] = [
      clip('a', 0, 3000, { transitionOut: { kind: 'single-mount-wrap-disagree-probe', frames: IDENTITY_FRAMES } }),
      clip('b', 3000, 6000),
    ];
    const layout = computeVideoLayout(items, IDENTITY_FPS, opts);
    // `from` side of an interior boundary — genuine pre-window on-screen
    // life, which is what makes the window-opening edge observable at all
    // (the same reason `wrapCases`' opening-edge test above uses this axis).
    const outWindow = {
      start: layout[0].seqFrom + layout[0].seqDuration - layout[0].outFrames,
      frames: layout[0].outFrames,
    };

    clock.preview = true;
    clock.frame = outWindow.start - IDENTITY_PAD; // before the window opens
    const { container, rerender } = render(identityTree(items, REGISTRY));
    const before = instancesOf(container, 'wrap-marker');
    expect(before.length).toBe(1);
    expect(before[0].getAttribute('data-source')).toBe('stable'); // wrapFor's frame:-1 sample
    const markerRef = before[0];

    // The window's first live frame — under the deleted two-source code,
    // `op.wrap` here would be `Live`, a different component reference /
    // element type than the sample's `Stable`, and the mount would flip.
    clock.frame = outWindow.start;
    rerender(identityTree(items, REGISTRY));
    const atOpen = instancesOf(container, 'wrap-marker');
    expect(atOpen.length).toBe(1);
    expect(atOpen[0]).toBe(markerRef); // SAME reference — still Stable, no flicker
    expect(atOpen[0].getAttribute('data-source')).toBe('stable');

    clock.frame = outWindow.start + Math.floor(outWindow.frames / 2); // mid-window
    rerender(identityTree(items, REGISTRY));
    const mid = instancesOf(container, 'wrap-marker');
    expect(mid[0]).toBe(markerRef);
    expect(mid[0].getAttribute('data-source')).toBe('stable');

    const { persists, observed } = sweepIdentity(items, 'vid-a', outWindow, REGISTRY);
    expect(observed).toBeGreaterThanOrEqual(IDENTITY_OBSERVED_FLOOR_PLAN(outWindow));
    expect(persists).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PHASE 5 TASK 1.4, FIX ROUND 2, ITEM 3 — `active`'s INDEPENDENCE FROM
// OP-PRESENCE, PINNED. `LayerShell`'s own doc comment on `active` says: "the
// boundary is LIVE this frame, independent of whether this particular SIDE's
// op happens to be present (a plan that sets only `to` on some live frame
// still has its boundary live for `from`'s purposes)". Nothing enforced that
// claim before this test — `active = op !== undefined` (a plausible-looking
// simplification) leaves all pre-existing tests green, because every one of
// them authors a plan that sets BOTH `from` and `to` on every live frame.
//
// THE FIXTURE: a plan whose live composite returns ONLY a `to` key — no
// `from` property at all, not even `from: undefined` — every live frame. The
// `from` side's `wrap` still comes from `wrapFor`'s ONE-TIME sample
// (`frame: -1`), which this plan answers separately (only at that sentinel
// call) purely so the test has a `Wrap` to read `active` off; the LIVE half
// of the fixture never sets `from` at all, which is the actual thing under
// test.
describe('DERIVED proof — TASK 1.4 fix round 2: `active` does not depend on this side\'s own op being present', () => {
  it('the `from` shell stays active when the live composite sets only `to`', () => {
    expect.hasAssertions();
    const Marker: React.FC<{ active: boolean; children: React.ReactNode }> = ({ active, children }) => (
      <span data-testid="wrap-marker" data-active={String(active)}>{children}</span>
    );
    const onlyToPlan = (p: TransitionPlanProps): TransitionComposite => {
      if (p.frame < 0) {
        // `wrapFor`'s sentinel sample only — gives `LayerShell` a `wrap` to
        // mount on the `from` side so `active` has somewhere to be observed.
        return { from: { wrap: Marker } };
      }
      // Every LIVE frame: `from` is entirely absent, not merely styleless.
      return { to: { style: { opacity: p.progress } } };
    };
    const REGISTRY: TransitionRegistry = {
      'single-mount-active-independence-probe': { renderer: () => ({ plan: onlyToPlan }) },
    };
    const opts = { brandKinds: new Set(Object.keys(REGISTRY)) };

    const items: VideoItem[] = [
      clip('a', 0, 3000, { transitionOut: { kind: 'single-mount-active-independence-probe', frames: IDENTITY_FRAMES } }),
      clip('b', 3000, 6000),
    ];
    const layout = computeVideoLayout(items, IDENTITY_FPS, opts);
    const outWindow = {
      start: layout[0].seqFrom + layout[0].seqDuration - layout[0].outFrames,
      frames: layout[0].outFrames,
    };

    clock.preview = true;
    clock.frame = outWindow.start + Math.floor(outWindow.frames / 2); // mid-window, live
    const { container } = render(identityTree(items, REGISTRY));
    const markers = instancesOf(container, 'wrap-marker');
    expect(markers.length).toBe(1);
    // The pin: `op` (this side's own live value) is undefined on every live
    // frame for this fixture, and `active` must be `true` anyway — it comes
    // from the BOUNDARY being live, not from this SIDE having an op.
    expect(markers[0].getAttribute('data-active')).toBe('true');
  });
});

// ---------------------------------------------------------------------------
// PHASE 5 TASK 1.4, FIX ROUND 2, ITEM 4 — THE WRAP-ON-THE-EDGE-PLATE AXIS.
// Design §2.5 claims a materialised `EdgePlate` takes its side's op "exactly
// as a clip does" — `wrap` included — via the same `LayerShell`
// (`video-track.tsx`'s `edge()`). Every `wrapCases` entry above puts the wrap
// on the REAL clip's side of a leading/trailing boundary; neither ever puts
// it on the EDGE PLATE's own side, so that half of the design's claim was
// untested.
//
// CONFIRMS THE REVIEWER'S READ, RATHER THAN ASSUMING IT: the plate's
// `LayerShell` lives inside `edge()`'s own `planSequence`
// (`from: b.start, durationInFrames: b.frames + BOUNDARY_TAIL`) — a
// window-scoped Sequence, not a life-long one like an item's own. Outside
// that Sequence's range the plate's `LayerShell` is not merely inactive, it
// does not exist in the tree AT ALL (a plain, non-premounted `<Sequence>`
// renders `null` outside its own range). And WITHIN that range, `local` is
// always in `[0, b.frames]` by construction — exactly `VideoTrackHost`'s own
// live-boundary condition — so the boundary is live on every frame the
// plate's shell is mounted. The two tests below check both directions: the
// plate is wrapped, `active`, whenever it exists (first test), and it simply
// does not exist at all outside the window (second test) — together showing
// there is no active-toggling axis to sweep here, structurally, not by
// assumption.
describe('DERIVED proof — TASK 1.4 fix round 2: wrap applies to a materialised edge plate exactly as it does to a clip', () => {
  const Marker: React.FC<{ active: boolean; children: React.ReactNode }> = ({ active, children }) => (
    <span data-testid="wrap-marker" data-active={String(active)}>{children}</span>
  );
  const leadingWrapPlan = (p: TransitionPlanProps): TransitionComposite => ({
    from: { style: { opacity: 1 - p.progress }, wrap: Marker },
    to: { style: { opacity: p.progress } },
  });
  const trailingWrapPlan = (p: TransitionPlanProps): TransitionComposite => ({
    from: { style: { opacity: 1 - p.progress } },
    to: { style: { opacity: p.progress }, wrap: Marker },
  });
  const LEADING_REGISTRY: TransitionRegistry = {
    'single-mount-edge-wrap-leading-probe': { renderer: () => ({ plan: leadingWrapPlan }) },
  };
  const TRAILING_REGISTRY: TransitionRegistry = {
    'single-mount-edge-wrap-trailing-probe': { renderer: () => ({ plan: trailingWrapPlan }) },
  };

  it('leading edge: the materialised `from` plate (the reel-edge side) mounts inside Wrap, active while its window is live', () => {
    expect.hasAssertions();
    const items: VideoItem[] = [
      clip('solo', 0, 3000, { transitionIn: { kind: 'single-mount-edge-wrap-leading-probe', frames: IDENTITY_FRAMES } }),
    ];
    const opts = { brandKinds: new Set(Object.keys(LEADING_REGISTRY)) };
    const layout = computeVideoLayout(items, IDENTITY_FPS, opts);
    const window = { start: layout[0].seqFrom, frames: layout[0].inFrames };

    clock.preview = true;
    clock.frame = window.start + Math.floor(window.frames / 2); // mid-window
    const { container } = render(identityTree(items, LEADING_REGISTRY));
    const markers = instancesOf(container, 'wrap-marker');
    expect(markers.length).toBe(1);
    expect(markers[0].getAttribute('data-active')).toBe('true');
  });

  it('trailing edge: the materialised `to` plate (the reel-edge side) mounts inside Wrap, active while its window is live', () => {
    expect.hasAssertions();
    const items: VideoItem[] = [
      clip('solo', 0, 3000, { transitionOut: { kind: 'single-mount-edge-wrap-trailing-probe', frames: IDENTITY_FRAMES } }),
    ];
    const opts = { brandKinds: new Set(Object.keys(TRAILING_REGISTRY)) };
    const layout = computeVideoLayout(items, IDENTITY_FPS, opts);
    const window = {
      start: layout[0].seqFrom + layout[0].seqDuration - layout[0].outFrames,
      frames: layout[0].outFrames,
    };

    clock.preview = true;
    clock.frame = window.start + Math.floor(window.frames / 2); // mid-window
    const { container } = render(identityTree(items, TRAILING_REGISTRY));
    const markers = instancesOf(container, 'wrap-marker');
    expect(markers.length).toBe(1);
    expect(markers[0].getAttribute('data-active')).toBe('true');
  });

  // A leading edge's window starts at composition frame 0 (the reel's own
  // start), so there is no "before the window opens" frame to observe at
  // all — this checks the other direction, AFTER the window closes, which is
  // reachable (the item's own life continues well past it).
  it('the leading plate does not exist at all after its window closes — confirms there is no active=false state to observe', () => {
    expect.hasAssertions();
    const items: VideoItem[] = [
      clip('solo', 0, 3000, { transitionIn: { kind: 'single-mount-edge-wrap-leading-probe', frames: IDENTITY_FRAMES } }),
    ];
    const opts = { brandKinds: new Set(Object.keys(LEADING_REGISTRY)) };
    const layout = computeVideoLayout(items, IDENTITY_FPS, opts);
    const window = { start: layout[0].seqFrom, frames: layout[0].inFrames };
    expect(window.start).toBe(0); // confirms the "before" direction is unreachable, as claimed above

    clock.preview = true;
    clock.frame = window.start + window.frames + 1; // one past the window's close
    const { container } = render(identityTree(items, LEADING_REGISTRY));
    expect(instancesOf(container, 'wrap-marker').length).toBe(0);
  });

  // The trailing edge's window does NOT start at frame 0, so this checks the
  // direction the leading test above cannot: BEFORE the window opens.
  it('the trailing plate does not exist at all before its window opens — confirms there is no active=false state to observe', () => {
    expect.hasAssertions();
    const items: VideoItem[] = [
      clip('solo', 0, 3000, { transitionOut: { kind: 'single-mount-edge-wrap-trailing-probe', frames: IDENTITY_FRAMES } }),
    ];
    const opts = { brandKinds: new Set(Object.keys(TRAILING_REGISTRY)) };
    const layout = computeVideoLayout(items, IDENTITY_FPS, opts);
    const window = {
      start: layout[0].seqFrom + layout[0].seqDuration - layout[0].outFrames,
      frames: layout[0].outFrames,
    };
    expect(window.start).toBeGreaterThan(0);

    clock.preview = true;
    clock.frame = window.start - 1; // one frame before the window opens
    const { container } = render(identityTree(items, TRAILING_REGISTRY));
    expect(instancesOf(container, 'wrap-marker').length).toBe(0);
  });
});
