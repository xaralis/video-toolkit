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
import React from 'react';
import { Sequence, useCurrentFrame } from 'remotion';
import { AtCutTransition, transitionNodeFor } from './at-cut-transitions';
import { computeVideoLayout, type VideoLayoutEntry } from './video-track-layout';
import { warnOnce } from './warn-once';
import type { AccentSlot } from '../theming/palette';
import type { TransitionRegistry } from '../theming/transitions';
import type { VideoItem } from '../reel-config-base/layered-schema';

export { computeVideoLayout, type VideoLayoutEntry };

/** A frame range, INCLUSIVE at both ends, in the coordinates of whatever
 *  Sequence the consumer is mounted in. Inclusive because a boundary owns its
 *  progress-1 frame too (see BOUNDARY_TAIL below). */
type Range = readonly [number, number];

/** Renders `children` except on the frames a boundary has taken over. The
 *  frames are item-relative, so this must be mounted INSIDE the item's own
 *  Sequence. */
const ItemBody: React.FC<{ blank: readonly Range[]; children: React.ReactNode }> = ({ blank, children }) => {
  const frame = useCurrentFrame();
  if (blank.some(([a, b]) => frame >= a && frame <= b)) return null;
  // eslint-disable-next-line react/jsx-no-useless-fragment
  return <>{children}</>;
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
     *  Optional, but DO NOT read that as harmless to omit: every accent-KEYED
     *  transition param on this call resolves to `null` without it, on EVERY
     *  boundary, silently. "Silently" is asymmetric between the two kinds —
     *  `fade-to-color` warns once per unresolved key (`at-cut-transitions.tsx`,
     *  `resolveAccentColorOrWarn`); `wipe` warns too, via the same helper, but
     *  its fallback is a rendered picture (a black sweep), not an absent one,
     *  so the warning is the only signal at all. This is not a hypothetical:
     *  an unthreaded `palette` at 11 real call sites is exactly what shipped
     *  a `fade-to-color` that rendered a plain crossfade instead of the
     *  brand's dip, undetected until it was measured with three renders. Pass
     *  it. */
    palette?: readonly AccentSlot[];
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

  // Every frame a boundary draws an item on is a frame that item's own Sequence
  // must NOT draw itself on.
  const blanked = new Map<number, Range[]>();
  const blank = (i: number | null, b: Boundary) => {
    if (i === null) return;
    const rel = b.start - layout[i].seqFrom;
    const list = blanked.get(i) ?? [];
    list.push([rel, rel + b.frames] as const);
    blanked.set(i, list);
  };
  for (const b of boundaries) {
    blank(b.fromIndex, b);
    blank(b.toIndex, b);
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
  for (const [i, ranges] of blanked) {
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

  const nodes: React.ReactNode[] = [];
  items.forEach((item, i) => {
    if (drawn(i)) {
      const entry = layout[i];
      nodes.push(
        <Sequence key={item.id} from={entry.seqFrom} durationInFrames={entry.seqDuration} name={item.id}>
          <ItemBody blank={blanked.get(i) ?? []}>{content(i)}</ItemBody>
        </Sequence>,
      );
    }
    // A boundary is emitted right after the item that owns it, so the painting
    // order across a cut is unchanged: the incoming clip's boundary sits above
    // the outgoing clip's own Sequence, as its Sequence used to.
    for (const b of boundaries.filter((x) => x.owner === i)) {
      nodes.push(
        <Sequence
          key={b.key}
          from={b.start}
          durationInFrames={b.frames + BOUNDARY_TAIL}
          name={`${b.record.kind} @ ${item.id}`}
        >
          <AtCutTransition
            node={transitionNodeFor(b.record, dims)}
            from={b.fromIndex === null ? null : rebased(b.fromIndex, b.start)}
            to={b.toIndex === null ? null : rebased(b.toIndex, b.start)}
            frames={b.frames}
            dims={nodeDims}
          />
        </Sequence>,
      );
    }
  });

  return nodes;
}
