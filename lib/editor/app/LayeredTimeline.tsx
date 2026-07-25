import { useEffect, useMemo, useRef } from 'react';
import type { RefObject, CSSProperties } from 'react';
import { Timeline, type TimelineState } from '@xzdarcy/react-timeline-editor';
import type { TimelineRow, TimelineAction, TimelineEffect } from '@xzdarcy/timeline-engine';
import '@xzdarcy/react-timeline-editor/dist/react-timeline-editor.css';
import type { PlayerRef } from '@remotion/player';
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';
import {
  layeredToTimeline,
  applyTimelineChange,
  parseActionId,
  LANES,
  type LaneId,
} from '../src/timeline/layered-adapter';
import { stripAccents } from './accent';
import { useAudioPeaks } from './useAudioPeaks';
import { Waveform, VolumeLine } from './Waveform';
import { MusicEnvelope } from './MusicEnvelope';
import { computeMusicEnvelope } from '@video-toolkit/lib/reel-config-base/music-envelope';

// Audio sources: bare filenames are broll/clip beds under public/recordings;
// a path (e.g. audio/bg.mp3, the music) is served from public as-is.
const audioUrl = (source: string) => (source.includes('/') ? `/${source}` : `/recordings/${source}`);

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
  playheadFrame: number;
  scaleWidth?: number; // px per second (zoom)
}

export function LayeredTimeline({
  reel,
  onChange,
  selectedId,
  onSelect,
  playerRef,
  fps,
  playheadFrame,
  scaleWidth = 80,
}: LayeredTimelineProps) {
  const stateRef = useRef<TimelineState>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // SHIFT+drag on a video clip is a SLIP edit: the clip stays put, its source
  // window (sourceInMs/sourceOutMs) shifts by the drag delta. We track Shift and
  // the clip's original position/trim at move-start, let the clip move for
  // feedback, then reinterpret the drop as a slip in the onChange handler.
  const shiftHeldRef = useRef(false);
  const slipRef = useRef<{ id: string; origStartMs: number; origInMs: number; origOutMs: number } | null>(null);
  useEffect(() => {
    const kd = (e: KeyboardEvent) => e.key === 'Shift' && (shiftHeldRef.current = true);
    const ku = (e: KeyboardEvent) => e.key === 'Shift' && (shiftHeldRef.current = false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, []);

  const editorData = useMemo(() => layeredToTimeline(reel, fps).editorData, [reel, fps]);

  // Decode waveform peaks for the audio beds + the music source.
  const audioUrls = useMemo(() => {
    const urls = reel.tracks.audio.map((a) => audioUrl(a.source));
    if (reel.tracks.music.source) urls.push(audioUrl(reel.tracks.music.source));
    return urls;
  }, [reel]);
  const { peaks } = useAudioPeaks(audioUrls);

  // Derived music-volume envelope (same shared fn the composition renders from).
  const envelope = useMemo(() => computeMusicEnvelope(reel, { fps }), [reel, fps]);
  const totalFrames = Math.round((reel.meta.totalDurationMs / 1000) * fps);

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
        })),
      })),
    [editorData, selectedId],
  );

  const effects: Record<string, TimelineEffect> = useMemo(() => {
    const e: Record<string, TimelineEffect> = {};
    for (const r of editorData) for (const a of r.actions) e[a.effectId] = { id: a.effectId, name: a.effectId };
    return e;
  }, [editorData]);

  // Player → timeline cursor: keep the timeline cursor at the player's frame.
  useEffect(() => {
    stateRef.current?.setTime(playheadFrame / fps);
  }, [playheadFrame, fps]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: '#161719', fontFamily: FONT }}>
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
          onActionMoveStart={({ action }) => {
            const { lane, id } = parseActionId(action.id);
            slipRef.current = null;
            if (shiftHeldRef.current && lane === 'video') {
              const v = reel.tracks.video.find((x) => x.id === id);
              // Slip only applies to single-source clips (clip/broll) — multi-clip
              // sources / card / outro have no single trim window.
              if (v && (v.kind === 'clip' || v.kind === 'broll')) {
                slipRef.current = { id, origStartMs: v.startMs, origInMs: v.sourceInMs, origOutMs: v.sourceOutMs };
              }
            }
          }}
          onChange={(d) => {
            const slip = slipRef.current;
            if (slip) {
              slipRef.current = null;
              const act = (d as TimelineRow[]).flatMap((r) => r.actions).find((a) => a.id === `video:${slip.id}`);
              if (act) {
                // SLIP: keep the clip's position, shift its source window by the
                // dragged delta so it shows a different part of the source.
                const deltaMs = Math.round(act.start * 1000) - slip.origStartMs;
                const newIn = Math.max(0, slip.origInMs + deltaMs);
                const newOut = newIn + (slip.origOutMs - slip.origInMs); // preserve duration
                onChange({
                  ...reel,
                  tracks: {
                    ...reel.tracks,
                    video: reel.tracks.video.map((v) =>
                      v.id === slip.id && (v.kind === 'clip' || v.kind === 'broll') ? { ...v, sourceInMs: newIn, sourceOutMs: newOut } : v,
                    ),
                  },
                });
              }
              return false;
            }
            onChange(applyTimelineChange(reel, d as TimelineRow[]));
            return false; // we drive rendering via the Remotion Player, skip xzdarcy's engine sync
          }}
          // Block drag/resize on locked lanes (returning false cancels it) while
          // keeping the action clickable/selectable.
          onActionMoving={({ action }) => (LOCKED_LANES.has(parseActionId(action.id).lane) ? false : undefined)}
          onActionResizing={({ action }) => (LOCKED_LANES.has(parseActionId(action.id).lane) ? false : undefined)}
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
          <span style={{ color: '#9a9a95' }}>Shift-drag a clip</span> — slip its source
        </span>
        <span>
          <span style={{ color: '#9a9a95' }}>Drag the volume line</span> — set level
        </span>
        <span>
          <span style={{ color: '#9a9a95' }}>Double-click it</span> — reset
        </span>
      </div>
    </div>
  );
}
