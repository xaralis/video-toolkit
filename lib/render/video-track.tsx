// The shared at-the-cut VIDEO TRACK assembly — originally lifted verbatim (see
// lib/render/README.md) from campaign-reels' LayeredCampaignReel.tsx
// `videoNodes` map so every brand consumes one copy of the handle-borrow
// math that makes real cross-transitions render. The pure layout math lives in
// ./video-track-layout (no Remotion import there, so it can be unit-tested in
// core — same split as ./transition-record / ./at-cut-transitions); this
// module adds the JSX assembly (buildVideoNodes) and re-exports the pure
// function so consumers can import everything from one path.
//
// PHASE 4 TASK 1.3 — THE BOUNDARY IS NOW A THING, not two half-things.
// Before: one `<Sequence>` per item, wrapped in its own entering AND exiting
// presentation, and a cut was the accident of two sibling Sequences overlapping
// by the borrowed handles. A transition never saw the clip on the other side of
// it.
// Now: a boundary is its own `<Sequence>` spanning exactly the transition
// window, holding ONE node that receives BOTH clips and composites them itself.
// Each item's own Sequence still carries its content and its handles, but goes
// BLANK for the frames a boundary has taken over — otherwise the clip would be
// drawn twice, once plainly underneath and once inside the transition, and
// anything the transition draws with partial alpha would blend against the wrong
// thing.
//
// The two inputs are handed to the node RE-BASED: each is wrapped in a
// `layout="none"` Sequence carrying that item's own global range, so a clip
// inside a transition sees exactly the frame numbers it would have seen in its
// own Sequence — and a clip whose range has ENDED renders nothing, which is how
// the last frame of a cut still shows only the incoming clip.
//
// WHY THE RE-BASED COPIES CANNOT BE ELIMINATED (Task R2, recorded so the next
// reader does not re-derive it). React reconciles by POSITION, so an item whose
// content is rendered inside the boundary for some frames and under its own
// Sequence for the rest has two instances, not one moved instance — that is the
// remount Task R1 mitigated. The obvious wish is "mount each item's media once
// and let the boundary composite the mount that already exists". It is not
// reachable, and the obstruction is the node CONTRACT, not this file:
//
//   1. A `TransitionNode` RENDERS its two inputs — it receives them as
//      `React.ReactNode` children and decides where, and how many times, they
//      appear (`wipe` swaps `from`/`to` behind its sheet; `checkerboard` clips
//      `to` into gridSize² cells over an intact `from`). "Composite the mount
//      that already exists" would mean the node styles a subtree it does not
//      own, which cannot express either of those two. Giving that up is giving
//      up exactly what Task 1.3 bought.
//   2. A node is therefore mounted only for its window. It cannot be mounted
//      for an item's whole life instead: `checkerboard` at progress 1 renders
//      `to` 64 times, so an always-mounted node would cost 64 permanent copies
//      of every clip, and switching to a pass-through at progress 1 is itself a
//      tree-position change — i.e. the same remount, relocated.
//   3. An item is the `to` of the boundary before it and the `from` of the
//      boundary after it, so it cannot be a CHILD of the boundary that
//      composites it either: React gives a subtree one parent.
//
// So an input that outlives its boundary window is necessarily rendered in two
// places, and the floor is THREE media elements around an interior footage cut
// in preview: the boundary's two copies, plus the INCOMING clip's own copy
// (kept warm by Fix 1 because it is shown again the frame the window closes).
// The OUTGOING clip's own copy is the fourth, and it is pure waste — its blank
// window runs to the end of its Sequence, so it is never shown again. Task R2
// releases it; see `ItemBody`'s `drawnThrough`.
//
// PHASE 5 TASK 1.2 — THE SECOND PATH, SELECTED PER BOUNDARY. Everything above
// describes the `composite` arm, which is UNCHANGED and is still what every
// kind in the catalog resolves to. A boundary whose node exposes `plan`
// instead takes a different route entirely: no boundary Sequence, no
// `rebased()` copies, no blanking — the node's two-sided description is applied
// to the mounts that already exist, through the two shells every item now
// carries (`./video-track-plan.tsx`). The two paths coexist per BOUNDARY, not
// per reel, which is what makes the staged migration shippable one kind at a
// time.
import React from 'react';
import { Sequence, useCurrentFrame } from 'remotion';
import { AtCutTransition, transitionNodeFor } from './at-cut-transitions';
import { computeVideoLayout, type VideoLayoutEntry } from './video-track-layout';
import { isPreviewEnvironment } from './preview-environment';
import { warnOnce } from './warn-once';
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

/** Renders `children` except on the frames a boundary has taken over. The
 *  frames are item-relative, so this must be mounted INSIDE the item's own
 *  Sequence.
 *
 *  TASK R1 — FIX 1, PREVIEW-GATED. Returning `null` on a blanked frame is a
 *  real React unmount of everything beneath it, and the boundary's re-based
 *  copy of the SAME content mounts fresh in a different position in the tree
 *  (see video-track.tsx's module docblock) — so crossing a boundary meant a
 *  footage `<video>` was destroyed and recreated. That is invisible at render
 *  time (frames are extracted independently of any DOM) but is a real
 *  re-fetch + re-seek — a background-colour flash and a stall — in the Player
 *  or Studio, so this branch is gated on `isPreviewEnvironment()`: outside
 *  preview, behaviour is BYTE-IDENTICAL to before this task (`return null`).
 *
 *  `display:none`, not `visibility:hidden`: nothing here needs to keep taking
 *  up space (this Sequence's `layout` is the default `absolute-fill`, so a
 *  visible sibling would have to fight a hidden one's box otherwise), and
 *  `OffthreadVideo`/`Video` seek to an explicit frame-derived time regardless
 *  of the element's own visibility — Remotion's own `premountFor` (Fix 2,
 *  below) hides a premounting Sequence with `display:none` for the identical
 *  reason (see `use-premounting.js`'s `hideWhilePremounted` default).
 *
 *  THE WRAPPER MUST BE STRUCTURALLY CONSTANT ACROSS THE BLANKED/DRAWN
 *  TOGGLE, not just present-while-blanked: React reconciles by position and
 *  TYPE, so switching between `<div>…</div>` (blanked) and a `<>…</>`
 *  Fragment (drawn) at the same tree position is ITSELF a type change and
 *  remounts `children` — exactly the defect this fix exists to remove, just
 *  moved to the OTHER edge of the blanked window. In preview the wrapper is
 *  therefore a `<div>` for the item's entire mounted life, toggling only its
 *  `style`; outside preview there is no wrapper at all, ever (byte-identical
 *  to pre-Task-R1).
 *
 *  WHEN DRAWN, THE WRAPPER IS `position:absolute; inset:0`, NOT a bare
 *  `undefined` style (Review Round 1, Minor 1). Every renderer this repo or
 *  either brand repo ships roots its content at `AbsoluteFill`/
 *  `position:absolute`, so an unstyled `<div>` is layout-neutral TODAY — but
 *  that is a property of the current renderers, not of this wrapper, and a
 *  future renderer rooting at a static/relative element with e.g.
 *  `height:100%` would silently collapse to zero height inside this div, in
 *  PREVIEW ONLY (outside preview there is no wrapper at all) — precisely the
 *  preview/render divergence this whole gate exists to avoid. Filling the
 *  wrapper explicitly removes that dependency on every current renderer's
 *  shape.
 *
 *  TASK R2 — `drawnThrough`: HIDING IS ONLY WORTH IT IF THE ITEM COMES BACK.
 *  Fix 1 keeps a blanked item's media alive so that when the boundary hands
 *  the frames back, the element is already warm. At the item's LAST boundary
 *  there are no frames to hand back: `computeVideoLayout` gives the outgoing
 *  side of a cut exactly `outHalf` frames of handle and the boundary claims
 *  all of them, so an item's final blank window runs to the end of its own
 *  Sequence (verified: a 3s clip with a 20-frame centred `fade` out has
 *  `seqDuration` 100 and a blank range of [80, 100] — see
 *  `video-track-remount.test.tsx`'s geometry). Keeping THAT copy mounted buys
 *  nothing and costs a second `<video>` decoding the same frames of the same
 *  file as the boundary's own copy, at the one moment in the reel when the
 *  decoder is busiest. `drawnThrough` is the item's last frame that is NOT
 *  claimed by any boundary (-1 if a boundary claims all of them), so a blanked
 *  frame past it is provably never followed by a drawn one and the media is
 *  released instead of hidden.
 *
 *  This is where the four media elements alive around a footage cut become
 *  three, and three is the FLOOR under Task 1.3's contract (a node owns its
 *  two inputs as children it renders, so an input that outlives the boundary
 *  must exist both inside the node and in its own Sequence — see this module's
 *  docblock).
 *
 *  The div→null step happens at most once per mount and is never reversed
 *  during forward playback, so it is not the wrapper-type toggle the paragraph
 *  above warns about. A BACKWARD scrub can reverse it, remounting a cold copy
 *  where Fix 1 alone would have had a hidden warm one — accepted deliberately:
 *  a backward scrub across a cut forces a seek on that element either way, and
 *  during a scrub from any distance the "warm" copy was not continuously
 *  mounted to begin with. */
const ItemBody: React.FC<{
  blank: readonly Range[];
  /** The last item-relative frame this item is drawn on itself, or -1 if a
   *  boundary claims every frame it has. */
  drawnThrough: number;
  children: React.ReactNode;
}> = ({ blank, drawnThrough, children }) => {
  const frame = useCurrentFrame();
  const blanked = blank.some(([a, b]) => frame >= a && frame <= b);
  if (!isPreviewEnvironment()) {
    if (blanked) return null;
    // eslint-disable-next-line react/jsx-no-useless-fragment
    return <>{children}</>;
  }
  if (blanked && frame > drawnThrough) return null;
  return (
    <div style={blanked ? { display: 'none' } : { position: 'absolute', inset: 0 }}>
      {children}
    </div>
  );
};

/** The boundary Sequence is `frames + 1` long, not `frames`.
 *
 *  The transition's progress runs 0..1 INCLUSIVE, and progress 1 is a real
 *  frame that something has to draw. Before Task 1.3 that frame was drawn by
 *  the entering wrapper with its progress clamped to 1; keeping it inside the
 *  boundary is what reproduces those pixels. It costs nothing at the other end
 *  of a cut, because the outgoing clip's own range has expired by then and its
 *  re-based Sequence renders nothing — exactly as its real Sequence did. */
const BOUNDARY_TAIL = 1;

/** TASK R1 — FIX 2, PREVIEW-GATED. The boundary's re-based `from`/`to` copies
 *  (see `rebased()` below) mount fresh at the boundary Sequence's own first
 *  frame — cold, with no chance to fetch or seek before that frame is due to
 *  paint. Remotion's `premountFor` mounts a Sequence's subtree early, hidden,
 *  and PROPAGATES that "premounting" state into every nested Sequence
 *  (including a `layout="none"` one, which cannot take `premountFor` itself —
 *  its type is `{layout:'none'}`, which the `AbsoluteFillLayout` variant
 *  carrying `premountFor` is not a member of; verified against this repo's
 *  pinned `remotion@4.0.498`, `Sequence.d.ts`). So this is applied to the
 *  boundary's OWN Sequence, one level up from `rebased()` — its two re-based
 *  children inherit the premount for free, exactly the mechanism `<Video>`/
 *  `<OffthreadVideo>` rely on to preload during a premount window.
 *
 *  ONE SECOND (fps frames): Remotion's own eventual default for an
 *  unspecified `premountFor` once `ENABLE_V5_BREAKING_CHANGES` ships (see
 *  `use-premounting.js`: `premountFor ?? fps`) — borrowed here rather than
 *  invented, since this repo does not carry that flag yet. */
const PREVIEW_BOUNDARY_PREMOUNT_FRAMES = (fps: number): number => fps;

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
  const nodeDims = {
    width: opts.width, height: opts.height, fps: opts.fps,
    palette: opts.palette, background: opts.background,
  };

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

  // ---- which ARM each boundary takes (Phase 5 Task 1.2) ---------------------
  //
  // Resolved ONCE per boundary here rather than inline at the JSX site, because
  // the answer decides the SHAPE of what is emitted, not just what a component
  // does with it. `transitionNodeFor` is memoized (see its docblock), so the
  // composite arm receives the exact same node reference it received when this
  // call lived in the JSX — no new element type, no remount.
  //
  // `typeof node.plan === 'function'`, NOT `'plan' in node`: `plan?: never` is
  // OPTIONAL, so `{ composite: X, plan: undefined }` — a plausible shape for a
  // spread-built node — has the KEY without a callable value, and `in` would
  // route it down the plan path and render nothing. Same discriminant as
  // `isTransitionNode` and `AtCutTransition`.
  const nodeFor = new Map<string, TransitionNode | null>();
  const planned = new Map<string, PlanBoundary>();
  for (const b of boundaries) {
    const node = transitionNodeFor(b.record, dims);
    nodeFor.set(b.key, node);
    if (typeof node?.plan !== 'function') continue;
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

  // Every frame a boundary draws an item on is a frame that item's own Sequence
  // must NOT draw itself on.
  //
  // PLAN BOUNDARIES DO NOT BLANK, and that is the whole point of them: the
  // clip stays mounted and drawn under its own Sequence for the entire window,
  // and the node styles THAT mount instead of instantiating a second copy. So
  // the blanking map — and `lastDrawnFrame`, which is derived from it — is
  // built from the COMPOSITE boundaries alone.
  //
  // `claimed` is the same map built over EVERY boundary, plan or composite. It
  // is what the overlapping-boundaries diagnostic below reads, so that
  // diagnostic keeps seeing the whole timeline: two overlapping windows are a
  // pathology on either arm (on the composite arm the clip is composited
  // twice; on the plan arm one item's two shells are styled by two different
  // live nodes at once, compounding). Today every boundary is composite and
  // the two maps are identical.
  const blanked = new Map<number, Range[]>();
  const claimed = new Map<number, Range[]>();
  const claim = (target: Map<number, Range[]>, i: number | null, b: Boundary) => {
    if (i === null) return;
    const rel = b.start - layout[i].seqFrom;
    const list = target.get(i) ?? [];
    list.push([rel, rel + b.frames] as const);
    target.set(i, list);
  };
  for (const b of boundaries) {
    claim(claimed, b.fromIndex, b);
    claim(claimed, b.toIndex, b);
    if (isPlanned(b)) continue;
    claim(blanked, b.fromIndex, b);
    claim(blanked, b.toIndex, b);
  }

  // OVERLAPPING BOUNDARIES — a clip shorter than its own in+out transition
  // windows is claimed by two boundaries at once, so it is composited TWICE on
  // the frames they share. The one-sided model had its own pathology here (both
  // wrappers mid-progress over one Sequence); this one shows up as a double
  // image, which is a mystery unless something says so. This is a DIAGNOSTIC,
  // not a guard: it never changes what renders.
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

  // TASK R2 — the last frame each item DRAWS ITSELF on, i.e. the last frame of
  // its own Sequence that no boundary has claimed (-1 when every frame it has
  // is claimed). `ItemBody` needs it to tell "hidden, and coming back" from
  // "hidden, and never coming back" — see its docblock for why the difference
  // is a whole media element per cut.
  //
  // Walked by JUMPING to just before each covering range rather than
  // decrementing frame by frame: this runs on every frame of every render (via
  // buildVideoNodes), and a long item wholly claimed by boundaries would
  // otherwise cost one step per frame of its duration. Ranges are few (one per
  // boundary touching the item), so this is O(ranges²) at worst.
  const lastDrawnFrame = (i: number): number => {
    const ranges = blanked.get(i) ?? [];
    let last = layout[i].seqDuration - 1;
    for (;;) {
      const covering = ranges.find(([lo, hi]) => last >= lo && last <= hi);
      if (!covering) return last;
      last = covering[0] - 1;
      if (last < 0) return -1;
    }
  };

  /** An item's content re-based into the boundary's coordinates. `layout="none"`
   *  because this Sequence exists only to carry a time origin and a range — it
   *  is not a layer, and adding one would change what a transition composites
   *  against. */
  const rebased = (i: number, boundaryStart: number) => (
    <Sequence
      from={layout[i].seqFrom - boundaryStart}
      durationInFrames={layout[i].seqDuration}
      layout="none"
    >
      {content(i)}
    </Sequence>
  );

  // A plan boundary's plates and edge plates, as REAL TIMELINE SIBLINGS
  // spanning the window plus its progress-1 frame (the same `+1` the composite
  // arm spells `BOUNDARY_TAIL`, for the same reason).
  //
  // Emitted BETWEEN the two item Sequences — after the `from` side, before the
  // `to` side — which is what makes `z: 'between'` expressible with no
  // `z-index` at all. `under` and `over` are not reachable by tree position
  // from one insertion point and carry an explicit `z-index` instead (see THE
  // STACKING RULE in ./video-track-plan.tsx).
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
   *  `edgeInput`'s idea (Phase 4 Task 2.2), promoted from something the node
   *  instantiates to something the timeline holds. */
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
      // constant: they change `style` only. `boundaryKey === null` is the inert
      // case — which, until the first kind migrates, is every shell of every
      // item in every reel.
      const exitOf = boundaries.find((b) => isPlanned(b) && b.fromIndex === i);
      const enterOf = boundaries.find((b) => isPlanned(b) && b.toIndex === i);
      nodes.push(
        <Sequence key={item.id} from={entry.seqFrom} durationInFrames={entry.seqDuration} name={item.id}>
          <LayerShell boundaryKey={exitOf?.key ?? null} side="from">
            <LayerShell boundaryKey={enterOf?.key ?? null} side="to">
              <ItemBody blank={blanked.get(i) ?? []} drawnThrough={lastDrawnFrame(i)}>{content(i)}</ItemBody>
            </LayerShell>
          </LayerShell>
        </Sequence>,
      );
    }
    // A COMPOSITE boundary is emitted right after the item that owns it, so the
    // painting order across a cut is unchanged: the incoming clip's boundary
    // sits above the outgoing clip's own Sequence, as its Sequence used to.
    for (const b of boundaries.filter((x) => x.owner === i)) {
      if (isPlanned(b)) continue;
      nodes.push(
        <Sequence
          key={b.key}
          from={b.start}
          durationInFrames={b.frames + BOUNDARY_TAIL}
          name={`${b.record.kind} @ ${item.id}`}
          {...(isPreviewEnvironment() ? { premountFor: PREVIEW_BOUNDARY_PREMOUNT_FRAMES(opts.fps) } : {})}
        >
          <AtCutTransition
            node={nodeFor.get(b.key) ?? null}
            from={b.fromIndex === null ? null : rebased(b.fromIndex, b.start)}
            to={b.toIndex === null ? null : rebased(b.toIndex, b.start)}
            frames={b.frames}
            dims={nodeDims}
          />
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
  //
  // `isolate` IS CONDITIONAL, AND THE DESIGN SAYS "UNCONDITIONALLY". This is a
  // deliberate, measured deviation, recorded here because it is the kind of
  // thing that reads like an oversight:
  //
  //   `isolation: 'isolate'` creates a stacking context, which is a BLENDING
  //   GROUP boundary. Applied unconditionally it changes what a `mixBlendMode`
  //   inside the video track blends against — today, the composition
  //   background beneath the track; with it, only the track's own content.
  //   That is not hypothetical: measured on this tree, `npm run
  //   pixel-gate:strict` over the blend-using kinds reported real PIXEL DRIFT
  //   (whip-pan and pixelate cells, max 8x8 cell delta 5) with the wrapper
  //   added and nothing else changed — see the Task 1.2 report for the numbers.
  //   Since this task migrates ZERO kinds and its acceptance criterion is that
  //   all 300 goldens stay byte-identical, an unconditional isolate would fail
  //   the one instrument that can prove the assembly is neutral.
  //
  //   The property the design actually argues for is preserved EXACTLY: it
  //   warns against a stacking context that appears and disappears BETWEEN
  //   FRAMES ("in-window vs out-of-window"), because that makes one reel blend
  //   two different ways at two different times. This flag is derived from the
  //   reel's CONFIG — does any boundary resolve to a plan? — and is therefore
  //   constant across every frame of a given composition. What it does couple
  //   is a reel's blending to whether it contains a plan kind AT ALL, which
  //   Stage 2 must adjudicate when the first kind migrates and its goldens move
  //   for that reason.
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
