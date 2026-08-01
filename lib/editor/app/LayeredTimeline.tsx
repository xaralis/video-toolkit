import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject, CSSProperties } from 'react';
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

// The trim handles are xzdarcy's own invisible stretch zones; these grips are a
// visual layer on top (pointer-events:none so the real handles still drag).
// Default: faint. Hover the block: its grips brighten (shows WHICH clip's handle
// you'll grab at a butted seam). Muted: hatched + dim (this edge can't extend).
const GRIP_CSS = `
.vt-grip { position: absolute; top: 4px; bottom: 4px; width: 5px; border-radius: 2px; pointer-events: none; background: rgba(255,255,255,0.30); transition: background 0.12s ease, box-shadow 0.12s ease; }
.vt-grip-left { left: 2px; }
.vt-grip-right { right: 2px; }
.timeline-editor-action:hover .vt-grip { background: rgba(255,255,255,0.92); box-shadow: 0 0 0 1px rgba(0,0,0,0.35); }
.vt-grip-muted, .timeline-editor-action:hover .vt-grip-muted { background: repeating-linear-gradient(45deg, rgba(255,255,255,0.16) 0 2px, rgba(255,255,255,0) 2px 4px); box-shadow: none; }
`;

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
const TRANSITION_MARKER_COLOR = '#c9a227';

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
  /** ⌘/Ctrl + wheel (or pinch) over the timeline. `dir` is +1 to zoom in, -1 out. */
  onZoom?: (dir: number) => void;
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
}: LayeredTimelineProps) {
  const stateRef = useRef<TimelineState>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const guidesRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

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
      if (e.deltaY !== 0) onZoomRef.current?.(e.deltaY < 0 ? 1 : -1);
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

  // Player → timeline cursor, driven IMPERATIVELY off the player's frameupdate
  // so playback doesn't re-render this component every frame (the parent's
  // per-frame frame state no longer flows in as a prop; see the memo wrapper).
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onFrame = (e: { detail: { frame: number } }) => stateRef.current?.setTime(e.detail.frame / fps);
    player.addEventListener('frameupdate', onFrame);
    player.addEventListener('seeked', onFrame);
    return () => {
      player.removeEventListener('frameupdate', onFrame);
      player.removeEventListener('seeked', onFrame);
    };
  }, [playerRef, fps]);

  return (
    <div
      ref={rootRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        background: '#161719',
        fontFamily: FONT,
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <style>{GRIP_CSS}</style>
      <div style={{ display: 'flex', flex: '1 1 auto', minHeight: 0 }}>
      {/* Fixed lane-header column. xzdarcy renders only the track area, so the
          labels live in a parallel scroll container kept in two-way sync with
          the timeline's vertical scroll (its official scroll-sync mechanism):
          timeline scroll → list.scrollTop, list scroll → TimelineState.setScrollTop.
          The ruler spacer stays fixed on top. */}
      <div style={{ width: 92, flex: 'none', borderRight: '1px solid #2a2c32', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ height: HEADER_OFFSET, flex: 'none' }} />
        <div
          ref={listRef}
          onScroll={(e) => stateRef.current?.setScrollTop(e.currentTarget.scrollTop)}
          style={
            { flex: '1 1 auto', overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'none', msOverflowStyle: 'none' } as CSSProperties
          }
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
                style={{
                  height: row.rowHeight ?? ROW_H,
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 10,
                  fontSize: 11,
                  color: isFirst ? '#9a9da5' : '#61646c',
                  borderBottom: '1px solid #202227',
                  boxSizing: 'border-box',
                }}
              >
                {isFirst ? LANE_LABELS[lane] : '↳'}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', position: 'relative' }}>
        {guidesMs && guidesMs.length > 0 && (
          // Ticks are positioned in UNSCROLLED content coordinates (left = 12 +
          // ms·scaleWidth); the whole layer is translated by the timeline's
          // horizontal scroll (see the Timeline onScroll below) so they track
          // the ruler/clips when zoomed in. Imperative transform (not state) so
          // scrolling doesn't re-render the timeline. willChange hints the GPU.
          <div
            ref={guidesRef}
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              zIndex: 5,
              willChange: 'transform',
              // Prominent when snapping to beats, faint (still a manual-alignment
              // aid) when it's off.
              opacity: snapToBeats ? 1 : 0.35,
            }}
          >
            {guidesMs.map((ms, i) => (
              <div
                key={i}
                data-guide-tick
                style={{
                  position: 'absolute', top: 0, bottom: 0,
                  left: 12 + (ms / 1000) * scaleWidth, // 12 = <Timeline startLeft>
                  width: 1, background: 'rgba(182,255,90,0.35)',
                }}
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
          startLeft={12}
          onScroll={(param) => {
            if (listRef.current) listRef.current.scrollTop = param.scrollTop;
            // Keep the beat-guide layer aligned with horizontally-scrolled content.
            if (guidesRef.current) guidesRef.current.style.transform = `translateX(${-param.scrollLeft}px)`;
          }}
          style={{ width: '100%', height: '100%', background: '#161719', fontFamily: FONT }}
          getActionRender={(action) => {
            if (parseActionId(action.id).lane === 'transitions') {
              // A derived marker at the cut, not a clip — small centered pill
              // rather than the full-block styling used below.
              return (
                <div
                  style={{
                    position: 'relative',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 6px',
                    borderRadius: 999,
                    background: TRANSITION_MARKER_COLOR,
                    color: '#1a1a1a',
                    fontFamily: FONT,
                    fontSize: 10,
                    overflow: 'hidden',
                    boxShadow: action.selected ? 'inset 0 0 0 2px #e8e8ea' : undefined,
                  }}
                  title={action.id}
                >
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {timelineLabel(action, reel, fps, meta)}
                  </span>
                </div>
              );
            }
            const wf = waveformFor(action, reel, peaks);
            return (
              <div
                style={{
                  position: 'relative',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 6px',
                  borderRadius: 3,
                  background: blockColor(action, reel, meta),
                  color: '#f2f2f2',
                  fontFamily: FONT,
                  fontSize: 11,
                  overflow: 'hidden',
                  boxShadow: action.selected ? 'inset 0 0 0 2px #e8e8ea' : undefined,
                }}
                title={action.id}
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
                    style={{ position: 'absolute', right: 5, top: '50%', transform: 'translateY(-50%)', fontSize: 11, opacity: 0.85, pointerEvents: 'none' }}
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
                      color="rgba(182,255,90,0.9)"
                      resetDb={-8}
                      onChange={(db) =>
                        onChange({ ...reel, tracks: { ...reel.tracks, music: { ...reel.tracks.music, baseVolumeDb: db } } })
                      }
                    />
                  </>
                )}
                <span style={{ position: 'relative', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
          // On resize START, arm the live drag clamp for this clip/broll so its
          // handle hard-stops at the footage window / next clip. Cleared on END.
          // (No onActionResizing veto — the bounds do the stopping in real time.)
          onActionResizeStart={({ action, dir }) => {
            setResizeDir(dir); // anchor the waveform to the fixed (opposite) edge
            const { lane, id } = parseActionId(action.id);
            if (lane === 'music') {
              // Right-edge cap = real end of the audio file (when decoded);
              // minStart 0 keeps a (springing-back) left drag inside the reel.
              return setResizeBound({ id: action.id, minStart: 0, maxEnd: musicMaxMs !== undefined ? musicMaxMs / 1000 : undefined });
            }
            if (lane !== 'video') return setResizeBound(null);
            const idx = reel.tracks.video.findIndex((v) => v.id === id);
            const item = reel.tracks.video[idx];
            // The real-time bound uses the SAME cap as the commit clamp: the
            // clip's total length (max of the decoded file and its authored out).
            const b = item ? resizeBoundsMs(item, capMsById[id], reel.tracks.video[idx + 1]?.startMs) : null;
            setResizeBound(b ? { id: action.id, minStart: b.minStartMs / 1000, maxEnd: b.maxEndMs !== undefined ? b.maxEndMs / 1000 : undefined } : null);
          }}
          onActionResizeEnd={() => {
            setResizeBound(null);
            setResizeDir(null);
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
      <div
        style={{
          flex: 'none',
          height: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '0 12px',
          borderTop: '1px solid #2a2c32',
          fontSize: 10.5,
          color: '#6b6f78',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
      >
        <span>
          <span style={{ color: ripple ? '#b6ff5a' : '#9a9a95' }}>Ripple {ripple ? 'on' : 'off'}</span>
          {ripple ? ' — resize shifts the rest; drag re-orders and never leaves a gap' : ' — drag and resize move only what you grab'}
        </span>
        <span>
          <span style={{ color: '#9a9a95' }}>Drag the volume line</span> — set level (double-click to reset)
        </span>
        <span>
          <span style={{ color: '#9a9a95' }}>⌘/Ctrl + scroll</span> — zoom the timeline
        </span>
        <span>
          <span style={{ color: '#9a9a95' }}>⌫</span> delete · <span style={{ color: '#9a9a95' }}>⌘Z</span> undo
        </span>
      </div>
    </div>
  );
}

// Memoized: during playback the parent re-renders every frame (timecode), but
// the timeline's props are stable (reel changes only on edit), so it skips
// those re-renders and updates its cursor imperatively instead.
export const LayeredTimeline = memo(LayeredTimelineImpl);
