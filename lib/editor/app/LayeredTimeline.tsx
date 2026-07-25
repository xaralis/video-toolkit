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

function timelineLabel(action: TimelineAction, reel: LayeredReel): string {
  const { lane, id } = parseActionId(action.id);
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

// Lanes whose items are display-only (their span is derived / not an item
// array): brand span is content-end-derived, music is a single base layer.
const LOCKED_LANES = new Set(['brand', 'music']);

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

  const editorData = useMemo(() => layeredToTimeline(reel).editorData, [reel]);

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
        rowHeight: ROW_H,
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
    <div style={{ display: 'flex', height: '100%', minHeight: 0, background: '#161719', fontFamily: FONT }}>
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
                height: ROW_H,
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
                  <VolumeLine volumeDb={reel.tracks.audio.find((a) => `audio:${a.id}` === action.id)?.volumeDb} />
                )}
                {action.id.startsWith('music:') && <MusicEnvelope points={envelope.points} totalFrames={totalFrames} />}
                <span style={{ position: 'relative', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {timelineLabel(action, reel)}
                </span>
              </div>
            );
          }}
          onChange={(d) => {
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
  );
}
