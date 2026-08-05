import { forwardRef, memo, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ForwardedRef, RefObject, CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { Timeline, type TimelineState } from '@xzdarcy/react-timeline-editor';
import type { TimelineRow, TimelineAction, TimelineEffect } from '@xzdarcy/timeline-engine';
import '@xzdarcy/react-timeline-editor/dist/react-timeline-editor.css';
import type { PlayerRef } from '@remotion/player';
import type { LayeredReel, VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';
import {
  layeredToTimeline,
  applyTimelineChange,
  parseActionId,
  resizeBoundsMs,
  laneOfRow,
  slipVideoItem,
  slipClamp,
  isSlippable,
  type LaneId,
} from '../src/timeline/layered-adapter';
import { footageCapsById } from '../src/timeline/footage-cap';
import { stripAccents } from './accent';
import { useAudioPeaks, PEAKS_PER_SEC } from './useAudioPeaks';
import { useSourceDurations } from './useSourceDurations';
import { Waveform, VolumeLine } from './Waveform';
import { MusicEnvelope } from './MusicEnvelope';
import { computeMusicEnvelope } from '@video-toolkit/lib/reel-config-base/music-envelope';
import { deriveSpeed } from '@video-toolkit/lib/reel-config-base/speed';
import { resolveMediaSource, type MediaRole } from '@video-toolkit/lib/theming/media-source';
import { humanizeKey, stableColor, sourceColors, type EditorMeta } from './editor-meta';
import { handleRoomFrames, boundaryState, starvationMessage, type HandleRoom } from '@video-toolkit/lib/reel-config-base/handle-room';
import { EDITOR_ACCENT } from '../host/ui';
import { TransitionMarker } from './TransitionMarker';
import { SHORTCUTS } from './shortcuts';
import { GESTURES } from './ShortcutOverlay';
import { LinkIcon } from './icons';
import type { HintMessage } from './block-reason-copy';
import { hintForReason } from './block-reason-copy';
import { edgeBlockReason, musicBlockReason, type BlockReason } from '../src/timeline/block-reason';
import { moveRefusal, LOCKED_LANES } from '../src/timeline/refusal';

// Media paths go through core's ONE rule (lib/theming/media-source.ts) — the
// same one SegmentMedia and the audio track use — rather than a third private
// copy of the convention, which is what these two lines used to be. The editor
// serves URLs off the Vite dev server (`/recordings/x.mp4`), not staticFile
// paths, so the only difference from the renderers is the leading `/` instead
// of staticFile. `resolveMediaSource` is dependency-free (it imports nothing,
// in particular not `remotion`), so importing it here adds nothing to the
// editor's browser bundle and needs no dev-server resolve hook.
const publicUrl = (source: string, role: MediaRole) => `/${resolveMediaSource(source, role)}`;

export const audioUrl = (source: string) => publicUrl(source, 'audio');

// Video source URL for a clip/broll (for intrinsic-duration decode → right-edge
// bound). Clips live under recordings/, broll footage under broll/; a source
// that already contains a path (a full `media/…` source) is served as-is.
export const videoUrl = (item: { kind: string; source?: string }): string | null => {
  if (item.kind !== 'clip' && item.kind !== 'broll') return null;
  if (!item.source) return null;
  return publicUrl(item.source, item.kind);
};

export interface Diagnostic {
  severity: 'error' | 'warning';
  message: string;
  /** Action id of the thing to select when the user clicks this entry. */
  targetId?: string;
}

/** Starved boundaries, as diagnostics the editor can list and navigate to.
 *  Reads the SAME predicate the renderer's check reads (`boundaryState`), so
 *  the editor and the render can never disagree about a boundary. */
export function boundaryDiagnostics(reel: LayeredReel, durationsMs: Record<string, number>, fps: number): Diagnostic[] {
  const items = reel.tracks.video;
  const roomOf = (i: number): HandleRoom | undefined => {
    const it = items[i];
    if (!it) return undefined;
    const url = videoUrl(it);
    return handleRoomFrames(it, url ? durationsMs[url] : undefined, fps);
  };
  const out: Diagnostic[] = [];
  for (let i = 0; i < items.length - 1; i++) {
    const t = items[i].transitionOut;
    const state = boundaryState(t, roomOf(i), roomOf(i + 1));
    if (state === 'ok') continue;
    const msg = starvationMessage(t, roomOf(i), roomOf(i + 1));
    if (msg) out.push({ severity: 'error', message: msg, targetId: `transition:${items[i].id}` });
  }
  return out;
}

// Fixed, typed lanes (D4) — the structure comes from the reel, not free-form
// adding. Order matches the adapter's row order.
const LANE_LABELS: Record<LaneId, string> = {
  overlays: 'Overlays',
  video: 'Video',
  transitions: 'Transitions',
  audio: 'Audio',
  music: 'Music',
  brand: 'Brand',
};

// Colour per item type (effectId). Used both for the block fill and — via the
// effects map xzdarcy requires — as the action's effect metadata.
//
// Core colours only the kinds ITS OWN SCHEMA defines: the video-item union, the
// audio/music tracks and the brand-layer enum (see layered-schema.ts). Overlay
// content kinds are deliberately open there ("core knows modes, not names"), so
// core never enumerates them — an overlay (or any unlisted kind) gets a
// deterministic colour derived from its effectId, and a host that wants a
// specific one declares it in `meta.laneColors`.
//
// Every hue here is drawn from the arc declared in `lane-colors.ts` (the
// whole wheel minus the accent's guard band) — see `lane-colors.test.ts`,
// which asserts both rules, PLUS pairwise distinguishability, over this exact
// map.
//
// This is the SECOND re-pick, and it exists for the opposite reason the
// first one did. The first re-pick (narrow cool arc, 190-280, muted
// hue/sat/light ranges) was a deliberate choice for "harmony" — and the user
// saw the result and rejected it: "far too few colours on the timeline
// items", every lane a shade of blue. Only Rule 1 (no lane on the accent hue)
// is load-bearing; the narrow arc was never anything more than this file's
// own taste, so it went. These seven are spread across the ENTIRE usable
// wheel — evenly, one per ~44deg slot centred within the arc left after the
// guard band is cut out — and held to a common saturation (52%) and
// lightness (45%) instead: that is what keeps them one coherent family while
// still reading as genuinely different colours, rather than the old
// hue-proximity approach that produced "coherent but indistinguishable".
//
// The accent hue is DERIVED from `EDITOR_ACCENT` (`lane-colors.ts`) — real
// value ~251.78deg, guard band ~226.78-276.78deg. Every hue below clears it
// with at least ~47deg to spare (`video-clip` at 298.99deg, the closest).
// Worst pairwise "redmean" RGB distance (the same measure `stableColor.test`
// uses) among these seven is `audio` vs `music` at ~117.6 — nearly double
// the first re-pick's ~62 worst case. Exported so the rules test (and
// nothing else) can read it directly.
export const CORE_LANE_COLOR: Record<string, string> = {
  'video-clip': '#ac37ae',
  'video-broll': '#ae3758',
  'video-photo': '#ae6e37',
  'video-multi-clip': '#97ae37',
  'video-card': '#3fae37',
  'video-outro': '#4a4c54',
  audio: '#37ae87',
  music: '#377dae',
  'brand-watermark': '#4a4c54',
  'brand-disclaimer': '#4a4c54',
};
export const colorFor = (effectId: string, meta?: EditorMeta) =>
  meta?.laneColors?.[effectId] ?? CORE_LANE_COLOR[effectId] ?? stableColor(effectId);

// A VIDEO item's own colour. `clip`/`broll`/`photo` are coloured by their
// SOURCE FILE (`sourceColorMap`, from `sourceColors` in editor-meta.ts) — two
// blocks cutting the same take share a colour, a different take is visibly a
// different one, which a colour keyed on `video-${kind}` alone could never
// show once a reel narrows to a handful of kinds. `multi-clip` (no single
// `source`), `card`, and `outro` (no media at all) keep their fixed kind
// colour. A brand's `meta.laneColors['video-<kind>']` override still wins
// over the derived source colour wherever declared — `colorFor` already
// checks it first, so the guard below simply skips the source lookup rather
// than duplicating the precedence.
function videoItemColor(item: VideoItem, meta: EditorMeta | undefined, sourceColorMap: Record<string, string>): string {
  const effectId = `video-${item.kind}`;
  if (!meta?.laneColors?.[effectId] && (item.kind === 'clip' || item.kind === 'broll' || item.kind === 'photo')) {
    const source = sourceColorMap[item.source];
    if (source) return source;
  }
  return colorFor(effectId, meta);
}

// A block's fill. A LINKED audio bed (followsVideoId) takes its clip's colour so
// the pair reads as one unit — now the clip's SOURCE colour, via the same
// `videoItemColor` the video lane itself uses, so the pair still reads as one
// unit even though "the clip's colour" is no longer a single fixed value per
// kind. An UNLINKED bed and the music lane keep their kind colour (`audio` /
// `music`, via the `colorFor` fallback below) — deliberately: they have no
// clip to mirror, and keeping them on the fixed kind colour is what keeps the
// audio band visually distinct from the video band.
export function blockColor(action: TimelineAction, reel: LayeredReel, meta: EditorMeta | undefined, sourceColorMap: Record<string, string>): string {
  const { lane, id } = parseActionId(action.id);
  if (lane === 'video') {
    const item = reel.tracks.video.find((v) => v.id === id);
    if (item) return videoItemColor(item, meta, sourceColorMap);
  }
  if (lane === 'audio') {
    const a = reel.tracks.audio.find((x) => x.id === id);
    const v = a?.followsVideoId ? reel.tracks.video.find((x) => x.id === a.followsVideoId) : undefined;
    if (v) return videoItemColor(v, meta, sourceColorMap);
  }
  return colorFor(action.effectId, meta);
}

// ---- Per-type timeline label ----------------------------------------------
// Each lane/item type generates its own readable label (source filename, or the
// start of an overlay's text) instead of an opaque id.
const basename = (s: string | undefined) => (s ? s.split('/').pop() ?? s : '');
const snippet = (s: string, n = 22) => {
  // Collapse newlines/whitespace so a multi-line overlay reads on one line.
  const plain = stripAccents(s).replace(/\s+/g, ' ').trim();
  return plain.length > n ? `${plain.slice(0, n).trimEnd()}…` : plain;
};
// Overlay content kinds are open (the layered schema keeps content permissive),
// so core does NOT enumerate them: an overlay's block label is its kind
// humanized (`my-kind` → `My kind`), and a host that wants a shorter
// or different one declares it in `meta.overlayLabels`.
const VIDEO_KIND_LABEL: Record<string, string> = {
  clip: 'Clip',
  broll: 'Broll',
  'multi-clip': 'Multi',
  card: 'Card',
  outro: 'Outro',
};

// Trim-grip affordance for a clip/broll edge. An edge is "muted" when it CAN'T
// extend outward: the left in-point is already at the source start
// (sourceInMs<=0, nothing earlier to reveal); the right out-point has hit its
// footage cap (the end of the file — for a clip or a video-backed broll alike).
// Returns null for kinds without a single trim source.
function gripState(
  item: VideoItem | undefined,
  footageCapMs: number | undefined,
): { left: boolean; right: boolean } | null {
  if (!item) return null;
  // Outro / card / multi-clip have no single trim source, but they still resize
  // (span) — give them plain grips (never muted) so every video block looks the
  // same. Only clip/broll can hit a footage limit and go muted.
  if (item.kind !== 'clip' && item.kind !== 'broll') return { left: false, right: false };
  return {
    left: item.sourceInMs <= 0,
    right: footageCapMs !== undefined && item.sourceOutMs >= footageCapMs - 1,
  };
}

// px dragged → ms of source shift. NEGATED: dragging right pulls the media right
// inside a fixed window, so what precedes it slides into view (sourceInMs falls).
// Matches Premiere/Resolve. `scaleWidth` is px per second. `speed` converts the
// TIMELINE travel under the pointer into a SOURCE shift — at 0.5x, one second
// of timeline is half a second of source, so the shift must be smaller; at 2x,
// larger. Defaults to 1 so existing (pre-speed) call sites are unaffected.
// `|| 0` normalizes the `-0` that `-(0 / scaleWidth) * 1000 * speed` produces for
// dxPx===0 back to `+0` — Object.is (and so `toBe(0)`) treats them as unequal.
export function slipDeltaMs(dxPx: number, scaleWidth: number, speed: number = 1): number {
  return -(dxPx / scaleWidth) * 1000 * speed || 0;
}

/** Pure core of `onActionResizing`: why (if at all) the dragged edge is
 *  currently at its limit. Extracted so the trap this task exists to avoid —
 *  using `sourceDurations` (the raw decoded length) instead of `capMsById`
 *  (the SAME cap the live drag bound and the commit clamp both use, i.e. the
 *  max of the decoded file and the clip's authored out-point) — is provable
 *  in a unit test without driving the vendored timeline library. `dir` here
 *  is `'left' | 'right'`, xzdarcy's own vocabulary — NOT `edgeBlockReason`'s
 *  `'in' | 'out'`, which is derived from it below. */
export function resizeHintFor(
  ctx: { reel: LayeredReel; capMsById: Record<string, number>; fps: number; musicMaxMs?: number },
  ev: { actionId: string; start: number; end: number; dir: 'left' | 'right' },
): HintMessage | null {
  const { reel, capMsById, fps, musicMaxMs } = ctx;
  const { start, end, dir } = ev;
  const { lane, id } = parseActionId(ev.actionId);
  const tolMs = 1000 / fps;
  const posMs = (dir === 'left' ? start : end) * 1000;
  const edge = dir === 'left' ? 'in' : 'out';
  const reasonHint = (r: BlockReason | null) => (r ? hintForReason(r) : null);
  if (lane === 'music') return reasonHint(musicBlockReason({ edge, posMs, maxMs: musicMaxMs, tolMs }));
  // Same guard `onActionResizeStart` already applies before arming the live
  // bound: only the video lane's items are trimmable this way. Today only
  // 'video'/'music'/'audio' actions are ever resizable at all — but the
  // transitions lane's action id parses to the VIDEO item's id (Task 1's
  // shape), so if that lane were ever made resizable this would otherwise
  // silently report a footage-cap reason for what is actually a transition
  // drag.
  if (lane !== 'video') return null;
  const item = reel.tracks.video.find((v) => v.id === id);
  if (!item) return null;
  return reasonHint(edgeBlockReason({ item, decodedMs: capMsById[id], edge, posMs, tolMs }));
}

/** Pure core of the slip gesture's hint — the ONLY blocking edit path in the
 *  editor that used to publish nothing at all when it ran out of source (see
 *  `resizeHintFor` above for the parallel resize case). `slipClamp` already
 *  computes the SAME bound `slipVideoItem` clamps against, so this is a
 *  lookup, not a re-derivation. */
export function slipHintFor(
  reel: LayeredReel,
  id: string,
  deltaMs: number,
  footageMsById: Record<string, number>,
): HintMessage | null {
  const clamp = slipClamp(reel, id, deltaMs, footageMsById);
  if (clamp === 'head') return hintForReason('slip-head-exhausted');
  if (clamp === 'tail') return hintForReason('slip-tail-exhausted');
  return null;
}

/** Pure core of `onActionMoving`'s refusal — mirrors `resizeHintFor`/
 *  `slipHintFor` above: delegates to `moveRefusal` (`src/timeline/refusal.ts`,
 *  already exhaustively tested) and maps the result through `hintForReason`.
 *  `onActionMoving` fires on every pointer move of a drag, so the actual
 *  callback must stay a thin wrapper around this — same reasoning as the
 *  other two hint helpers. */
export function moveHintFor(lane: LaneId, actionId: string, linkedAudioIds: ReadonlySet<string>): HintMessage | null {
  const r = moveRefusal({ lane, actionId, linkedAudioIds });
  return r ? hintForReason(r) : null;
}

// Zoom per pixel of wheel travel, as ln(factor). A mouse notch (deltaY ≈ 100 in
// pixel mode) lands on ~1.33×; a trackpad pinch, which fires dozens of events a
// second carrying a few px each, moves under a percent per event and so reads as
// one smooth continuous zoom.
//
// TUNED BY HAND, twice. The first pass at 0.0022 was measurably too sluggish in
// a real edit; this is that value +30%. It is the sensitivity knob — change this
// one number, not the shape of the curve.
//
// THE POINT IS THAT IT IS PROPORTIONAL. This used to apply a flat 1.15× per
// wheel EVENT regardless of magnitude, which is fine for a mouse (one event per
// notch) and unusable on a trackpad, where a single pinch delivers ~40 events
// and multiplied the zoom by 1.15^40 — a factor of 270.
const ZOOM_PER_PX = 0.00286;
// One event may not do more than this, whatever the device reports. It must stay
// clear of a normal mouse notch (~1.33× at the sensitivity above) — a cap that
// binds on ordinary input is not a safety rail, it is the sensitivity setting in
// disguise, and it would silently swallow the tuning.
const ZOOM_EVENT_MAX = 1.5;
// deltaMode 1 = lines, 2 = pages (Firefox and some mice). Rough px equivalents,
// only ever used to put those devices on the same scale as pixel-mode wheels.
const PX_PER_LINE = 16;
const PX_PER_PAGE = 400;

/** ⌘/Ctrl + wheel travel → the factor to multiply the zoom by. Pure, so the
 *  sensitivity curve is testable without a real wheel event. */
export function zoomFactorFor(deltaY: number, deltaMode = 0): number {
  const px = deltaY * (deltaMode === 1 ? PX_PER_LINE : deltaMode === 2 ? PX_PER_PAGE : 1);
  const raw = Math.exp(-px * ZOOM_PER_PX);
  return Math.min(ZOOM_EVENT_MAX, Math.max(1 / ZOOM_EVENT_MAX, raw));
}

// xzdarcy's `startLeft`: the px gap between the timeline's left edge and time 0.
export const TIMELINE_START_LEFT = 12;

// How far the playhead may sit from a viewport edge before the timeline scrolls
// to follow it (px). Small enough that a seek just outside the view scrolls, big
// enough that the cursor never hugs the very edge.
const FOLLOW_MARGIN_PX = 36;
// Where the playhead lands after a follow, as a fraction of the viewport width.
// Forward: near the LEFT, so playback runs most of a screen before paging again
// (the page-flip every NLE does). Backward: a quarter in, so what you just
// scrubbed past stays visible.
const FOLLOW_REST_AHEAD = 0.1;
const FOLLOW_REST_BEHIND = 0.25;

/** The scrollLeft that brings the playhead back into view, or `null` when it is
 *  already comfortably inside. Pure so it can be tested — the DOM measurement it
 *  reads (`view`) is untestable in jsdom, which has no layout. */
export function followScrollLeft(
  cursorX: number,
  view: { scrollLeft: number; clientWidth: number; scrollWidth: number },
  margin = FOLLOW_MARGIN_PX,
): number | null {
  const { scrollLeft, clientWidth, scrollWidth } = view;
  if (clientWidth <= 0) return null;
  const behind = cursorX < scrollLeft + margin;
  const ahead = cursorX > scrollLeft + clientWidth - margin;
  if (!behind && !ahead) return null;
  const rest = clientWidth * (behind ? FOLLOW_REST_BEHIND : FOLLOW_REST_AHEAD);
  // Clamping at the content end is what stops a follow at the tail of the reel
  // from re-firing every frame: the target saturates at `max`, equals the
  // current scrollLeft, and returns null below.
  const max = Math.max(0, scrollWidth - clientWidth);
  const next = Math.min(max, Math.max(0, Math.round(cursorX - rest)));
  return next === scrollLeft ? null : next;
}

/** Where to scroll so a zoom keeps the content under `anchorX` in place.
 *
 *  Without this the timeline grows around its LEFT EDGE, so the playhead
 *  slides out of view on every zoom step and has to be chased with a scroll.
 *
 *  Pure so the invariant is testable — jsdom runs no layout, so the effect
 *  that APPLIES this (see the layout effect keyed on `scaleWidth`) is a
 *  hand-verification item, not something a unit test can pin. */
export function zoomAnchorScrollLeft(
  anchorX: number,
  view: { scrollLeft: number; scrollWidth: number; clientWidth: number },
  factor: number,
): number {
  const offset = anchorX - TIMELINE_START_LEFT;
  const content = view.scrollLeft + offset;
  const max = Math.max(0, view.scrollWidth * factor - view.clientWidth);
  return Math.min(max, Math.max(0, content * factor - offset));
}

export interface PendingZoom {
  anchorX: number;
  factor: number;
  view: { scrollLeft: number; scrollWidth: number; clientWidth: number };
}

// ---------------------------------------------------------------------------
// The clip-row relayout gap. THIS WAS MEASURED, not inferred — probing a real
// editor (a brand project's `npm run editor`) across zoom events found:
//
//  - the zoom readout goes 199% -> 280%, and
//    `.ReactVirtualized__Grid__innerScrollContainer`'s width tracks it exactly
//    (9547.45px -> 13451.7px -> 18954.6px): `scaleWidth` state and the Grid's
//    own props DO update.
//  - `.timeline-editor-edit-row` stays at width: 4812px across every one of
//    those zooms — 4812 is the row's width AT THE INITIAL 100% ZOOM. It never
//    moves again.
//  - an action's inline style (`height: 34px; left: 246.48px; width:
//    161.52px`) is BYTE-IDENTICAL before and after a zoom.
//  - snapshotting every action by its label and comparing content-x/width
//    across a zoom: every ratio is exactly 1.0000, while the scroll extent's
//    ratio is 1.4095.
//
// So the scrollABLE extent grows (react-virtualized's own bookkeeping) but
// the rows and the clips inside them stay frozen at a stale scale — the
// ruler is a separate element that redraws straight from `scaleWidth`, which
// is why it looks perfect while the clips don't. The underlying gap is in
// `@xzdarcy/react-timeline-editor` (confirmed by reading its source): its
// only `reRender` effects are keyed on the DATA prop
// (`useEffect(()=>{ L && P.current.reRender() }, [x])`), and
// `TimelineState.reRender()` is the PLAYBACK engine's tick
// (`reRender(){ this.isPlaying || this._tickAction(this._currentTime) }`),
// not a layout recompute — neither one ever tells react-virtualized's Grid
// that a zoom changed what its cells should measure as.
//
// The confirmed fix: reaching react-virtualized's Grid instance and calling
// its own `recomputeGridSize()` snapped the row from 4812 straight to
// 18954.6 — one call, correct layout. There is no ref to the Grid (xzdarcy
// mounts it internally), so it's reached by walking the React fiber tree up
// from the DOM node `scrollEl()` already finds (see `findGridInstance`
// below) and cached the same way `scrollEl` caches its own node.
//
// A future reader deleting this: the two numbers above (4812 staying frozen
// while the scroll extent moves to 18954.6, ratio 1.4095 while every action's
// own ratio holds at 1.0000) are what prove the gap is real and where it
// lives. Re-verify with the same DOM probe before assuming a library update
// closed it.
// ---------------------------------------------------------------------------

/** A react-virtualized Grid instance, narrowed to the one method this file
 *  needs. (The real class exposes much more; nothing else is used here.) */
export interface GridInstance {
  recomputeGridSize: () => void;
}

/** Walks up the React fiber tree from a DOM node to the nearest ancestor
 *  whose `stateNode` exposes a `recomputeGridSize` function — i.e. the
 *  react-virtualized `Grid` class instance backing that node. There is no
 *  public ref or prop for this (see the block above); this is the only way
 *  to reach it from outside the library.
 *
 *  React attaches a fiber pointer to every host DOM node it renders, under a
 *  property keyed `__reactFiber$<random>` (the suffix is a per-mount random
 *  string, so it can't be hard-coded). From there `fiber.return` walks
 *  upward toward the root; `fiber.stateNode` is the component instance for a
 *  class component's fiber (undefined/a raw DOM node for everything else).
 *
 *  Bounded (`maxAncestors`) and NOT the first `stateNode` found — a class
 *  component sitting between the DOM node and the Grid (react-virtualized's
 *  own wrappers, or xzdarcy's) would otherwise be mistaken for it, since
 *  `stateNode` is set on plenty of fibers that aren't the Grid. Returns null
 *  rather than throwing when nothing matches (wrong React version, library
 *  internals changed, or a stray call before mount) — callers must degrade
 *  gracefully, not crash the editor over a lookup that reaches into two
 *  libraries' private internals. */
export function findGridInstance(domNode: Node, maxAncestors = 12): GridInstance | null {
  const fiberKey = Object.keys(domNode).find((k) => k.startsWith('__reactFiber$'));
  if (!fiberKey) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- React's fiber shape isn't a public type.
  let fiber: any = (domNode as any)[fiberKey];
  for (let i = 0; fiber != null && i <= maxAncestors; i++) {
    const inst = fiber.stateNode;
    if (inst && typeof inst.recomputeGridSize === 'function') return inst as GridInstance;
    fiber = fiber.return;
  }
  return null;
}

/** The body of the layout effect keyed on `scaleWidth`, extracted so it's
 *  unit-testable (jsdom runs no layout, so the effect itself is a
 *  hand-verification item like `zoomAnchorScrollLeft` — but the ORDERING and
 *  degradation rules below don't need real layout to pin).
 *
 *  Order is: recompute the Grid's cell sizes FIRST, THEN apply the scroll
 *  anchor. The anchor's own numbers (`zoomAnchorScrollLeft`) don't depend on
 *  a fresh DOM read — `pending.view` is the PRE-zoom geometry captured by the
 *  caller — but xzdarcy's `setScrollLeft` flows into react-virtualized as a
 *  controlled `scrollLeft` prop, and applying it while the Grid still thinks
 *  the content is the OLD (smaller) size risks the row settling back to a
 *  stale extent on the very next re-render. Measured in this repo (see the
 *  block above `GridInstance`): `grid.recomputeGridSize()` calls React's
 *  `forceUpdate()` internally, which does NOT apply synchronously — reading
 *  the DOM immediately after calling it, from the same synchronous scope,
 *  still saw the PRE-recompute state (confirmed with a throwaway probe: a
 *  class component's `forceUpdate`, triggered from a parent's
 *  `useLayoutEffect`, left the DOM unchanged by the time that effect
 *  function returned — even wrapped in `flushSync`, which React explicitly
 *  refuses mid-commit: "flushSync was called from inside a lifecycle
 *  method"). The SAME probe found the update WAS visible by the very next
 *  microtask — React flushes the deferred sync-priority re-render once the
 *  whole commit's layout effects finish, before yielding control, so a
 *  `queueMicrotask` scheduled from inside the layout effect runs after that
 *  flush. Hence: recompute synchronously, then defer applying the anchor to
 *  a microtask rather than running both in one synchronous block. */
export function applyZoomLayout({
  grid,
  pendingRef,
  setScrollLeft,
}: {
  grid: GridInstance | null;
  pendingRef: { current: PendingZoom | null };
  setScrollLeft: (scrollLeft: number) => void;
}): void {
  // Clear unconditionally, before the early return below — a stale anchor
  // surviving into an unrelated later zoom (one that doesn't happen to
  // re-enter this branch) is exactly the bug the wheel handler's own no-op
  // branch guards against elsewhere in this file; this preserves the same
  // property for the layout effect's side.
  const pending = pendingRef.current;
  pendingRef.current = null;
  if (!pending) return;
  grid?.recomputeGridSize();
  queueMicrotask(() => {
    setScrollLeft(zoomAnchorScrollLeft(pending.anchorX, pending.view, pending.factor));
  });
}

/** Folds one new zoom capture into a possibly-still-unconsumed `pendingZoom`.
 *
 *  A continuous trackpad pinch (or a fast run of ⌘/Ctrl+wheel notches) fires
 *  several zoom events before React commits a single render — the layout
 *  effect that applies `pendingZoom` is keyed on `scaleWidth` and only runs
 *  once that commit happens, so several captures can land before it ever
 *  fires. Each capture's `factor` is only THAT ONE event's ratio, but by the
 *  time the layout effect runs, `scaleWidth` has moved by the PRODUCT of all
 *  of them — GUARANTEED, not merely observed: the host's `zoomBy`
 *  (`EditorHost.tsx`, via `zoomByRef` in `host/zoom-by.ts`) reads and writes
 *  a ref synchronously on every call rather than the `scaleWidth` render
 *  closure, so N calls landing in the same tick compound instead of
 *  overwriting each other. This function's own `factor` must be multiplied
 *  in to match, never replaced, or the anchor correction is computed for a
 *  much smaller zoom than actually happened and the content drifts under the
 *  pointer for the length of the gesture (settling only on the final event,
 *  whose correction lands against an already-settled layout — exactly the
 *  "it only settles once I stop zooming" symptom). The two are coupled: this
 *  multiply-in is only correct because `zoomBy` actually compounds; if
 *  `zoomBy` ever regresses to reading `scaleWidth` from a closure again, this
 *  function would silently start over-correcting.
 *
 *  The FIRST capture's `anchorX`/`view` are kept for every fold after it:
 *  that is the true pre-gesture geometry, and the anchor should stay where
 *  the gesture started, not migrate to wherever the pointer/viewport happen
 *  to read on a later, not-yet-committed event.
 *
 *  A no-op `achieved` (1, i.e. the host was already at ZOOM_MIN/ZOOM_MAX and
 *  the zoom did not happen) folds nothing in and returns `prev` UNTOUCHED —
 *  including when `prev` is null, where the answer is "still no capture".
 *  This is authoritative: the call sites' own `achieved === 1` early returns
 *  are a fast path that skips a DOM measurement, not a second copy of the
 *  rule. Discarding `prev` here was a real, measured defect: at the zoom
 *  ceiling (496% -> 500%) a burst whose first events zoomed and whose last
 *  events no-op'd lost its whole accumulated anchor, so `scrollLeft` never
 *  moved and the content jumped; deeper into the range the same burst missed
 *  by 1405px. Keeping `prev` is safe, because a capture only exists when some
 *  event DID change `scaleWidth` — which means a commit is already scheduled,
 *  and that commit's layout effect is what consumes and clears it. */
export function accumulateZoom(
  prev: PendingZoom | null,
  anchorX: number,
  achieved: number,
  view: { scrollLeft: number; scrollWidth: number; clientWidth: number },
): PendingZoom | null {
  if (Math.abs(achieved - 1) < 1e-9) return prev;
  if (!prev) return { anchorX, factor: achieved, view };
  return { ...prev, factor: prev.factor * achieved };
}

// The trim handles are xzdarcy's own invisible stretch zones; these grips are a
// visual layer on top (pointer-events:none so the real handles still drag).
// Default: faint. Hover the block: its grips brighten (shows WHICH clip's handle
// you'll grab at a butted seam). Muted: hatched + dim (this edge can't extend).
const GRIP_CSS = `
.vt-grip { position: absolute; top: 4px; bottom: 4px; width: 5px; border-radius: 2px; pointer-events: none; background: color-mix(in oklab, var(--ed-color-ink) 30%, transparent); transition: background 0.12s ease, box-shadow 0.12s ease; }
.vt-grip-left { left: 2px; }
.vt-grip-right { right: 2px; }
.timeline-editor-action:hover .vt-grip { background: color-mix(in oklab, var(--ed-color-ink) 92%, transparent); box-shadow: 0 0 0 1px color-mix(in oklab, var(--ed-color-stage) 35%, transparent); }
.vt-grip-muted, .timeline-editor-action:hover .vt-grip-muted { background: repeating-linear-gradient(45deg, color-mix(in oklab, var(--ed-color-ink) 16%, transparent) 0 2px, transparent 2px 4px); box-shadow: none; }
/* The block being dragged paints above its neighbours. xzdarcy stacks the action
   wrappers by DOM order alone, so a clip whose right edge is dragged over the
   next clip goes UNDER it and stays invisible until release — you cannot see the
   edit you are making. The marker class is on the inner block (getActionRender
   owns that node, not the wrapper), so the wrapper is reached with :has(). */
.timeline-editor-action:has(.vt-block-active) { z-index: 4; }
/* A transition's label is wider than the transition itself (15 frames is ~12px
   at default zoom, and "gradient-wipe" is not), so it has to escape the action
   box the library clips by default. Raised above its neighbours too: an
   overhanging label that renders UNDER the next action is worse than a
   truncated one. */
.timeline-editor-action:has(.vt-transition-action) { overflow: visible; z-index: 3; }
`;

// Video/audio block base look (position/height/layout/typography — every
// constant part of the block's style). `background` (per-item colour),
// `outline` (selection ring — the accent, never swapped into `background`,
// which now carries lane identity) and `cursor` (slip affordance) stay
// inline — see the getActionRender block below — because they vary per
// action.
const BLOCK_BASE_CLS =
  'ed:relative ed:h-full ed:flex ed:items-center ed:px-1.5 ed:rounded-[3px] ed:text-ink ed:font-sans ed:text-[11px] ed:overflow-hidden';

export function timelineLabel(action: TimelineAction, reel: LayeredReel, fps: number, meta?: EditorMeta): string {
  const { lane, id } = parseActionId(action.id);
  if (lane === 'transitions') {
    const frames = Math.round((action.end - action.start) * fps);
    return `${action.effectId} · ${frames}f`;
  }
  if (lane === 'overlays') {
    const o = reel.tracks.overlays.find((x) => x.id === id);
    const c = o?.content as { kind?: string; text?: string } | undefined;
    const rawKind = c?.kind ?? '';
    const kind = meta?.overlayLabels?.[rawKind] ?? (rawKind ? humanizeKey(rawKind) : 'Overlay');
    const text = c?.text?.trim();
    return text ? `${kind}: ${snippet(text)}` : kind;
  }
  if (lane === 'video') {
    const v = reel.tracks.video.find((x) => x.id === id);
    if (!v) return id;
    const kind = VIDEO_KIND_LABEL[v.kind] ?? v.kind;
    const src = basename('source' in v ? v.source : undefined);
    return src ? `${kind} ${v.id}: ${src}` : `${kind} ${v.id}`;
  }
  if (lane === 'audio') {
    const a = reel.tracks.audio.find((x) => x.id === id);
    const seg = id.replace(/-audio$/, '');
    return a?.source ? `${seg}: ${basename(a.source)}` : seg;
  }
  if (lane === 'music') {
    const src = basename(reel.tracks.music.source);
    return src ? `Music: ${src}` : 'Music';
  }
  // brand
  const b = reel.tracks.brand.find((x) => x.id === id);
  const asset = basename((b?.props as { asset?: string } | undefined)?.asset);
  if (b?.kind === 'watermark') return asset ? `Logo: ${asset}` : 'Logo';
  if (b?.kind === 'disclaimer') return 'Disclaimer';
  return id;
}

// Waveform props for an audio/music block (else null). Span comes from the action.
function waveformFor(action: TimelineAction, reel: LayeredReel, peaks: Map<string, Float32Array>) {
  const { lane, id } = parseActionId(action.id);
  const spanMs = (action.end - action.start) * 1000;
  if (lane === 'audio') {
    const a = reel.tracks.audio.find((x) => x.id === id);
    if (!a) return null;
    return { peaks: peaks.get(audioUrl(a.source)), sourceInMs: a.sourceInMs, spanMs };
  }
  if (lane === 'music' && reel.tracks.music.source) {
    return { peaks: peaks.get(audioUrl(reel.tracks.music.source)), sourceInMs: 0, spanMs };
  }
  return null;
}

// xzdarcy's CSS forces `font-family: PingFang SC` (a CJK font) on the whole
// timeline, which renders Czech diacritics with an inconsistent fallback.
// Override with a system stack that covers Latin+diacritics properly.
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

// xzdarcy layout (from its CSS): the time-ruler area is 32px and the edit-area
// (rows) has a 10px margin-top — so the first row starts 42px down. The lane
// header column must offset by the same amount to line up.
const RULER_H = 32;
const EDIT_AREA_MARGIN = 10;
const HEADER_OFFSET = RULER_H + EDIT_AREA_MARGIN; // 42
const ROW_H = 34;
// Beat-snap catch radius in screen px (converted to ms via scaleWidth per zoom).
const SNAP_PX = 8;
// Transitions are markers at the cut, not full clips — a thinner row keeps
// the lane visually distinct from the video/audio blocks above and below it.
const TRANSITIONS_ROW_H = 18;
// Transition marker glyph fill — `--color-transition-marker` in
// editor.in.css's `@theme static` block, used below (via TransitionMarker.tsx)
// as `ed:fill-transition-marker`.

export interface LayeredTimelineProps {
  reel: LayeredReel;
  onChange: (next: LayeredReel) => void;
  selectedId: string | null; // action id `${lane}:${itemId}`
  onSelect: (actionId: string | null) => void;
  playerRef: RefObject<PlayerRef | null>;
  fps: number;
  /** Ripple mode: a resize shifts everything beyond the clip to stay butted. */
  ripple?: boolean;
  scaleWidth?: number; // px per second (zoom)
  /** Snap edges/moves to the grid. Default true. */
  snapping?: boolean;
  /** ⌘/Ctrl + wheel (or pinch) over the timeline. Receives a MULTIPLICATIVE
   *  factor for the current zoom (>1 in, <1 out), already scaled to how far the
   *  wheel actually moved — not a direction. See ZOOM_PER_PX.
   *
   *  Returns the ACHIEVED ratio — not necessarily the requested `factor`,
   *  because the host clamps `scaleWidth` to `[ZOOM_MIN, ZOOM_MAX]`. At the
   *  clamp boundary a requested ×1.25 might only ever land ×1.14, and the
   *  anchor math below needs the number that actually happened or it
   *  overshoots (some 200px of drift on a 2000px content offset was measured
   *  from exactly this gap). `1` means "no-op — scaleWidth did not change". */
  onZoom?: (factor: number) => number;
  /** The last-saved reel — supplies each clip's AUTHORED length so a trim can be
   * restored to it (even when the file is a touch shorter, i.e. it holds a frame). */
  savedReel?: LayeredReel | null;
  guidesMs?: number[]; // vertical ruler guide markers (e.g. musical beat onsets)
  /** Snap a dragged/resized edge to the nearest `guidesMs` beat (snap-on-release). */
  snapToBeats?: boolean;
  /** Brand-supplied editor vocabulary (lane colours + overlay labels). Optional —
   *  core's defaults are brand-neutral (see editor-meta.ts).
   *
   *  PASS A STABLE REFERENCE — a module-level `const editorMeta: EditorMeta = {…}`,
   *  or `useMemo`. This component is `memo`ized with a shallow compare and it is
   *  re-rendered on every playhead frame; an inline `meta={{ … }}` literal is a
   *  fresh object each render and defeats the memo entirely. */
  meta?: EditorMeta;
  /** Reported upward so the shell can badge them. Pass a STABLE callback. */
  onDiagnostics?: (d: Diagnostic[]) => void;
  /** A transient message shown INSTEAD of the shortcut hints (the bar is one
   *  line — see the bar's own comment). Null/absent = show the hints. */
  hint?: HintMessage | null;
  /** Reports why a resize handle stopped, live during the drag. A non-null
   *  call PUBLISHES a message; a null call means "the gesture just ended" —
   *  the host owns the message's lifetime and interprets null as the start
   *  of the auto-clear countdown (see useTransientHint), not an instruction
   *  to clear immediately. Pass a STABLE callback — see `hint` above and
   *  `meta`: this component is memoized and re-renders every playhead frame. */
  onHint?: (hint: HintMessage | null) => void;
}

/** Imperative escape hatch for a zoom that has no pointer to anchor on — the
 *  toolbar buttons and keyboard shortcuts, which change `scaleWidth` from
 *  OUTSIDE this component. `zoomAtCenter` captures the CURRENT (pre-zoom)
 *  geometry synchronously, before the caller applies the scale change, and
 *  feeds it into the exact same `pendingZoom` → layout-effect path the wheel
 *  handler uses below — no second code path for applying an anchor, only a
 *  second way of capturing one.
 *
 *  `factor` must be the ACHIEVED ratio (what `scaleWidth` will actually move
 *  by, after the host's own clamp), not the requested one — every caller gets
 *  this from `zoomBy`'s return value. Passing `1` (the no-op case — already at
 *  min/max zoom) schedules nothing and leaves any pending anchor untouched. */
export interface LayeredTimelineHandle {
  zoomAtCenter: (factor: number) => void;
}

function LayeredTimelineImpl({
  reel,
  onChange,
  selectedId,
  onSelect,
  playerRef,
  fps,
  ripple = false,
  scaleWidth = 80,
  snapping = true,
  onZoom,
  savedReel,
  guidesMs,
  snapToBeats = false,
  meta,
  onDiagnostics,
  hint,
  onHint,
}: LayeredTimelineProps, ref: ForwardedRef<LayeredTimelineHandle>) {
  const stateRef = useRef<TimelineState>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const guidesRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // An in-flight slip. `base` is the reel as it was when the gesture STARTED, so
  // every move re-derives from it rather than accumulating — no drift, and the
  // clamp stays honest at the edges. History coalesces the stream of commits
  // into one undo step (useHistory.ts:5-8).
  const slipRef = useRef<{ id: string; x0: number; base: LayeredReel } | null>(null);

  // The anchor a pending zoom must preserve, captured in the wheel handler
  // below and consumed by the layout effect keyed on `scaleWidth` further
  // down. NOT applied in the handler itself: `scaleWidth` lives in the host,
  // so a scroll write in that same tick would be clamped against the OLD
  // scrollWidth (the DOM hasn't re-laid-out yet) — which looks exactly like
  // the drift this is fixing. `view` is the PRE-zoom geometry — the effect
  // must use it as captured, not re-measure, or the zoom gets applied twice.
  const pendingZoom = useRef<{
    anchorX: number;
    factor: number;
    view: { scrollLeft: number; scrollWidth: number; clientWidth: number };
  } | null>(null);

  // Alt held → slippable clips show they can be slipped. Window-level because
  // the key may be pressed before the pointer enters a block. `blur` clears it:
  // a tab switch swallows the keyup and would otherwise leave it stuck on.
  const [altHeld, setAltHeld] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.altKey) setAltHeld(true); };
    const up = (e: KeyboardEvent) => { if (!e.altKey) setAltHeld(false); };
    const clear = () => setAltHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, []);

  // ⌘/Ctrl + wheel (and trackpad pinch, which macOS delivers as ctrl+wheel) zooms
  // the timeline. Attached non-passive so preventDefault stops the browser's own
  // page zoom. Reads onZoom via a ref so the listener attaches once.
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      const f = zoomFactorFor(e.deltaY, e.deltaMode);
      if (f === 1) return;
      // Ask the host to apply the requested factor FIRST and read back what it
      // actually achieved (it clamps scaleWidth to [ZOOM_MIN, ZOOM_MAX]) — the
      // anchor below must use THAT number, not the request, or a clamp-boundary
      // zoom overshoots (see `onZoom`'s own doc comment). Calling this before
      // measuring the DOM is safe: `setScaleWidth` only SCHEDULES a re-render,
      // it does not re-lay-out synchronously, so the geometry read just below
      // is still the PRE-zoom geometry either way.
      const achieved = onZoomRef.current?.(f);
      // No-op at the clamp boundary (already at ZOOM_MIN/ZOOM_MAX): fold
      // nothing in, but LEAVE any earlier capture alone. Clearing it here was a
      // real defect — measured in a browser at the ceiling (496% -> 500%), a
      // burst whose first events zoomed and whose last events no-op'd had its
      // whole accumulated anchor wiped, so `scrollLeft` never moved at all and
      // the content jumped. Deeper into the range the same burst missed by
      // 1405px.
      //
      // Leaving it is safe, and the "stale anchor" this used to guard against
      // cannot actually arise: a capture only EXISTS when `achieved !== 1`,
      // which means `zoomBy` changed `scaleWidth`, which means a commit is
      // already scheduled — and that commit's layout effect consumes and clears
      // the capture. There is no path that captures without a commit following.
      if (!achieved || Math.abs(achieved - 1) < 1e-9) return;
      const scrollTarget = scrollEl();
      if (!scrollTarget) return;
      const rect = scrollTarget.getBoundingClientRect();
      // ACCUMULATE, don't overwrite — see accumulateZoom's doc comment. Several
      // wheel events can land here before the layout effect below ever runs.
      pendingZoom.current = accumulateZoom(
        pendingZoom.current,
        e.clientX - rect.left,
        achieved,
        { scrollLeft: scrollTarget.scrollLeft, scrollWidth: scrollTarget.scrollWidth, clientWidth: scrollTarget.clientWidth },
      );
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const editorData = useMemo(() => layeredToTimeline(reel, fps).editorData, [reel, fps]);

  // Source-file colour map (editor-meta.ts) — memoized per reel so it is not
  // recomputed on every render, only when the reel's video track actually
  // changes.
  const sourceColorMap = useMemo(() => sourceColors(reel), [reel]);

  // Decode waveform peaks for the audio beds + the music source.
  const audioUrls = useMemo(() => {
    const urls = reel.tracks.audio.map((a) => audioUrl(a.source));
    if (reel.tracks.music.source) urls.push(audioUrl(reel.tracks.music.source));
    return urls;
  }, [reel]);
  const { peaks } = useAudioPeaks(audioUrls);

  // Decode clip/broll source durations → the right handle can't extend past the
  // end of the footage (maxEnd on the action). Unknown durations → no bound.
  const videoUrls = useMemo(
    () => reel.tracks.video.map(videoUrl).filter((u): u is string => !!u),
    [reel],
  );
  const sourceDurations = useSourceDurations(videoUrls);

  // Starved boundaries — same predicate the render's own check reads (see
  // handle-room.ts), so the hatched block and the diagnostics list can never
  // disagree with what the composition will actually do.
  const diagnostics = useMemo(
    () => boundaryDiagnostics(reel, sourceDurations, fps),
    [reel, sourceDurations, fps],
  );
  const starvedTargets = useMemo(() => new Set(diagnostics.map((d) => d.targetId)), [diagnostics]);
  useEffect(() => { onDiagnostics?.(diagnostics); }, [diagnostics, onDiagnostics]);
  // Right-edge trim cap (ms) per video id. Shared with the inspector — see
  // `footageCapsById`, which owns the rule and the reasons for it.
  const capMsById = useMemo(
    () => footageCapsById(reel, savedReel, sourceDurations, videoUrl),
    [reel, sourceDurations, savedReel],
  );

  // Derived music-volume envelope (same shared fn the composition renders from).
  const envelope = useMemo(() => computeMusicEnvelope(reel, { fps }), [reel, fps]);
  // The music BLOCK's span in frames (its explicit out-point when trimmed, else
  // the content end) — the envelope must be x-scaled to the block, not the reel.
  const musicFrames = Math.round(((reel.tracks.music.endMs ?? reel.meta.totalDurationMs) / 1000) * fps);
  // Decoded duration of the music source (via its peaks buffer) — caps the
  // music bed's end-trim at the real end of the audio file.
  const musicMaxMs = useMemo(() => {
    const src = reel.tracks.music.source;
    const p = src ? peaks.get(audioUrl(src)) : undefined;
    return p && p.length > 0 ? (p.length / PEAKS_PER_SEC) * 1000 : undefined;
  }, [reel, peaks]);

  // Real-time resize bounds (seconds) for the action being resized RIGHT NOW.
  // xzdarcy applies an action's minStart/maxEnd as a live drag clamp — the
  // handle physically stops at the boundary instead of overshooting and snapping
  // back. But those bounds also constrain MOVES, so we inject them only for the
  // duration of a resize gesture (set on resize-start, cleared on resize-end);
  // at rest every action is unbounded and moves freely.
  const [resizeBound, setResizeBound] = useState<{ id: string; minStart: number; maxEnd?: number } | null>(null);
  // Which handle is being dragged RIGHT NOW (null at rest). A waveform anchors to
  // the FIXED edge so its samples hold in place during a trim: dragging the LEFT
  // handle fixes the right edge (anchor right), the RIGHT handle fixes the left
  // (anchor left). Only affects the block actually being resized (others keep
  // block-width == waveform-width, so the anchor is a no-op for them).
  const [resizeDir, setResizeDir] = useState<'left' | 'right' | null>(null);
  // The action under an in-flight gesture (move, resize or slip). Only its
  // stacking changes — set on start, cleared on end, so no per-move re-render.
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const waveAnchor: 'left' | 'right' = resizeDir === 'left' ? 'right' : 'left';

  // A LINKED audio bed follows its clip 1:1, so it can't be trimmed or moved on
  // its own — its handles are disabled (like the greyed Trim in/out fields) until
  // it's unlinked. Action ids of every currently-linked bed.
  const linkedAudioIds = useMemo(
    () => new Set(reel.tracks.audio.filter((a) => a.followsVideoId).map((a) => `audio:${a.id}`)),
    [reel],
  );

  // Mark the selected action so xzdarcy highlights it.
  const data: TimelineRow[] = useMemo(
    () =>
      editorData.map((r) => ({
        ...r,
        rowHeight: r.id === 'transitions' ? TRANSITIONS_ROW_H : ROW_H,
        // Keep every action movable so it stays clickable/selectable — xzdarcy
        // suppresses onClickAction on movable:false actions. Locked lanes (see
        // `LOCKED_LANES` in refusal.ts: brand = content-end-derived span,
        // transitions = derived from adjacent clips' transitionOut) and linked
        // audio get flexible:false to hide the resize handles; their move is
        // also blocked in onActionMoving below (movable:true is only for the
        // click affordance). Music is NOT in `LOCKED_LANES` — the single bed
        // is pinned at 0 (no move, no left trim) but its END is trimmable, so
        // it keeps flexible:true here and is refused by the music-specific
        // guards instead (moveRefusal's `lane === 'music'` case, and the
        // right-handle bound below).
        actions: r.actions.map((a) => ({
          ...a,
          selected: a.id === selectedId,
          flexible: !LOCKED_LANES.has(laneOfRow(r.id)) && !linkedAudioIds.has(a.id),
          movable: true,
          // Live resize clamp for the action under the handle (this gesture only).
          ...(resizeBound && resizeBound.id === a.id
            ? { minStart: resizeBound.minStart, maxEnd: resizeBound.maxEnd }
            : {}),
        })),
      })),
    [editorData, selectedId, resizeBound, linkedAudioIds],
  );

  const effects: Record<string, TimelineEffect> = useMemo(() => {
    const e: Record<string, TimelineEffect> = {};
    for (const r of editorData) for (const a of r.actions) e[a.effectId] = { id: a.effectId, name: a.effectId };
    return e;
  }, [editorData]);

  // The element that actually scrolls horizontally (react-virtualized's grid,
  // inside xzdarcy's edit area). Looked up lazily and cached: it is the only
  // honest source of scrollLeft/clientWidth/scrollWidth, and xzdarcy's
  // TimelineState exposes a setter but no getter for any of the three.
  //
  // SCOPED TO THE EDIT AREA ON PURPOSE. There are two `.ReactVirtualized__Grid`
  // nodes in this tree and the RULER's comes first, so an unscoped querySelector
  // measures the time area instead of the track area setScrollLeft moves.
  const scrollElRef = useRef<HTMLElement | null>(null);
  const scrollEl = (): HTMLElement | null => {
    if (scrollElRef.current?.isConnected) return scrollElRef.current;
    const root = stateRef.current?.target ?? rootRef.current;
    scrollElRef.current = root?.querySelector<HTMLElement>('.timeline-editor-edit-area .ReactVirtualized__Grid') ?? null;
    return scrollElRef.current;
  };

  // The react-virtualized Grid instance backing `scrollEl()`'s node — reached
  // by walking the React fiber tree (see `findGridInstance`'s doc comment for
  // why this reaches into two libraries' internals, and the measured numbers
  // that justify it). Cached the same way `scrollEl` caches its own node,
  // keyed off THAT node so a remount (which changes what `scrollEl()`
  // returns, including its `isConnected` re-lookup) invalidates the cached
  // instance rather than handing back a detached one.
  const gridInstanceRef = useRef<{ node: HTMLElement; instance: GridInstance | null } | null>(null);
  const gridInstance = (): GridInstance | null => {
    const node = scrollEl();
    if (!node) return null;
    const cached = gridInstanceRef.current;
    if (cached && cached.node === node && node.isConnected) return cached.instance;
    const instance = findGridInstance(node);
    gridInstanceRef.current = { node, instance };
    return instance;
  };

  // The zoom-buttons/keyboard-shortcut escape hatch (see LayeredTimelineHandle
  // above the props interface). No cursor to anchor on, so the centre of the
  // viewport stands in for it — captured here, synchronously, the same way
  // the wheel handler captures a pointer position, and fed into the SAME
  // pendingZoom + layout-effect path below.
  //
  // The caller passes the ACHIEVED factor (post-clamp), never the requested
  // one — see `onZoom`'s doc comment for why the distinction matters. A `1`
  // means the zoom was a no-op (already at ZOOM_MIN/ZOOM_MAX): fold nothing in
  // and leave any earlier capture alone, exactly as the wheel handler's own
  // no-op branch does, and for the same reason — clearing it would discard a
  // live gesture's accumulated anchor the moment the gesture touched the
  // ceiling.
  useImperativeHandle(ref, () => ({
    zoomAtCenter: (factor: number) => {
      if (Math.abs(factor - 1) < 1e-9) return;
      const el = scrollEl();
      if (!el) return;
      // Same accumulation as the wheel handler — a fast run of toolbar/keyboard
      // zooms (or one racing an in-flight wheel gesture) can also land more than
      // one capture before the layout effect consumes it.
      pendingZoom.current = accumulateZoom(
        pendingZoom.current,
        el.clientWidth / 2,
        factor,
        { scrollLeft: el.scrollLeft, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth },
      );
    },
  }), []);

  // Applies a pending zoom's anchor once React has committed at the new
  // scale — keyed on `scaleWidth` because that is the value whose change
  // means a new layout is due. `pendingZoom` was captured BEFORE that
  // happened (wheel handler above, or `zoomAtCenter`), so `applyZoomLayout`
  // reads the captured view rather than re-measuring `scrollEl()` here, which
  // by now reflects the NEW scale and would double-apply the zoom.
  //
  // xzdarcy never recomputes react-virtualized's Grid on a `scaleWidth`
  // change on its own (see the block above `GridInstance`) — the rows and
  // clips stay laid out at whatever scale was current the last time the DATA
  // changed. `applyZoomLayout` forces that recompute first, then applies the
  // anchor; see its own doc comment for why those two steps can't both run
  // synchronously in this one effect.
  useLayoutEffect(() => {
    applyZoomLayout({
      grid: gridInstance(),
      pendingRef: pendingZoom,
      setScrollLeft: (n) => stateRef.current?.setScrollLeft(n),
    });
  }, [scaleWidth]);

  // Keep the playhead in view. Without this a seek (⏮/⏭, a jump, or playback
  // running off the right edge) moves the cursor while the timeline stays where
  // it was, so the reel appears not to respond at all. Scrolling goes through
  // TimelineState.setScrollLeft — the official setter, which also keeps the
  // ruler and the beat-guide layer in step; the DOM element above is read-only
  // here, used purely to measure.
  const followPlayhead = (timeSec: number) => {
    const el = scrollEl();
    if (!el) return;
    const cursorX = TIMELINE_START_LEFT + timeSec * scaleWidth;
    const next = followScrollLeft(cursorX, {
      scrollLeft: el.scrollLeft,
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
    });
    if (next !== null) stateRef.current?.setScrollLeft(next);
  };

  // Player → timeline cursor, driven IMPERATIVELY off the player's frameupdate
  // so playback doesn't re-render this component every frame (the parent's
  // per-frame frame state no longer flows in as a prop; see the memo wrapper).
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onFrame = (e: { detail: { frame: number } }) => {
      const t = e.detail.frame / fps;
      stateRef.current?.setTime(t);
      followPlayhead(t);
    };
    player.addEventListener('frameupdate', onFrame);
    player.addEventListener('seeked', onFrame);
    return () => {
      player.removeEventListener('frameupdate', onFrame);
      player.removeEventListener('seeked', onFrame);
    };
    // followPlayhead closes over scaleWidth — re-subscribe on zoom so the
    // cursor's px position is computed at the CURRENT scale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerRef, fps, scaleWidth]);

  const beginSlip = (e: ReactPointerEvent<HTMLDivElement>, actionId: string) => {
    // button !== 0 excludes alt+right-click: that opens the native context
    // menu, which can swallow the pointerup and leave slipRef stuck set (the
    // next pointer to cross ANY block would then slip the wrong clip from a
    // stale x0/base — see the whole-branch review finding this guards against).
    if (e.button !== 0 || !e.altKey) return;
    const { lane, id } = parseActionId(actionId);
    if (lane !== 'video') return;
    const item = reel.tracks.video.find((v) => v.id === id);
    if (!isSlippable(item)) return;
    // Keep xzdarcy out: without this it starts its own move on the same press.
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    slipRef.current = { id, x0: e.clientX, base: reel };
    // Slip never reaches xzdarcy's own start/end callbacks (the capture-phase
    // stopPropagation above is what keeps it out), so it marks itself active.
    setActiveActionId(actionId);
    // Feedback needs a live frame FROM THIS CLIP. If the playhead is already
    // inside it, leave it — the user chose that reference frame.
    const nowMs = ((playerRef.current?.getCurrentFrame() ?? 0) / fps) * 1000;
    if (nowMs < item.startMs || nowMs >= item.endMs) {
      playerRef.current?.seekTo(Math.round((item.startMs / 1000) * fps));
    }
  };

  const moveSlip = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = slipRef.current;
    if (!s) return;
    // Resolve against s.base — the reel as it stood when the gesture began —
    // not the live reel, so the conversion rate can't shift under the user
    // mid-drag. Fall back to 1 if the item can't be found (shouldn't happen;
    // beginSlip already required isSlippable to start the gesture).
    const item = s.base.tracks.video.find((v) => v.id === s.id);
    const speed = isSlippable(item) ? deriveSpeed(item) : 1;
    const deltaMs = slipDeltaMs(e.clientX - s.x0, scaleWidth, speed);
    onHint?.(slipHintFor(s.base, s.id, deltaMs, capMsById));
    onChange(slipVideoItem(s.base, s.id, deltaMs, capMsById));
  };

  const endSlip = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!slipRef.current) return;
    slipRef.current = null;
    setActiveActionId(null);
    // Same convention as onActionResizeEnd below — a hint left up past the
    // gesture that produced it reads as unrelated to the block it's still
    // hovering over.
    onHint?.(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div
      ref={rootRef}
      className="ed:flex ed:flex-col ed:h-full ed:min-h-0 ed:bg-shell ed:font-sans ed:select-none"
    >
      <style>{GRIP_CSS}</style>
      <div className="ed:flex ed:flex-auto ed:min-h-0">
      {/* Fixed lane-header column. xzdarcy renders only the track area, so the
          labels live in a parallel scroll container kept in two-way sync with
          the timeline's vertical scroll (its official scroll-sync mechanism):
          timeline scroll → list.scrollTop, list scroll → TimelineState.setScrollTop.
          The ruler spacer stays fixed on top. */}
      <div className="ed:w-[92px] ed:flex-none ed:border-r ed:border-line ed:flex ed:flex-col ed:overflow-hidden">
        <div className="ed:flex-none" style={{ height: HEADER_OFFSET }} />
        <div
          ref={listRef}
          onScroll={(e) => stateRef.current?.setScrollTop(e.currentTarget.scrollTop)}
          className="ed:flex-auto ed:overflow-y-auto ed:overflow-x-hidden"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as CSSProperties}
        >
          {/* One header per timeline ROW (lanes can span several sub-rows when
              their items overlap). The lane name shows on its first sub-row; the
              extra rows get a subtle ‘↳’ so the stack reads as one lane. */}
          {data.map((row) => {
            const lane = laneOfRow(row.id);
            const isFirst = !row.id.includes('#');
            return (
              <div
                key={row.id}
                className={`ed:flex ed:items-center ed:pl-2.5 ed:text-[11px] ed:border-b ed:border-line ed:box-border ${isFirst ? 'ed:text-ink-2' : 'ed:text-ink-3'}`}
                style={{ height: row.rowHeight ?? ROW_H }}
              >
                {isFirst ? LANE_LABELS[lane] : '↳'}
              </div>
            );
          })}
        </div>
      </div>

      <div className="ed:flex-auto ed:min-w-0 ed:overflow-hidden ed:relative">
        {guidesMs && guidesMs.length > 0 && (
          // Ticks are positioned in UNSCROLLED content coordinates (left = 12 +
          // ms·scaleWidth); the whole layer is translated by the timeline's
          // horizontal scroll (see the Timeline onScroll below) so they track
          // the ruler/clips when zoomed in. Imperative transform (not state) so
          // scrolling doesn't re-render the timeline. willChange hints the GPU.
          <div
            ref={guidesRef}
            aria-hidden
            className={`ed:absolute ed:inset-0 ed:pointer-events-none ed:z-[5] ed:will-change-transform ${
              // Prominent when snapping to beats, faint (still a manual-alignment
              // aid) when it's off.
              snapToBeats ? 'ed:opacity-100' : 'ed:opacity-[0.35]'
            }`}
          >
            {guidesMs.map((ms, i) => (
              <div
                key={i}
                data-guide-tick
                className="ed:absolute ed:inset-y-0 ed:w-px ed:bg-accent/35"
                style={{ left: TIMELINE_START_LEFT + (ms / 1000) * scaleWidth }}
              />
            ))}
          </div>
        )}
        <Timeline
          ref={stateRef}
          editorData={data}
          effects={effects}
          autoReRender
          gridSnap={snapping}
          dragLine
          rowHeight={ROW_H}
          scale={1}
          scaleWidth={scaleWidth}
          startLeft={TIMELINE_START_LEFT}
          onScroll={(param) => {
            if (listRef.current) listRef.current.scrollTop = param.scrollTop;
            // Keep the beat-guide layer aligned with horizontally-scrolled content.
            if (guidesRef.current) guidesRef.current.style.transform = `translateX(${-param.scrollLeft}px)`;
          }}
          style={{ width: '100%', height: '100%', background: 'var(--ed-color-shell)', fontFamily: FONT }}
          getActionRender={(action) => {
            if (parseActionId(action.id).lane === 'transitions') {
              // A derived marker at the cut, not a clip. Its label deliberately
              // overhangs the action box (see TransitionMarker) — the
              // `.vt-transition-action` rule in GRIP_CSS is what lets it.
              const starved = starvedTargets.has(action.id);
              return (
                <div className="vt-transition-action ed:relative ed:h-full ed:w-full">
                  <TransitionMarker
                    kind={String(action.effectId ?? '')}
                    frames={Math.round((action.end - action.start) * fps)}
                    selected={action.selected}
                    starvedMessage={starved ? diagnostics.find((d) => d.targetId === action.id)!.message : undefined}
                  />
                </div>
              );
            }
            const wf = waveformFor(action, reel, peaks);
            // Same test the gesture uses (isSlippable) — not just "is this the
            // video lane" — so the cursor never promises a slip on a kind
            // beginSlip would refuse (multi-clip/card/photo/outro).
            const { lane: blockLane, id: blockId } = parseActionId(action.id);
            const slippable = altHeld && blockLane === 'video' && isSlippable(reel.tracks.video.find((v) => v.id === blockId));
            return (
              <div
                // Marks the block being dragged so its WRAPPER can be lifted
                // above its neighbours for the duration of the gesture — see
                // GRIP_CSS. Without it, a clip dragged right disappears under the
                // clip it is being dragged over and only reappears on release.
                className={`${BLOCK_BASE_CLS} ${action.id === activeActionId ? 'vt-block vt-block-active' : 'vt-block'}`}
                style={{
                  background: blockColor(action, reel, meta, sourceColorMap),
                  outline: action.selected ? `2px solid ${EDITOR_ACCENT}` : undefined,
                  outlineOffset: -2,
                  cursor: slippable ? 'ew-resize' : undefined,
                }}
                title={action.id}
                onPointerDownCapture={(e) => beginSlip(e, action.id)}
                onPointerMove={moveSlip}
                onPointerUp={endSlip}
                onPointerCancel={endSlip}
              >
                {(() => {
                  // Trim grips on every resizable block (overlays, video, audio —
                  // not the display-only locked lanes). Same style everywhere:
                  // faint by default, brighten on hover (which edge is active at a
                  // butted seam). Video clip/broll edges also go muted when they
                  // can't extend outward (footage limit); overlays/audio have no
                  // footage bound, so their grips are never muted.
                  const { lane, id } = parseActionId(action.id);
                  if (LOCKED_LANES.has(lane)) return null;
                  if (linkedAudioIds.has(action.id)) return null; // linked bed: no trim grips
                  // Music: pinned at 0 — only the end is trimmable, so only a right grip.
                  if (lane === 'music') return <div className="vt-grip vt-grip-right" />;
                  let grips = { left: false, right: false };
                  if (lane === 'video') {
                    const gs = gripState(reel.tracks.video.find((v) => v.id === id), capMsById[id]);
                    if (!gs) return null; // item not found
                    grips = gs;
                  }
                  return (
                    <>
                      <div className={`vt-grip vt-grip-left${grips.left ? ' vt-grip-muted' : ''}`} />
                      <div className={`vt-grip vt-grip-right${grips.right ? ' vt-grip-muted' : ''}`} />
                    </>
                  );
                })()}
                {linkedAudioIds.has(action.id) && (
                  <span
                    title="Linked to its clip — unlink in the inspector to trim it on its own"
                    className="ed:absolute ed:right-[5px] ed:top-1/2 ed:-translate-y-1/2 ed:opacity-[0.85] ed:pointer-events-none ed:inline-flex"
                  >
                    <LinkIcon size={11} />
                  </span>
                )}
                {wf && (
                  <Waveform
                    peaks={wf.peaks}
                    sourceInMs={wf.sourceInMs}
                    spanMs={wf.spanMs}
                    pxPerSec={scaleWidth}
                    anchor={waveAnchor}
                  />
                )}
                {action.id.startsWith('audio:') && (
                  <VolumeLine
                    vMin={-24}
                    vMax={24}
                    volumeDb={reel.tracks.audio.find((a) => `audio:${a.id}` === action.id)?.volumeDb}
                    onChange={(db) => {
                      const audioId = action.id.slice('audio:'.length);
                      onChange({
                        ...reel,
                        tracks: {
                          ...reel.tracks,
                          audio: reel.tracks.audio.map((a) => (a.id === audioId ? { ...a, volumeDb: db } : a)),
                        },
                      });
                    }}
                  />
                )}
                {action.id.startsWith('music:') && (
                  <>
                    <MusicEnvelope points={envelope.points} totalFrames={musicFrames} />
                    {/* Draggable BASE level; the derived envelope boosts ride above it. */}
                    <VolumeLine
                      volumeDb={reel.tracks.music.baseVolumeDb}
                      color="rgba(124,92,255,0.9)"
                      resetDb={-8}
                      onChange={(db) =>
                        onChange({ ...reel, tracks: { ...reel.tracks, music: { ...reel.tracks.music, baseVolumeDb: db } } })
                      }
                    />
                  </>
                )}
                {/* pointerEvents:none — the label is the LAST child, so it sits
                    above the volume line and, being a full-height flex item,
                    swallows the pointer wherever its text runs. On a clip whose
                    name is long enough to span the block, the level is then
                    undraggable along its whole width. Nothing here is
                    interactive, so it opts out of hit-testing entirely. */}
                <span
                  className="ed:relative ed:whitespace-nowrap ed:overflow-hidden ed:text-ellipsis ed:pointer-events-none"
                  // Reads over the waveform, which is bright and dense enough to
                  // break up the glyphs behind it. A shadow rather than a
                  // backplate or a dimmer waveform: the waveform IS the useful
                  // picture on an audio block, so the label yields to it and
                  // stays legible on its own.
                  style={{ textShadow: '0 1px 2px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.65)' }}
                >
                  {timelineLabel(action, reel, fps, meta)}
                </span>
              </div>
            );
          }}
          onChange={(d) => {
            // Ripple mode: a resize shifts everything beyond the clip so the
            // timeline stays butted (end → right, start → left). Off: plain move.
            // capMsById clamps a right-edge trim at the clip's total length.
            // Snap-to-beats: on release, snap the dragged edge to the nearest
            // beat guide within SNAP_PX screen px (converted to ms via the zoom).
            onChange(
              applyTimelineChange(reel, d as TimelineRow[], {
                ripple,
                footageMsById: capMsById,
                snapMs: snapToBeats ? reel.meta.guidesMs : undefined,
                snapThresholdMs: (SNAP_PX / scaleWidth) * 1000,
                musicMaxMs,
              }),
            );
            return false; // we drive rendering via the Remotion Player, skip xzdarcy's engine sync
          }}
          // Block drag/resize on locked lanes (returning false cancels it) while
          // keeping the action clickable/selectable. `moveHintFor` is the ONE
          // place the refusing conditions live (locked lane / pinned music bed
          // / linked audio) — no second copy of the condition here, and the
          // reason it refused is published to the hint bar rather than the
          // drag just silently not moving.
          onActionMoving={({ action }) => {
            const lane = parseActionId(action.id).lane;
            const hint = moveHintFor(lane, action.id, linkedAudioIds);
            if (hint) {
              onHint?.(hint);
              return false;
            }
            return undefined;
          }}
          onActionMoveStart={({ action }) => setActiveActionId(action.id)}
          onActionMoveEnd={() => {
            setActiveActionId(null);
            // Same convention as onActionResizeEnd/endSlip: null starts the
            // host's auto-clear countdown rather than wiping the message
            // instantly, so it survives a moment after the pointer lifts. A
            // publish with no matching release sits in the bar forever — see
            // the `onHint` doc comment above.
            onHint?.(null);
          }}
          // On resize START, arm the live drag clamp for this clip/broll so its
          // handle hard-stops at the end of the FOOTAGE (a neighbour is not a
          // wall — overlaps are allowed from both sides). Cleared on END.
          // (No onActionResizing veto — the bounds do the stopping in real time.)
          onActionResizeStart={({ action, dir }) => {
            setResizeDir(dir); // anchor the waveform to the fixed (opposite) edge
            setActiveActionId(action.id); // paint it above the clip it may run into
            const { lane, id } = parseActionId(action.id);
            if (lane === 'music') {
              // Right-edge cap = real end of the audio file (when decoded);
              // minStart 0 keeps a (springing-back) left drag inside the reel.
              return setResizeBound({ id: action.id, minStart: 0, maxEnd: musicMaxMs !== undefined ? musicMaxMs / 1000 : undefined });
            }
            if (lane !== 'video') return setResizeBound(null);
            const item = reel.tracks.video.find((v) => v.id === id);
            // The real-time bound uses the SAME cap as the commit clamp: the
            // clip's total length (max of the decoded file and its authored out).
            const b = item ? resizeBoundsMs(item, capMsById[id]) : null;
            setResizeBound(b ? { id: action.id, minStart: b.minStartMs / 1000, maxEnd: b.maxEndMs !== undefined ? b.maxEndMs / 1000 : undefined } : null);
          }}
          // Reports WHY the handle is at its limit, live during the drag —
          // xzdarcy's bounds (armed above) already stop the handle physically;
          // this only explains the stop. `posMs` is the edge xzdarcy reports
          // AFTER its own live clamp (see the comment on `resizeBound` above),
          // so comparing it against the same bound with a one-frame tolerance
          // is safe. IMPORTANT: pass `capMsById[id]`, not a raw decoded
          // duration — it's the same cap the armed bound above and the commit
          // clamp both use (max of the decoded file and the clip's authored
          // out-point), so a clip whose config has drifted past its file
          // reports the limit the user actually hit, not one they never did.
          onActionResizing={({ action, start, end, dir }) => {
            onHint?.(resizeHintFor({ reel, capMsById, fps, musicMaxMs }, { actionId: action.id, start, end, dir }));
          }}
          onActionResizeEnd={() => {
            setResizeBound(null);
            setResizeDir(null);
            setActiveActionId(null);
            // Null here means "gesture ended" — the host starts its
            // auto-clear countdown rather than wiping the message instantly,
            // so it survives a moment after the pointer lifts. See the
            // `onHint` doc comment above.
            onHint?.(null);
          }}
          onClickAction={(_e, { action }) => onSelect(action.id)}
          onClickTimeArea={(time) => {
            playerRef.current?.seekTo(Math.round(time * fps));
            return true;
          }}
          onCursorDrag={(time) => playerRef.current?.seekTo(Math.round(time * fps))}
        />
      </div>
      </div>
      {/* Derived from the shortcut registry, so it cannot drift from the
          bindings. Kept to ONE line (flex-none h-5 + whitespace-nowrap +
          overflow-hidden — load-bearing: a second line here costs timeline
          height). The colour-key legend that used to ride in this same row
          was removed — the user found it unneeded. */}
      <div
        data-testid="timeline-shortcut-bar"
        className="ed:flex-none ed:h-5 ed:flex ed:items-center ed:gap-4 ed:px-3 ed:py-1 ed:border-t ed:border-line ed:text-[11px] ed:text-ink-3 ed:whitespace-nowrap ed:overflow-hidden"
      >
        {hint ? (
          <span
            data-testid="timeline-hint"
            title={hint.text}
            aria-live="polite"
            className={hint.severity === 'error' ? 'ed:text-danger' : hint.severity === 'warn' ? 'ed:text-warn' : 'ed:text-ink-2'}
          >
            {hint.text}
          </span>
        ) : (
          <>
            {[...SHORTCUTS.filter((s) => s.group === 'Timeline'), ...GESTURES].map((s) => (
              <span key={s.keys}>
                <span className="ed:font-mono ed:text-ink-2">{s.keys}</span> — {s.label}
              </span>
            ))}
            <span><span className="ed:font-mono ed:text-ink-2">?</span> — all shortcuts</span>
          </>
        )}
      </div>
    </div>
  );
}

// Memoized: during playback the parent re-renders every frame (timecode), but
// the timeline's props are stable (reel changes only on edit), so it skips
// those re-renders and updates its cursor imperatively instead.
export const LayeredTimeline = memo(forwardRef(LayeredTimelineImpl));
