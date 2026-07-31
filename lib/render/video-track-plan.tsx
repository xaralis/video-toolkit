// THE SINGLE-MOUNT ASSEMBLY (Phase 5 Task 1.2) — the machinery a `plan`-arm
// `TransitionNode` is driven through.
//
// The difference from the `composite` arm in one sentence: a `composite` node
// RECEIVES its two inputs as subtrees and instantiates them (so an input that
// outlives the boundary window exists TWICE — once in its own Sequence and once
// inside the node, which is the remount this phase removes), whereas a `plan`
// node RETURNS A DESCRIPTION that core applies to the mounts that already
// exist. Nothing is ever relocated in the tree, so nothing ever remounts.
//
// WHAT LIVES HERE
//
//   VideoTrackHost   the always-mounted track wrapper. Evaluates every LIVE
//                    plan boundary's `plan()` ONCE per frame and publishes the
//                    results through a context, so a boundary is not re-planned
//                    once per consumer. Carries `isolation` and the live
//                    boundary's `post`.
//   LayerShell       one of the two shells around every video item (and around
//                    a materialised EdgePlate). Reads its side's `LayerOp` off
//                    the context and applies it as STYLE. Always mounted,
//                    structurally constant.
//   PlateHost        the media-free `PlateLayer[]` of one boundary, emitted as
//                    a timeline sibling.
//
// WHY ONE CONTEXT RATHER THAN CALLING `plan()` IN EACH CONSUMER. The two shells
// of one boundary sit in two DIFFERENT item Sequences and its plates in a
// third; each would otherwise invoke `plan()` itself, three-plus times per
// frame, and — worse — each would have to re-derive the boundary-relative frame
// from ITS OWN Sequence's time base. Evaluating once at the track level and
// publishing the result makes the boundary's progress a single number computed
// in a single coordinate system, which is exactly the property Task 1.3 bought
// at the `composite` arm ("ONE call per boundary, both sides, one progress").
//
// THE AUDIT TRAVELS WITH THE RENDERER (docs/superpowers/HANDOFF.md, "Task 6.3's
// design invariant"). Both dev warnings this module owns — a `ghosts` count
// that varies with progress, and a second live boundary setting `post` — are
// computed in `VideoTrackHost`, i.e. in the SAME component whose output the
// shells and plates consume, from the SAME composite object. They cannot go
// blind because a conditional was inserted between the audit and the thing it
// audits: there is no "between".
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { warnOnce, isDevEnvironment } from './warn-once';
import type { TransitionComposite, TransitionPlanProps, LayerOp, PlateLayer } from '../theming/transitions';

/** Everything the assembly needs to drive ONE plan-arm boundary. Built by
 *  `buildVideoNodes`; the components below never resolve a node themselves. */
export interface PlanBoundary {
  /** Stable per boundary — the same key `buildVideoNodes` gives its Sequences. */
  key: string;
  /** First frame of the window, in the coordinate system `buildVideoNodes`'
   *  own Sequences use (composition frames for the ordinary call site). */
  start: number;
  /** Window length. The window is INCLUSIVE of `start + frames`, the
   *  progress-1 frame — the same `+1` the `composite` arm spells
   *  `BOUNDARY_TAIL`. */
  frames: number;
  plan: (props: TransitionPlanProps) => TransitionComposite;
  /** Everything in `TransitionPlanProps` that does not depend on the frame. */
  props: Omit<TransitionPlanProps, 'progress' | 'frame'>;
  /** PHASE 5 TASK 1.4 — sampled ONCE by `buildVideoNodes` (`wrapFor`,
   *  `video-track.tsx`), not read from the live per-frame composite: this is
   *  what lets `LayerShell` know a side declares a `wrap` OUTSIDE the window
   *  too, where nothing ever calls `plan()`. See `LayerShell`'s doc comment
   *  for how this combines with the live composite's own `op.wrap`. */
  wrap: { from?: LayerOp['wrap']; to?: LayerOp['wrap'] };
}

/** The live boundaries' composites for THIS frame, keyed by boundary key.
 *  Empty outside every window — which is the same object every time, so a
 *  consumer that reads nothing re-renders with an unchanged context value. */
const EMPTY_COMPOSITES: ReadonlyMap<string, TransitionComposite> = new Map();
const PlanCompositesContext = React.createContext<ReadonlyMap<string, TransitionComposite>>(EMPTY_COMPOSITES);

/** PHASE 5 TASK 1.4 — the STRUCTURAL half of `wrap`, published separately
 *  from the live per-frame composites above. Keyed the same way
 *  (`PlanBoundary.key`), but its values are the ONE-TIME samples
 *  `buildVideoNodes` computed (`wrapFor`) for EVERY boundary, whether or not
 *  it is live THIS frame — which is the whole and only reason this is a
 *  second context rather than a field squeezed onto the first:
 *  `PlanCompositesContext` is deliberately populated for LIVE boundaries
 *  only (that emptiness outside every window is what `EMPTY_COMPOSITES`
 *  exists to spell cheaply), and a map that must answer for boundaries
 *  outside their window too cannot share that population rule.
 *
 *  NOT reference-stable across renders once any boundary is planned (see
 *  `VideoTrackHost` below: a fresh `Map` is built from `boundaries` on every
 *  call when `boundaries.length > 0`) — fixed round 1 correction: an earlier
 *  version of this comment implied `EMPTY_COMPOSITES`'s stability property
 *  extended here too; it does not, and does not need to. `VideoTrackHost`
 *  itself re-renders every frame (`useCurrentFrame`), so every consumer
 *  under it already re-renders regardless of this Provider's value
 *  identity — nothing in this module relies on `React.memo` or a stable
 *  Context value to skip work, so a fresh `Map` costs one allocation per
 *  plan boundary per frame and nothing more. `EMPTY_WRAPS` exists only to
 *  skip that allocation on the (today, universal) case of zero plan
 *  boundaries, not to provide a memoization guarantee. */
const EMPTY_WRAPS: ReadonlyMap<string, PlanBoundary['wrap']> = new Map();
const PlanWrapContext = React.createContext<ReadonlyMap<string, PlanBoundary['wrap']>>(EMPTY_WRAPS);

/** THE STACKING RULE.
 *
 *  The DEFAULT — `to` over `from` — needs no `z-index` at all, and deliberately
 *  does not have one: `buildVideoNodes` already emits the two items in timeline
 *  order, and two `position:absolute` siblings with `z-index: auto` paint in
 *  TREE order. So the incoming clip is over the outgoing one for every boundary
 *  simultaneously, which is exactly what an explicit ladder could NOT express —
 *  an interior item is the `to` of the boundary before it and the `from` of the
 *  boundary after it, and one element has one position in one stack. (An
 *  earlier draft of this module gave each side a fixed rung and had to be
 *  thrown away for precisely that reason. Recorded so it is not rediscovered.)
 *
 *  `LayerOp.z` is therefore an OVERRIDE, applied as a raw `z-index` on that
 *  side's shell, for the rare node that wants the outgoing clip on top. Any
 *  positive value beats the default (which is `auto`).
 *
 *  Plates use the same mechanism: `between` is placed by TREE POSITION (its
 *  Sequence is emitted between the two item Sequences), and only `under` /
 *  `over` need a `z-index`, because "beneath everything" and "above everything"
 *  are not reachable by tree position from a single insertion point. */
export const PLATE_UNDER_Z = -1;
export const PLATE_OVER_Z = 1;

const PLATE_Z: Record<PlateLayer['z'], number | undefined> = {
  under: PLATE_UNDER_Z,
  between: undefined,
  over: PLATE_OVER_Z,
};

/** The probe progresses the `ghosts`-count audit samples. Endpoints plus the
 *  quarters: a plan whose ghost count changes AT ALL across a window
 *  essentially always changes it at one of these (a count is an integer
 *  computed from `progress`, so it changes on a threshold, and a threshold that
 *  falls strictly between two adjacent probes AND is crossed back before the
 *  next one is a pathological shape nobody writes). Sampling is what makes the
 *  warning fire on the FIRST live frame in EVERY environment, rather than
 *  needing two frames and a ref — a ref-based observer would be silent in
 *  `renderStill`, where the component may not persist across frames at all. */
const GHOST_PROBE_PROGRESS = [0, 0.25, 0.5, 0.75, 1] as const;

/** Only `filter` and `transform` are read off `post`. The slot exists so a node
 *  can treat the COMPOSITE of both inputs (the `screen(offset(A ⊕ B))` shape
 *  `scanline-glitch` needs), and those are the two properties that do that
 *  without moving the track: an `opacity` or a `mixBlendMode` here would blend
 *  the whole video track against the layers beneath it, which is a reel-level
 *  change no boundary is entitled to make. A node that supplies anything else
 *  has it ignored, silently and by design — this is a narrow slot, not an
 *  escape hatch. */
const POST_KEYS = ['filter', 'transform'] as const;

function pickPost(post: React.CSSProperties): React.CSSProperties {
  const out: React.CSSProperties = {};
  for (const k of POST_KEYS) if (post[k] !== undefined) out[k] = post[k];
  return out;
}

/** Progress across a boundary, clamped — the SAME arithmetic (and the same
 *  clamp, for the same reason) as `AtCutTransition`'s: a node must never clamp,
 *  and several presentations rely on never seeing a value outside [0,1]. */
export function planProgress(local: number, frames: number): number {
  return frames > 0 ? Math.max(0, Math.min(1, local / frames)) : 1;
}

function ghostCount(op: LayerOp | undefined): number {
  return op?.ghosts?.length ?? 0;
}

/** DEV WARNING — `ghosts.length` must not vary with `progress`.
 *
 *  A ghost is an extra MOUNT of the clip, so a count that changes mid-window is
 *  an element-count change mid-window: the exact remount this phase exists to
 *  remove, reintroduced by a node instead of by the assembly. Warned, never
 *  blocked (this module's whole warning discipline — see warn-once.ts).
 *
 *  WHAT IS AND IS NOT DETERMINISTIC HERE (review round 1, Important 4 — an
 *  earlier version of this comment claimed the live frame's count was excluded
 *  and that the whole check was frame-independent; the code has always included
 *  it, so the claim was simply false). The two properties, separated:
 *
 *    - The PROBE SAMPLES are compared to each other, and they are the same five
 *      calls on every frame. So if a plan's ghost count varies across the
 *      window at all visibly, this fires on the FIRST live frame, whichever
 *      frame that is. That is the deterministic part, and it is the guarantee.
 *    - The LIVE frame's count is included as a SIXTH sample deliberately, kept
 *      after the review rather than dropped: it is the only thing that can
 *      catch a count that changes at a threshold falling strictly between two
 *      probes. The cost is that the `saw …` list — and, for that
 *      pathological-threshold case alone, WHETHER it fires — depends on which
 *      frame rendered. That is a strictly-more-sensitive check with a
 *      frame-dependent message, not a flaky one: it never fires on a plan whose
 *      count is constant, which is the only false positive that would matter
 *      (`warnOnce` keys are permanent per session). */
function auditGhosts(b: PlanBoundary, live: TransitionComposite): void {
  if (!isDevEnvironment()) return;
  const samples = GHOST_PROBE_PROGRESS.map((p) => {
    const frame = Math.round(p * b.frames);
    return b.plan({ ...b.props, progress: p, frame });
  });
  for (const side of ['from', 'to'] as const) {
    const counts = [ghostCount(live[side]), ...samples.map((s) => ghostCount(s[side]))];
    const first = counts[0];
    if (counts.every((c) => c === first)) continue;
    warnOnce(`video-track:ghosts-vary:${b.key}:${side}`, () =>
      `[video-toolkit] The transition at boundary "${b.key}" returns a different number of \`${side}.ghosts\` ` +
      `at different progress values (saw ${[...new Set(counts)].sort((x, y) => x - y).join(', ')}). ` +
      'Each ghost is an extra MOUNT of the clip, so a varying count destroys and recreates media elements ' +
      'mid-transition — the remount the single-mount contract exists to remove. Return a CONSTANT number of ' +
      'ghosts and vary their STYLE instead (an unwanted ghost is one with `opacity: 0`). ' +
      '(Warning only; nothing is blocked, and this is reported once per boundary per side.)');
  }
}

/** The always-mounted video-track wrapper. `buildVideoNodes` returns exactly
 *  one of these, holding every item Sequence, every boundary Sequence and every
 *  plate.
 *
 *  `isolation: 'isolate'` — CONDITIONAL ON THE TRACK CONTAINING A PLAN
 *  BOUNDARY, and the deviation from the design's "unconditional" is measured,
 *  not assumed. See `buildVideoNodes`' `isolate` argument for the measurement
 *  and the reasoning; the property the design actually argues for (no
 *  divergence between in-window and out-of-window FRAMES) is preserved exactly,
 *  because this flag is derived from the reel's CONFIG and is therefore
 *  constant across every frame of a given composition. */
export const VideoTrackHost: React.FC<{
  boundaries: readonly PlanBoundary[];
  isolate: boolean;
  children: React.ReactNode;
}> = ({ boundaries, isolate, children }) => {
  const frame = useCurrentFrame();

  // PHASE 5 TASK 1.4 — the wrap map is STRUCTURAL, not per-frame: built from
  // every boundary regardless of whether it is live THIS frame, which is the
  // whole point (`LayerShell` needs an answer for the frames outside every
  // window too). Rebuilt every render — `boundaries` is a fresh array from
  // `buildVideoNodes` on every call — but that is cheap (one map insertion
  // per plan boundary) next to the JSX tree construction already happening
  // at the same cadence.
  const wraps = boundaries.length === 0
    ? EMPTY_WRAPS
    : new Map(boundaries.map((b) => [b.key, b.wrap] as const));

  let composites: Map<string, TransitionComposite> | null = null;
  let post: React.CSSProperties | undefined;
  let postFrom: string | undefined;

  for (const b of boundaries) {
    const local = frame - b.start;
    // INCLUSIVE of `b.frames` — the progress-1 frame is a real frame something
    // has to draw, the same reason the `composite` arm's boundary Sequence is
    // `frames + BOUNDARY_TAIL` long.
    if (local < 0 || local > b.frames) continue;
    const composite = b.plan({ ...b.props, progress: planProgress(local, b.frames), frame: local });
    (composites ??= new Map()).set(b.key, composite);
    auditGhosts(b, composite);
    if (composite.post) {
      // DEV WARNING — at most one live boundary may set `post`. Two overlapping
      // windows both filtering the whole track is not a picture anybody
      // authored, and overlapping boundaries are already a warned pathology
      // (`video-track.tsx`'s overlapping-boundaries diagnostic). The LATER one
      // wins, stated out loud rather than left to object-spread order.
      if (postFrom !== undefined) {
        warnOnce(`video-track:post-conflict:${postFrom}+${b.key}`, () =>
          `[video-toolkit] Two live transitions ("${postFrom}" and "${b.key}") both set \`post\` on the same ` +
          'frame, and `post` applies to the WHOLE video track — so only one can. "' + b.key + '" wins. This ' +
          'means two transition windows overlap; shorten a transition or lengthen the clip between them. ' +
          '(Warning only; nothing is blocked, and this is reported once per colliding pair.)');
      }
      post = pickPost(composite.post);
      postFrom = b.key;
    }
  }

  const style: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    ...(isolate ? { isolation: 'isolate' as const } : {}),
    ...(post ?? {}),
  };

  return (
    <div style={style}>
      <PlanWrapContext.Provider value={wraps}>
        <PlanCompositesContext.Provider value={composites ?? EMPTY_COMPOSITES}>
          {children}
        </PlanCompositesContext.Provider>
      </PlanWrapContext.Provider>
    </div>
  );
};

/** ONE of the two shells around a video item — or around a materialised
 *  `EdgePlate`, which is the same component precisely so that a node's `from`/
 *  `to` op applies at a reel edge exactly as it does at an interior cut.
 *
 *  MOUNTED FOR THE ITEM'S WHOLE LIFE AND STRUCTURALLY CONSTANT. It is a `<div>`
 *  always: never a Fragment, never absent, never reordered. React reconciles by
 *  position AND TYPE, so a wrapper that switches between a `<div>` and a
 *  Fragment at one tree position is itself a type change and remounts its
 *  children — the same defect, relocated (`video-track.tsx:99-107` documents the
 *  identical mechanism from Task R1's side). What changes across a frame is the
 *  `style` object and nothing else.
 *
 *  `position:absolute; inset:0`, never a bare `undefined` style, for the reason
 *  `ItemBody`'s wrapper is: every renderer this repo and both brand repos ship
 *  roots its content at `AbsoluteFill`, so an unstyled `<div>` is layout-neutral
 *  TODAY — a property of the current renderers, not of this wrapper. A future
 *  renderer rooting at a static element with `height:100%` would collapse to
 *  zero height inside an unstyled div. Filling it explicitly removes the
 *  dependency.
 *
 *  NO `z-index` UNLESS THE NODE ASKS FOR ONE (see THE STACKING RULE above):
 *  the default order is tree order, so an inert shell — which today is every
 *  shell in every reel — adds no stacking context of its own.
 *
 *  THE `wrap` HAZARD, SOLVED HERE (Phase 5 Task 1.4; recorded but left open by
 *  Task 1.2's report). `wrap` is now mounted for the SAME item's-whole-life
 *  span this shell already is, never only while the boundary is live: the
 *  side's Wrap component (if the boundary declares one at all — see `Wrap`
 *  below) sits between this div and `children` on EVERY frame the shell is
 *  mounted, receiving `active: true` for the frames inside the window and
 *  `active: false` outside it. A `wrap` that must be inert outside the
 *  window renders `children` unchanged when `active` is false. This is what
 *  keeps the element type at `children`'s tree position constant across the
 *  window's edges — before Task 1.4, a `wrap` present only while live was a
 *  type change at BOTH edges (absent → present, present → absent), which
 *  remounted the clip: the exact defect class this phase removes, reached
 *  through the contract rather than the assembly.
 *
 *  ONE SOURCE FOR `Wrap`, NOT TWO (Task 1.4 fix round 1, Important 1). An
 *  earlier version of this line preferred the LIVE composite's own `op.wrap`
 *  while the boundary was live and fell back to the structural sample
 *  (`wraps.get(...)`) only outside it — on the theory that this let an
 *  in-window reference-instability bug stay visible to the identity ratchet.
 *  Measured, that branch bought NOTHING (deleting it left every test green)
 *  AND it was the sole cause of a real defect: at the window's OPENING edge,
 *  a node whose live `op.wrap` differs from what `wrapFor` sampled (a
 *  contract violation, but one worth being DEFINED about rather than merely
 *  disclaimed) flips the mounted element from the sample's type to the live
 *  one for exactly one frame — a real, if brief, remount, reachable only
 *  because two different sources could disagree. The structural sample
 *  ALONE already catches in-window instability just as well: `wrapFor` is
 *  deliberately uncached (see its own doc comment in `video-track.tsx`), so
 *  it re-samples the plan on every `buildVideoNodes` call, live window or
 *  not — an unstable wrap produces a fresh reference through the sample too,
 *  every frame. See `video-track-remount.test.tsx`'s "a wrap that disagrees
 *  between the sample and a live call" proof — it asserts the half that
 *  matters going forward (no flicker under the shipped one-source code,
 *  same DOM reference before/at/after the window opens). The other half
 *  (the old two-source code DOES flicker on this exact fixture) is not
 *  re-provable by that same in-tree test, because the old code no longer
 *  exists to run; it was confirmed once, by manually reintroducing the
 *  deleted `op?.wrap ?? …` line and watching the test go red — see
 *  task-1.4-report.md's fix-round-1 mutation log for the exact command and
 *  output. */
export const LayerShell: React.FC<{
  /** The plan boundary this shell's side belongs to, or `null` when this item
   *  has no plan boundary on this side — the inert case, which is every item
   *  in the repo today. */
  boundaryKey: string | null;
  side: 'from' | 'to';
  children: React.ReactNode;
}> = ({ boundaryKey, side, children }) => {
  const composites = React.useContext(PlanCompositesContext);
  const wraps = React.useContext(PlanWrapContext);
  const op = boundaryKey === null ? undefined : composites.get(boundaryKey)?.[side];
  // `active` — the boundary is LIVE this frame, independent of whether this
  // particular SIDE's op happens to be present (a plan that sets only `to`
  // on some live frame still has its boundary live for `from`'s purposes).
  const active = boundaryKey !== null && composites.has(boundaryKey);

  const style: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    ...(op?.style ?? {}),
    // AFTER `op.style` deliberately: `z` is the contract's own stacking field
    // and must win over a `zIndex` that leaked into `style`.
    ...(op?.z === undefined ? {} : { zIndex: op.z }),
  };

  // WRAP — ALWAYS the structural sample (`PlanBoundary.wrap`, `wrapFor` in
  // `video-track.tsx`), NEVER the live composite's own `op.wrap`. One source
  // only, on purpose (see the doc comment above): the live composite is
  // recomputed with the identical inputs `wrapFor` samples with, so a
  // compliant node's `op.wrap` and its sampled `wrap` are the same reference
  // by construction, and reading only the sample removes the two-source
  // disagreement that could otherwise flicker the element type for one
  // frame at the window's opening edge.
  const Wrap = boundaryKey === null ? undefined : wraps.get(boundaryKey)?.[side];
  return (
    <div style={style}>
      {Wrap ? <Wrap active={active}>{children}</Wrap> : children}
      {/* Ghosts are appended AFTER the real child, never before it: an
          appearing or disappearing ghost must not shift the child's tree
          position, or the child remounts and the extra mount costs the very
          thing it was added to avoid. */}
      {op?.ghosts?.map((ghost, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={`ghost-${i}`} style={{ position: 'absolute', inset: 0, ...ghost }}>
          {children}
        </div>
      ))}
    </div>
  );
};

/** One boundary's media-free plates, as a timeline sibling of the two item
 *  Sequences. Media-free is what makes their count safe to vary with progress:
 *  there is no `<video>` under a plate to destroy, and each carries the node's
 *  own `key`. */
export const PlateHost: React.FC<{ boundaryKey: string }> = ({ boundaryKey }) => {
  const composites = React.useContext(PlanCompositesContext);
  const layers = composites.get(boundaryKey)?.layers;
  if (!layers || layers.length === 0) return null;
  return (
    <>
      {layers.map((layer) => (
        <div
          key={layer.key}
          style={{
            position: 'absolute',
            inset: 0,
            ...(PLATE_Z[layer.z] === undefined ? {} : { zIndex: PLATE_Z[layer.z] }),
            ...layer.style,
          }}
        >
          {layer.content}
        </div>
      ))}
    </>
  );
};
