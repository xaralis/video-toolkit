import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject, CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
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
  isSlippable,
  type LaneId,
} from '../src/timeline/layered-adapter';
import { stripAccents } from './accent';
import { useAudioPeaks, PEAKS_PER_SEC } from './useAudioPeaks';
import { useSourceDurations } from './useSourceDurations';
import { Waveform, VolumeLine } from './Waveform';
import { MusicEnvelope } from './MusicEnvelope';
import { computeMusicEnvelope } from '@video-toolkit/lib/reel-config-base/music-envelope';
import { resolveMediaSource, type MediaRole } from '@video-toolkit/lib/theming/media-source';
import { humanizeKey, stableColor, type EditorMeta } from './editor-meta';
import { handleRoomFrames, boundaryState, starvationMessage, type HandleRoom } from '@video-toolkit/lib/reel-config-base/handle-room';

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
const CORE_LANE_COLOR: Record<string, string> = {
  'video-clip': '#3b6ea5',
  'video-broll': '#2f7d4f',
  'video-photo': '#3f6a7d',
  'video-multi-clip': '#6a4fa5',
  'video-card': '#8a6d1f',
  'video-outro': '#4a4c54',
  audio: '#2a8f8f',
  music: '#7a5cae',
  'brand-watermark': '#4a4c54',
  'brand-disclaimer': '#4a4c54',
};
export const colorFor = (effectId: string, meta?: EditorMeta) =>
  meta?.laneColors?.[effectId] ?? CORE_LANE_COLOR[effectId] ?? stableColor(effectId);

// A block's fill. A LINKED audio bed (followsVideoId) takes its clip's colour so
// the pair reads as one unit; everything else uses its own effect colour.
function blockColor(action: TimelineAction, reel: LayeredReel, meta?: EditorMeta): string {
  const { lane, id } = parseActionId(action.id);
  if (lane === 'audio') {
    const a = reel.tracks.audio.find((x) => x.id === id);
    const v = a?.followsVideoId ? reel.tracks.video.find((x) => x.id === a.followsVideoId) : undefined;
    if (v) return colorFor(`video-${v.kind}`, meta);
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
// Matches Premiere/Resolve. `scaleWidth` is px per second.
// `|| 0` normalizes the `-0` that `-(0 / scaleWidth) * 1000` produces for
// dxPx===0 back to `+0` — Object.is (and so `toBe(0)`) treats them as unequal.
export function slipDeltaMs(dxPx: number, scaleWidth: number): number {
  return -(dxPx / scaleWidth) * 1000 || 0;
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
const TIMELINE_START_LEFT = 12;

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
`;

// Video/audio block base look (position/height/layout/typography — every
// constant part of the block's style). `background` (per-item colour),
// `boxShadow` (selection ring) and `cursor` (slip affordance) stay inline —
// see the getActionRender block below — because they vary per action.
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
// Transition marker fill/ink — `--color-transition-marker(-ink)` in
// editor.in.css's `@theme static` block, used below as `ed:bg-transition-marker`
// / `ed:text-transition-marker-ink`.

// Lanes whose items are display-only (their span is derived / not an item
// array): brand span is content-end-derived, transitions are derived from
// adjacent clips' `transitionOut`. Music is NOT fully locked: the single bed
// is pinned at 0 (no move, no left trim) but its END is trimmable — see the
// music-specific guards below.
const LOCKED_LANES = new Set(['brand', 'transitions']);

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
   *  wheel actually moved — not a direction. See ZOOM_PER_PX. */
  onZoom?: (factor: number) => void;
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
}: LayeredTimelineProps) {
  const stateRef = useRef<TimelineState>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const guidesRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // An in-flight slip. `base` is the reel as it was when the gesture STARTED, so
  // every move re-derives from it rather than accumulating — no drift, and the
  // clamp stays honest at the edges. History coalesces the stream of commits
  // into one undo step (useHistory.ts:5-8).
  const slipRef = useRef<{ id: string; x0: number; base: LayeredReel } | null>(null);

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
      if (f !== 1) onZoomRef.current?.(f);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const editorData = useMemo(() => layeredToTimeline(reel, fps).editorData, [reel, fps]);

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
  // Right-edge trim cap (ms) per video id — the clip's "total length": the LARGER
  // of the real decoded file duration and the AUTHORED out-point (from the saved
  // reel). A clip whose cut holds its last frame past the file end (an authored
  // sourceOutMs > the file, e.g. seg-002: file 10.042s, authored 10.3s) can be
  // trimmed and restored back to that authored length; a normally-trimmed clip
  // can be extended out to reveal its full real footage. Never past either.
  const capMsById = useMemo(() => {
    const savedOut = (id: string): number => {
      const s = savedReel?.tracks.video.find((v) => v.id === id);
      return s && (s.kind === 'clip' || s.kind === 'broll') ? s.sourceOutMs : 0;
    };
    const m: Record<string, number> = {};
    for (const v of reel.tracks.video) {
      if (v.kind !== 'clip' && v.kind !== 'broll') continue;
      const url = videoUrl(v);
      const decoded = (url ? sourceDurations[url] : 0) || 0;
      // Fall back to the item's own sourceOutMs for a clip added this session
      // (not in the saved reel yet).
      const authored = savedOut(v.id) || v.sourceOutMs || 0;
      const cap = Math.max(decoded, authored);
      if (cap > 0) m[v.id] = cap;
    }
    return m;
  }, [reel, sourceDurations, savedReel]);

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
        // suppresses onClickAction on movable:false actions. Locked lanes (brand
        // = content-end-derived span; music = single base layer) and linked audio
        // get flexible:false to hide the resize handles; their move is also blocked
        // in onActionMoving below (movable:true is only for the click affordance).
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
    onChange(slipVideoItem(s.base, s.id, slipDeltaMs(e.clientX - s.x0, scaleWidth), capMsById));
  };

  const endSlip = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!slipRef.current) return;
    slipRef.current = null;
    setActiveActionId(null);
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
              // A derived marker at the cut, not a clip — small centered pill
              // rather than the full-block styling used below.
              const starved = starvedTargets.has(action.id);
              return (
                <div
                  className="ed:relative ed:h-full ed:flex ed:items-center ed:justify-center ed:px-1.5 ed:rounded-full ed:bg-transition-marker ed:text-transition-marker-ink ed:font-sans ed:text-[10px] ed:overflow-hidden"
                  style={{ boxShadow: action.selected ? 'inset 0 0 0 2px var(--ed-color-ink)' : undefined }}
                  title={starved ? diagnostics.find((d) => d.targetId === action.id)!.message : action.id}
                >
                  {/* Same hatch vocabulary as a muted trim grip ("nothing more to
                      take this way") — the fill/box-shadow still come from the
                      raw `.vt-grip-muted` rule (GRIP_CSS): the pill's own
                      background is opaque, so that rule would be invisible if it
                      competed with this div's own background instead of sitting
                      on top of it as a separate absolutely-positioned overlay. */}
                  {starved && (
                    <div className="vt-grip-muted ed:absolute ed:inset-0 ed:rounded-full" />
                  )}
                  <span className="ed:relative ed:whitespace-nowrap ed:overflow-hidden ed:text-ellipsis">
                    {timelineLabel(action, reel, fps, meta)}
                  </span>
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
                  background: blockColor(action, reel, meta),
                  boxShadow: action.selected ? 'inset 0 0 0 2px var(--ed-color-ink)' : undefined,
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
                    className="ed:absolute ed:right-[5px] ed:top-1/2 ed:-translate-y-1/2 ed:text-[11px] ed:opacity-[0.85] ed:pointer-events-none"
                  >
                    🔒
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
          // keeping the action clickable/selectable.
          onActionMoving={({ action }) => {
            const lane = parseActionId(action.id).lane;
            // Music can be end-trimmed but never moved (it's pinned at 0).
            return LOCKED_LANES.has(lane) || lane === 'music' || linkedAudioIds.has(action.id) ? false : undefined;
          }}
          onActionMoveStart={({ action }) => setActiveActionId(action.id)}
          onActionMoveEnd={() => setActiveActionId(null)}
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
          onActionResizeEnd={() => {
            setResizeBound(null);
            setResizeDir(null);
            setActiveActionId(null);
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
      {/* Gesture legend — the timeline's non-obvious interactions. */}
      <div className="ed:flex-none ed:h-5 ed:flex ed:items-center ed:gap-4 ed:px-3 ed:border-t ed:border-line ed:text-[10.5px] ed:text-ink-2 ed:whitespace-nowrap ed:overflow-hidden">
        <span>
          <span className={ripple ? 'ed:text-accent' : 'ed:text-ink'}>Ripple {ripple ? 'on' : 'off'}</span>
          {ripple ? ' — resize shifts the rest; drag carries everything behind it' : ' — only what you grab moves'}
        </span>
        <span>
          <span className="ed:text-ink">⌥/Alt + drag a clip</span> — slip the shot inside its window
        </span>
        <span>
          <span className="ed:text-ink">Drag the volume line</span> — set level (double-click to reset)
        </span>
        <span>
          <span className="ed:text-ink">⌘/Ctrl + scroll</span> — zoom the timeline
        </span>
        <span>
          <span className="ed:text-ink">⌫</span> delete · <span className="ed:text-ink">⌘Z</span> undo
        </span>
      </div>
    </div>
  );
}

// Memoized: during playback the parent re-renders every frame (timecode), but
// the timeline's props are stable (reel changes only on edit), so it skips
// those re-renders and updates its cursor imperatively instead.
export const LayeredTimeline = memo(LayeredTimelineImpl);
