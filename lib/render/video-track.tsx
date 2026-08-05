// The shared at-the-cut VIDEO TRACK assembly — originally lifted verbatim (see
// lib/render/README.md) from campaign-reels' LayeredCampaignReel.tsx
// `videoNodes` map so every brand consumes one copy of the handle-borrow
// math that makes real cross-transitions render. The pure layout math lives in
// ./video-track-layout (no Remotion import there, so it can be unit-tested in
// core — same split as ./transition-record / ./at-cut-transitions); this
// module adds the JSX assembly (buildVideoNodes) and re-exports the pure
// function so consumers can import everything from one path.
//
// PHASE 5 TASK 5 — THE FLIP, ONCE. SINGLE MOUNT, NO SECOND ARM.
//
// Every boundary this file ever builds a `PlanBoundary` for is applied to the
// mounts that already exist — the two shells every item is wrapped in
// (`LayerShell`, `./video-track-plan.tsx`) — through the boundary's node.
// Nothing is ever relocated in the tree, so nothing ever remounts.
//
// WHAT USED TO BE HERE, AND WHY IT IS GONE (docs/superpowers/
// phase5-single-mount-design.md §7 Stage 5; full account in
// `.superpowers/sdd/phase5-single-mount-design/task-5-report.md`). Before this
// task, a boundary whose node exposed only `.composite` (Task 1.3's original
// shape) took a SEPARATE route: a boundary `<Sequence>` spanning the
// transition window, holding one node that received BOTH clips RE-BASED into
// its own coordinate system (`rebased()`) — copies distinct from each item's
// own Sequence, which was BLANKED (`ItemBody`) for the frames the boundary had
// taken over, so the clip was not drawn twice. That is what produced the
// remount this whole phase exists to remove: React reconciles by tree
// POSITION, and content rendered inside the boundary for some frames and under
// its own Sequence for the rest is two mounts, not one moved mount. Stages
// 0-4 migrated every catalog kind off that path onto `plan`; this task deletes
// the path itself now that nothing resolves to it any more
// (`TransitionNode` no longer HAS a `.composite` arm —
// `lib/theming/transitions.ts`). A boundary whose kind resolves to no node at
// all (an unrecognised brand kind, warned elsewhere) simply contributes
// nothing here: the items either side draw straight through, which is the
// same picture a hard cut always was.
import React from 'react';
import { Sequence } from 'remotion';
import { transitionNodeFor } from './at-cut-transitions';
import { computeVideoLayout, type VideoLayoutEntry } from './video-track-layout';
import { warnOnce } from './warn-once';
import { ITEM_PREMOUNT_SECONDS } from './media-sync';
import { VideoTrackHost, LayerShell, PlateHost, type PlanBoundary } from './video-track-plan';
import { EdgePlate } from '../transitions/edge-plate';
import { registrationConfig } from '../theming/registry';
import type { AccentSlot } from '../theming/palette';
import type { LayerHandle, TransitionNode, TransitionRegistry } from '../theming/transitions';
import type { VideoItem } from '../reel-config-base/layered-schema';

export { computeVideoLayout, type VideoLayoutEntry };

/** A frame range, INCLUSIVE at both ends, in the coordinates of whatever
 *  Sequence the consumer is mounted in. Inclusive because a boundary owns its
 *  progress-1 frame too (see BOUNDARY_TAIL below). */
type Range = readonly [number, number];

/** The boundary window (and every plan Sequence emitted for it) is
 *  `frames + 1` long, not `frames`.
 *
 *  The transition's progress runs 0..1 INCLUSIVE, and progress 1 is a real
 *  frame something has to draw — `VideoTrackHost` still evaluates the plan at
 *  local frame `b.frames` (design §1.2), so the Sequences carrying its plates
 *  and edge plates have to still be MOUNTED there. It costs nothing at the
 *  other end of a cut, because the outgoing clip's own Sequence has already
 *  ended by then. */
const BOUNDARY_TAIL = 1;

/** One boundary between two clips (or between a clip and the edge of the reel). */
interface Boundary {
  key: string;
  /** The item whose Sequence this boundary is emitted next to. */
  owner: number;
  /** First frame of the transition, in composition coordinates. */
  start: number;
  frames: number;
  /** Index of the outgoing item, or null at the reel's leading edge. */
  fromIndex: number | null;
  /** Index of the incoming item, or null at the reel's trailing edge. */
  toIndex: number | null;
  record: NonNullable<VideoLayoutEntry['inRecord']>;
}

// The JSX assembly — one <Sequence> per video-track item plus one per boundary.
// Skips items whose seqDuration <= 0 (they contribute nothing), matching
// LayeredCampaignReel.tsx's `if (normalDuration <= 0) return null` guard.
export function buildVideoNodes(
  items: VideoItem[],
  opts: {
    renderItem: (item: VideoItem, handles: { inHalf: number; outHalf: number }) => React.ReactNode;
    width: number;
    height: number;
    fps: number;
    /** The brand's accent palette, forwarded to presentations that take a
     *  colour by KEY rather than by hex — today `fade-to-color` and `wipe`,
     *  the catalog's only two `AccentOrColorHex` fields (`ACCENT_OR_COLOR_FIELDS`
     *  in `../reel-config-base/transition-schema.ts`; re-derive with
     *  `grep -n AccentOrColorHex` there if this list has grown).
     *
     *  REQUIRED — the key must be present, so omitting it is a compile error
     *  (`TS2741`), not a silent runtime fallback. It may still be explicitly
     *  `undefined` for a caller that genuinely has no brand palette in scope;
     *  what the type rules out is FORGETTING to thread it, which is what
     *  actually shipped: every accent-KEYED transition param on this call
     *  resolves to `null` without it, on EVERY boundary, silently.
     *  "Silently" is asymmetric between the two kinds — `fade-to-color` warns
     *  once per unresolved key (`at-cut-transitions.tsx`,
     *  `resolveAccentColorOrWarn`); `wipe` warns too, via the same helper, but
     *  its fallback is a rendered picture (a black sweep), not an absent one,
     *  so the warning is the only signal at all. That warning is a runtime
     *  last line of defence — it stays, because a hand-edited `Root.tsx` is
     *  not type-checked at render time — but it is not the first line
     *  anymore. This is not a hypothetical: an unthreaded `palette` at 11
     *  real call sites is exactly what shipped a `fade-to-color` that
     *  rendered a plain crossfade instead of the brand's dip, undetected
     *  until it was measured with three renders. */
    palette: readonly AccentSlot[] | undefined;
    /** The brand's transition registry (`BrandTheme.transitions`), threaded the
     *  same narrow way `palette` is — one typed field, not the whole theme.
     *  Absent → core's generic presentations are the only tier, exactly as
     *  before the axis existed. */
    transitions?: TransitionRegistry;
    /** `CompositionTheme.background`, threaded the same narrow way `palette`
     *  is. It is what a transition at the reel's LEADING or TRAILING edge
     *  resolves its missing input to (Phase 4 Task 2.2) — the trailing-edge
     *  fade this file's layout comment has always claimed. Absent → the edge
     *  paints nothing, which is the pre-2.2 pixel. */
    background?: string;
  },
): React.ReactNode[] {
  // The registry's KEYS are also the set of kinds the unrecognised-kind warning
  // must stay quiet about. A Set because `declaredByBrand` reads it once per
  // rendered frame per boundary and takes the allocation-free path for one.
  const brandKinds = opts.transitions ? new Set(Object.keys(opts.transitions)) : undefined;
  const layout = computeVideoLayout(items, opts.fps, { brandKinds });
  const dims = { width: opts.width, height: opts.height, palette: opts.palette, transitions: opts.transitions };

  const drawn = (i: number) => i >= 0 && i < items.length && layout[i].seqDuration > 0;
  const content = (i: number) =>
    opts.renderItem(items[i], { inHalf: layout[i].inHalf, outHalf: layout[i].outHalf });

  // ---- which boundaries exist, and who is on each side of them --------------
  //
  // A boundary is owned by the item ENTERING it, which is the ownership
  // `computeVideoLayout` already encodes: the first item's `inRecord` is its own
  // `transitionIn`, every other item's is its PREDECESSOR's `transitionOut`. So
  // one authored transition produces exactly one boundary, never two halves.
  // The one case the entering item cannot own is the reel's TRAILING edge —
  // there is no successor to own it — so the last drawn item owns that itself,
  // with `to === null`.
  const boundaries: Boundary[] = [];
  layout.forEach((entry, i) => {
    if (!drawn(i)) return;
    if (entry.inRecord && entry.inFrames > 0) {
      boundaries.push({
        key: `${items[i].id}--in`,
        owner: i,
        start: entry.seqFrom,
        frames: entry.inFrames,
        fromIndex: drawn(i - 1) ? i - 1 : null,
        toIndex: i,
        record: entry.inRecord,
      });
    }
    if (entry.outRecord && entry.outFrames > 0 && !drawn(i + 1)) {
      boundaries.push({
        key: `${items[i].id}--out`,
        owner: i,
        start: entry.seqFrom + entry.seqDuration - entry.outFrames,
        frames: entry.outFrames,
        fromIndex: i,
        toIndex: null,
        record: entry.outRecord,
      });
    }
  });

  // ---- resolve each boundary's node, once ------------------------------------
  //
  // `transitionNodeFor` is memoized (see its docblock), so this receives the
  // exact same node reference across renders when a boundary's authored
  // config is unchanged — no new element type, no remount.
  //
  // A boundary whose kind resolves to NO node (an unrecognised brand kind,
  // already warned by `resolveTransition`) contributes nothing further: no
  // `PlanBoundary`, no shell styling, no plates. The items either side just
  // draw through their own Sequences uninterrupted — the same picture a hard
  // cut always was, since `computeVideoLayout`'s handle-borrowing overlap
  // does not depend on a boundary rendering anything.
  // `ITEM_PREMOUNT_SECONDS` — how early an item's own Sequence mounts, hidden,
  // so its media is loaded and seeked by the frame it has to paint — is now a
  // shared rule in ./media-sync (imported above), not a video-track-private
  // constant; the audio track premounts the same way and for the same
  // reason. See that file's comment for the full mechanism and why it matters
  // differently on each track.
  const planned = new Map<string, PlanBoundary>();
  for (const b of boundaries) {
    const node: TransitionNode | null = transitionNodeFor(b.record, dims);
    if (!node) continue;
    const props: PlanBoundary['props'] = {
      from: handleFor(b.fromIndex, b, layout),
      to: handleFor(b.toIndex, b, layout),
      durationInFrames: b.frames,
      // The whole authored record (`kind`, `frames` and the kind's own
      // params) — the same object a registry renderer already receives as
      // `TransitionRenderProps.transition`. A plan closes over nothing at
      // resolution time, so this is where its params reach it.
      params: b.record as unknown as Record<string, unknown>,
      config: registrationConfig(opts.transitions, b.record.kind),
      dims: { width: opts.width, height: opts.height, fps: opts.fps },
      palette: opts.palette ?? [],
      background: opts.background ?? 'transparent',
    };
    planned.set(b.key, {
      key: b.key,
      start: b.start,
      frames: b.frames,
      plan: node.plan,
      props,
      wrap: wrapFor(node.plan, props),
    });
  }
  const isPlanned = (b: Boundary) => planned.has(b.key);

  // OVERLAPPING BOUNDARIES — a clip shorter than its own in+out transition
  // windows is claimed by two boundaries at once, so a node styling it is
  // handed two different live ops on the same frames. This is a DIAGNOSTIC,
  // not a guard: it never changes what renders.
  //
  // Built over EVERY boundary in `boundaries`, whether or not its kind
  // resolved to a node — the pathology is about AUTHORED TIMING (two windows
  // overlapping a clip shorter than either), which exists independently of
  // whether anything ends up rendering for them.
  //
  // TASK 1.4 LOOKED AT IT AND LEFT IT A DIAGNOSTIC, deliberately. 1.3 expected
  // alignment to fix it in passing; it does not. Alignment moves a window
  // relative to the cut, but a window is still `frames` long whatever its
  // alignment, so "the transitions are longer than the clip" survives every
  // alignment (and `center` reaches it just as easily as `start` does — see the
  // alignment-aware case pinned in transition-alignment-render.test.tsx). The
  // only real fix is to SHORTEN a transition to fit its clip, which changes the
  // progress curve of every affected boundary — a render-changing policy
  // decision (shrink both? favour the earlier? refuse the config?) that belongs
  // with its own parity assessment and brand-migration note, not smuggled in
  // under a field whose acceptance criterion is byte-identical output.
  //
  // warnOnce because buildVideoNodes runs on every frame of every render (see
  // warn-once.ts), and the message is a thunk for the same reason.
  const claimed = new Map<number, Range[]>();
  const claim = (i: number | null, b: Boundary) => {
    if (i === null) return;
    const rel = b.start - layout[i].seqFrom;
    const list = claimed.get(i) ?? [];
    list.push([rel, rel + b.frames] as const);
    claimed.set(i, list);
  };
  for (const b of boundaries) {
    claim(b.fromIndex, b);
    claim(b.toIndex, b);
  }
  for (const [i, ranges] of claimed) {
    for (let a = 0; a < ranges.length; a += 1) {
      for (let b = a + 1; b < ranges.length; b += 1) {
        if (ranges[a][0] > ranges[b][1] || ranges[b][0] > ranges[a][1]) continue;
        const abs = (r: Range) => `[${r[0] + layout[i].seqFrom}, ${r[1] + layout[i].seqFrom}]`;
        warnOnce(`overlapping-boundaries:${items[i].id}`, () =>
          `[video-toolkit] Video item "${items[i].id}" is shorter than its own transitions: two boundaries ` +
          `claim overlapping frame windows ${abs(ranges[a])} and ${abs(ranges[b])} (composition frames), so the ` +
          'clip is composited twice where they meet and may show as a double image. Shorten the transitions or ' +
          'lengthen the clip. (Warning only; nothing is blocked, and this is reported once per item.)');
      }
    }
  }

  /** A plan boundary's plates and edge plates, as REAL TIMELINE SIBLINGS
   *  spanning the window plus its progress-1 frame.
   *
   *  Emitted BETWEEN the two item Sequences — after the `from` side, before the
   *  `to` side — which is what makes `z: 'between'` expressible with no
   *  `z-index` at all. `under` and `over` are not reachable by tree position
   *  from one insertion point and carry an explicit `z-index` instead (see THE
   *  STACKING RULE in ./video-track-plan.tsx). */
  const planSequence = (b: Boundary, suffix: string, body: React.ReactNode) => (
    <Sequence
      key={`${b.key}--${suffix}`}
      from={b.start}
      durationInFrames={b.frames + BOUNDARY_TAIL}
      layout="none"
    >
      {body}
    </Sequence>
  );
  const plates = (b: Boundary) => planSequence(b, 'plates', <PlateHost boundaryKey={b.key} />);
  /** The missing side of an edge boundary, materialised. The node's own
   *  `from`/`to` op is applied to it through the SAME shell an item gets, which
   *  is what lets a node written for two clips work unchanged at a reel edge —
   *  `edgeInput`'s idea (Phase 4 Task 2.2, since retired — see edge-plate.tsx),
   *  promoted from something the node instantiates to something the timeline
   *  holds. */
  const edge = (b: Boundary, side: 'from' | 'to') =>
    planSequence(
      b,
      `edge-${side}`,
      <LayerShell boundaryKey={b.key} side={side}>
        <EdgePlate background={opts.background ?? 'transparent'} />
      </LayerShell>,
    );

  const nodes: React.ReactNode[] = [];
  items.forEach((item, i) => {
    // A leading-edge plan boundary's materialised `from` plate belongs BELOW
    // the incoming clip, so it (and the boundary's plates) are emitted before
    // the item's own Sequence.
    for (const b of boundaries) {
      if (!isPlanned(b) || b.toIndex !== i || b.fromIndex !== null) continue;
      nodes.push(edge(b, 'from'), plates(b));
    }
    if (drawn(i)) {
      const entry = layout[i];
      // THE TWO SHELLS, nested in Remotion's own order — OUTER = exit (the
      // boundary AFTER this item, where the item is the `from`), INNER = enter
      // (the boundary BEFORE it, where it is the `to`). Mounted for the item's
      // whole life whether or not either boundary is live, and structurally
      // constant: they change `style` only. `boundaryKey === null` is the
      // inert case — a boundary with no live plan on this side, or none at
      // all.
      const exitOf = boundaries.find((b) => isPlanned(b) && b.fromIndex === i);
      const enterOf = boundaries.find((b) => isPlanned(b) && b.toIndex === i);
      nodes.push(
        <Sequence
          key={item.id}
          from={entry.seqFrom}
          durationInFrames={entry.seqDuration}
          premountFor={Math.min(entry.seqFrom, Math.round(opts.fps * ITEM_PREMOUNT_SECONDS))}
          name={item.id}
        >
          <LayerShell boundaryKey={exitOf?.key ?? null} side="from">
            <LayerShell boundaryKey={enterOf?.key ?? null} side="to">
              {content(i)}
            </LayerShell>
          </LayerShell>
        </Sequence>,
      );
    }
    // A plan boundary's plates sit after its `from` item; a trailing-edge one's
    // materialised `to` plate sits above that item, so it comes last.
    for (const b of boundaries) {
      if (!isPlanned(b) || b.fromIndex !== i) continue;
      nodes.push(plates(b));
      if (b.toIndex === null) nodes.push(edge(b, 'to'));
    }
  });

  // ONE always-mounted wrapper, in a SINGLE-ELEMENT ARRAY — the signature is
  // unchanged (`React.ReactNode[]`) because 12 hand-rolled call sites across
  // the two brand repos depend on it, and returning a bare element instead of
  // an array would break every one of them.
  return [
    <VideoTrackHost key="video-track" boundaries={[...planned.values()]} isolate={planned.size > 0}>
      {nodes}
    </VideoTrackHost>,
  ];
}

/** One side of a plan boundary, as the handle the node is told about.
 *
 *  `null` at the reel's LEADING (`from`) or TRAILING (`to`) edge — verbatim
 *  Phase 4 Task 2.2 semantics, unchanged by this phase. Core's ANSWER to a null
 *  side is what changed: instead of the node instantiating a background plate,
 *  core materialises one on the timeline and applies the node's op to it.
 *
 *  `range` is INCLUSIVE, in BOUNDARY coordinates, and is how a node sees that
 *  the outgoing clip expires before progress 1: at an interior cut the `from`
 *  item's own Sequence ends one frame before the window does (design §1.2), so
 *  its range is `[0, frames - 1]` while the `to` item's is `[0, frames]`.
 *
 *  THE `Math.max(0, …)` LOWER BOUND IS LOAD-BEARING, EVEN THOUGH ITS RESULT IS
 *  ALWAYS 0 (review round 2 observation, resolved by keeping it and saying
 *  why). Both facts are true at once and they are easy to confuse: the clamp
 *  never lets a DIFFERENT value through, because no boundary starts before the
 *  Sequence of either side (`b.start === entry.seqFrom` for the `to` side by
 *  construction, and strictly greater for the `from` side) — but the raw
 *  difference it clamps is NEGATIVE on every `from` side, deeply so (-80 in the
 *  interior-cut fixture). Delete the clamp and the node is told the outgoing
 *  clip's range begins 80 frames before the window. So this is a delivery line,
 *  not dead defensiveness, and it is already pinned: the mixed-reel test
 *  asserts `from` is `[0, 19]`, which is exactly the assertion that fails
 *  without it. No fixture can make the result non-zero without first changing
 *  boundary construction, which is why none was written. */
function handleFor(
  index: number | null,
  b: Boundary,
  layout: readonly VideoLayoutEntry[],
): LayerHandle | null {
  if (index === null) return null;
  const entry = layout[index];
  return {
    range: [
      Math.max(0, entry.seqFrom - b.start),
      Math.min(b.frames, entry.seqFrom + entry.seqDuration - 1 - b.start),
    ] as const,
  };
}

/** PHASE 5 TASK 1.4 — what makes `wrap` mountable for the item's WHOLE life
 *  (Finding 1's fix), not only while the boundary is live.
 *
 *  A plan is only ever CALLED WITH A LIVE, IN-RANGE FRAME while its boundary
 *  is live (`VideoTrackHost`'s own loop skips every out-of-window frame,
 *  never handing `plan()` a `frame` outside `[0, b.frames]`), so there is no
 *  live composite to read a `wrap` off outside the window — the exact frames
 *  a life-long mount needs an answer for. This samples the plan ONCE PER
 *  `buildVideoNodes` CALL, with `frame: -1` — deliberately OUT OF the live
 *  range, so this sample can never be confused with a genuine live
 *  evaluation (by a test, or by a node author reading its own inputs) — and
 *  hands `LayerShell` (`video-track-plan.tsx`) a per-side answer to "does
 *  this boundary declare a wrap at all" that is available before, during and
 *  after the window. `LayerShell` reads ONLY this sample now, never the live
 *  composite's own `op.wrap` (fix round 1, Important 1 — an earlier version
 *  preferred the live value while the boundary was live and fell back to
 *  this sample outside it; that second source was the sole cause of a real
 *  one-frame flicker at the window's opening edge when the two disagreed,
 *  and deleting it left every test green, so there is now exactly one
 *  source of truth for `Wrap`'s identity).
 *
 *  `{ progress: 0, frame: -1 }` IS AN INCONSISTENT PAIR — a state no LIVE
 *  call could ever produce (`planProgress` derives `progress` FROM `frame`;
 *  no in-range `frame` maps to a `progress` of exactly 0 except `frame: 0`
 *  itself). That is deliberate, not sloppy: it is what makes the sample
 *  unambiguously a SAMPLE, distinguishable from a live call by inspection
 *  (a test, or a node's own logging) rather than by convention. A compliant
 *  node — `wrap`'s own doc comment requires a reference stable across the
 *  item's whole life — does not care what `progress`/`frame` pair it is
 *  called with at all, so this costs nothing; a node whose `wrap` decision
 *  actually reads `frame` or `progress` is already violating the contract,
 *  and `LayerShell` now sourcing `Wrap` from THIS CALL ALONE (see above) is
 *  what turns that violation into a defined, tested outcome — see the
 *  "flicker" proof below — rather than a display of whichever of two
 *  disagreeing values a stale two-source implementation happened to prefer.
 *
 *  Deliberately UNCACHED, even though `buildVideoNodes` runs on every frame
 *  of every render and this therefore re-invokes `plan()` once per PLANNED
 *  boundary per frame, everywhere in the reel, not only near its own window.
 *  THIS IS NOW LOAD-BEARING, NOT MERELY CHEAP (fix round 1, Important 1):
 *  because `LayerShell` reads `Wrap` from this sample ALONE — there is no
 *  second, live-composite source anymore — an unstable wrap (a node
 *  returning a fresh component reference on different calls, violating the
 *  contract) is detectable ONLY because this function re-samples on every
 *  call and therefore returns a fresh reference too, every frame, live
 *  window or not. A future `WeakMap<TransitionNode, PlanBoundary['wrap']>`
 *  cache keyed on the resolved node — the obvious optimisation once a real
 *  kind exercises this path — would SILENTLY DISABLE that detection: the
 *  cache would freeze on the first sample and every later frame, live or
 *  not, would replay that one reference regardless of what the node
 *  actually returns on subsequent calls. A plan is required to be "pure and
 *  trivial" (Task 1.2 report §3.3), which is what makes leaving this
 *  uncached affordable; do not add that cache without also re-deriving
 *  whether `video-track-remount.test.tsx`'s unstable-wrap proof still goes
 *  red without it (it would not). */
function wrapFor(
  plan: NonNullable<TransitionNode['plan']>,
  props: PlanBoundary['props'],
): PlanBoundary['wrap'] {
  const sample = plan({ ...props, progress: 0, frame: -1 });
  return { from: sample.from?.wrap, to: sample.to?.wrap };
}
