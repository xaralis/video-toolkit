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
  clipFootageCapMs,
  resizeBoundsMs,
  LANES,
  type LaneId,
} from '../src/timeline/layered-adapter';
import { stripAccents } from './accent';
import { useAudioPeaks } from './useAudioPeaks';
import { useSourceDurations } from './useSourceDurations';
import { Waveform, VolumeLine } from './Waveform';
import { MusicEnvelope } from './MusicEnvelope';
import { computeMusicEnvelope } from '@video-toolkit/lib/reel-config-base/music-envelope';

// Audio sources: bare filenames are broll/clip beds under public/recordings;
// a path (e.g. audio/bg.mp3, the music) is served from public as-is.
const audioUrl = (source: string) => (source.includes('/') ? `/${source}` : `/recordings/${source}`);

// Video source URL for a clip/broll (for intrinsic-duration decode → right-edge
// bound). Clips live under recordings/, broll footage under broll/.
const videoUrl = (item: { kind: string; source?: string }): string | null => {
  const src = item.kind === 'clip' || item.kind === 'broll' ? item.source : undefined;
  if (!src) return null;
  return src.includes('/') ? `/${src}` : item.kind === 'broll' ? `/broll/${src}` : `/recordings/${src}`;
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
const EFFECT_COLOR: Record<string, string> = {
  'video-clip': '#3b6ea5',
  'video-broll': '#2f7d4f',
  'video-multi-clip': '#6a4fa5',
  'video-card': '#8a6d1f',
  'video-outro': '#4a4c54',
  'overlay-title': '#a5432f',
  'overlay-quote-pull': '#9a7d1f',
  'overlay-stat-callout': '#2f7f9a',
  'overlay-update-badge': '#9a2f63',
  'overlay-source-tag': '#5a5c64',
  'overlay-chevron': '#7a8f1f',
  audio: '#2a8f8f',
  music: '#7a5cae',
  'brand-watermark': '#4a4c54',
  'brand-disclaimer': '#4a4c54',
};
const colorFor = (effectId: string) => EFFECT_COLOR[effectId] ?? '#5a5c64';

// ---- Per-type timeline label ----------------------------------------------
// Each lane/item type generates its own readable label (source filename, or the
// start of an overlay's text) instead of an opaque id.
const basename = (s: string | undefined) => (s ? s.split('/').pop() ?? s : '');
const snippet = (s: string, n = 22) => {
  const plain = stripAccents(s).trim();
  return plain.length > n ? `${plain.slice(0, n).trimEnd()}…` : plain;
};
const OVERLAY_KIND_LABEL: Record<string, string> = {
  'quote-pull': 'QuotePull',
  chevron: 'Chevron',
  title: 'Title',
  'stat-callout': 'Stat',
  'update-badge': 'Badge',
  'source-tag': 'Source',
  'party-logos': 'Logos',
};
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
  if (!item || (item.kind !== 'clip' && item.kind !== 'broll')) return null;
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

function timelineLabel(action: TimelineAction, reel: LayeredReel, fps: number): string {
  const { lane, id } = parseActionId(action.id);
  if (lane === 'transitions') {
    const frames = Math.round((action.end - action.start) * fps);
    return `${action.effectId} · ${frames}f`;
  }
  if (lane === 'overlays') {
    const o = reel.tracks.overlays.find((x) => x.id === id);
    const c = o?.content as { kind?: string; text?: string } | undefined;
    const kind = OVERLAY_KIND_LABEL[c?.kind ?? ''] ?? (c?.kind ?? 'Overlay');
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
// Transitions are markers at the cut, not full clips — a thinner row keeps
// the lane visually distinct from the video/audio blocks above and below it.
const TRANSITIONS_ROW_H = 18;
const TRANSITION_MARKER_COLOR = '#c9a227';

// Lanes whose items are display-only (their span is derived / not an item
// array): brand span is content-end-derived, music is a single base layer,
// transitions are derived from adjacent clips' `transitionOut`.
const LOCKED_LANES = new Set(['brand', 'music', 'transitions']);

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
}: LayeredTimelineProps) {
  const stateRef = useRef<TimelineState>(null);
  const listRef = useRef<HTMLDivElement>(null);

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
  // Right-edge trim cap (ms) per video id. Fed into applyTimelineChange so a
  // right-edge resize CLAMPS the out-point at the media end instead of the
  // timeline UI vetoing the gesture (a veto misfires when the block's endMs has
  // drifted past its footage — e.g. a config sourceOutMs that overshoots the
  // real file — and freezes the whole clip). Only CLIPS are capped; a broll is
  // a container that holds its last frame, so it extends freely (clipFootageCapMs).
  const footageMsById = useMemo(() => {
    const m: Record<string, number> = {};
    for (const v of reel.tracks.video) {
      const url = videoUrl(v);
      const cap = clipFootageCapMs(v, url ? sourceDurations[url] : undefined);
      if (cap !== undefined) m[v.id] = cap;
    }
    return m;
  }, [reel, sourceDurations]);

  // Derived music-volume envelope (same shared fn the composition renders from).
  const envelope = useMemo(() => computeMusicEnvelope(reel, { fps }), [reel, fps]);
  const totalFrames = Math.round((reel.meta.totalDurationMs / 1000) * fps);

  // Real-time resize bounds (seconds) for the action being resized RIGHT NOW.
  // xzdarcy applies an action's minStart/maxEnd as a live drag clamp — the
  // handle physically stops at the boundary instead of overshooting and snapping
  // back. But those bounds also constrain MOVES, so we inject them only for the
  // duration of a resize gesture (set on resize-start, cleared on resize-end);
  // at rest every action is unbounded and moves freely.
  const [resizeBound, setResizeBound] = useState<{ id: string; minStart: number; maxEnd?: number } | null>(null);

  // Mark the selected action so xzdarcy highlights it.
  const data: TimelineRow[] = useMemo(
    () =>
      editorData.map((r) => ({
        ...r,
        rowHeight: r.id === 'transitions' ? TRANSITIONS_ROW_H : ROW_H,
        // Keep every action movable so it stays clickable/selectable — xzdarcy
        // suppresses onClickAction on movable:false actions. Locked lanes (brand
        // = content-end-derived span; music = single base layer) get flexible:false
        // to hide the resize handles, and their move is also blocked in
        // onActionMoving below (movable:true is only for the click affordance).
        actions: r.actions.map((a) => ({
          ...a,
          selected: a.id === selectedId,
          flexible: !LOCKED_LANES.has(r.id),
          movable: true,
          // Live resize clamp for the action under the handle (this gesture only).
          ...(resizeBound && resizeBound.id === a.id
            ? { minStart: resizeBound.minStart, maxEnd: resizeBound.maxEnd }
            : {}),
        })),
      })),
    [editorData, selectedId, resizeBound],
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
          {LANES.map((lane) => (
            <div
              key={lane}
              style={{
                height: lane === 'transitions' ? TRANSITIONS_ROW_H : ROW_H,
                display: 'flex',
                alignItems: 'center',
                paddingLeft: 10,
                fontSize: 11,
                color: '#9a9da5',
                borderBottom: '1px solid #202227',
                boxSizing: 'border-box',
              }}
            >
              {LANE_LABELS[lane]}
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden' }}>
        <Timeline
          ref={stateRef}
          editorData={data}
          effects={effects}
          autoReRender
          gridSnap
          dragLine
          rowHeight={ROW_H}
          scale={1}
          scaleWidth={scaleWidth}
          startLeft={12}
          onScroll={(param) => {
            if (listRef.current) listRef.current.scrollTop = param.scrollTop;
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
                    {timelineLabel(action, reel, fps)}
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
                  background: colorFor(action.effectId),
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
                  let grips = { left: false, right: false };
                  if (lane === 'video') {
                    const gs = gripState(reel.tracks.video.find((v) => v.id === id), footageMsById[id]);
                    if (!gs) return null; // multi-clip / card / outro: no single-source trim
                    grips = gs;
                  }
                  return (
                    <>
                      <div className={`vt-grip vt-grip-left${grips.left ? ' vt-grip-muted' : ''}`} />
                      <div className={`vt-grip vt-grip-right${grips.right ? ' vt-grip-muted' : ''}`} />
                    </>
                  );
                })()}
                {wf && <Waveform peaks={wf.peaks} sourceInMs={wf.sourceInMs} spanMs={wf.spanMs} />}
                {action.id.startsWith('audio:') && (
                  <VolumeLine
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
                    <MusicEnvelope points={envelope.points} totalFrames={totalFrames} />
                    {/* Draggable BASE level (lime); the derived envelope boosts ride above it. */}
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
                  {timelineLabel(action, reel, fps)}
                </span>
              </div>
            );
          }}
          onChange={(d) => {
            // Ripple mode: a resize shifts everything beyond the clip so the
            // timeline stays butted (end → right, start → left). Off: plain move.
            // footageMsById clamps a right-edge trim at the real media end.
            onChange(applyTimelineChange(reel, d as TimelineRow[], { ripple, footageMsById }));
            return false; // we drive rendering via the Remotion Player, skip xzdarcy's engine sync
          }}
          // Block drag/resize on locked lanes (returning false cancels it) while
          // keeping the action clickable/selectable.
          onActionMoving={({ action }) => (LOCKED_LANES.has(parseActionId(action.id).lane) ? false : undefined)}
          // On resize START, arm the live drag clamp for this clip/broll so its
          // handle hard-stops at the footage window / next clip. Cleared on END.
          // (No onActionResizing veto — the bounds do the stopping in real time.)
          onActionResizeStart={({ action }) => {
            const { lane, id } = parseActionId(action.id);
            if (lane !== 'video') return setResizeBound(null);
            const idx = reel.tracks.video.findIndex((v) => v.id === id);
            const item = reel.tracks.video[idx];
            const b = item ? resizeBoundsMs(item, footageMsById[id], reel.tracks.video[idx + 1]?.startMs) : null;
            setResizeBound(b ? { id: action.id, minStart: b.minStartMs / 1000, maxEnd: b.maxEndMs !== undefined ? b.maxEndMs / 1000 : undefined } : null);
          }}
          onActionResizeEnd={() => setResizeBound(null)}
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
          <span style={{ color: ripple ? '#b6ff5a' : '#9a9a95' }}>Ripple {ripple ? 'on' : 'off'}</span> — resize shifts the rest
        </span>
        <span>
          <span style={{ color: '#9a9a95' }}>Drag the volume line</span> — set level
        </span>
        <span>
          <span style={{ color: '#9a9a95' }}>Double-click it</span> — reset
        </span>
        <span>
          <span style={{ color: '#9a9a95' }}>S</span> split · <span style={{ color: '#9a9a95' }}>⌘D</span> duplicate · <span style={{ color: '#9a9a95' }}>⌫</span> delete · <span style={{ color: '#9a9a95' }}>⌘Z</span> undo
        </span>
      </div>
    </div>
  );
}

// Memoized: during playback the parent re-renders every frame (timecode), but
// the timeline's props are stable (reel changes only on edit), so it skips
// those re-renders and updates its cursor imperatively instead.
export const LayeredTimeline = memo(LayeredTimelineImpl);
