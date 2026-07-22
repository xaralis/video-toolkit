import { useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { Timeline, type TimelineState } from '@xzdarcy/react-timeline-editor';
import type { TimelineRow, TimelineAction, TimelineEffect } from '@xzdarcy/timeline-engine';
import '@xzdarcy/react-timeline-editor/dist/react-timeline-editor.css';
import type { PlayerRef } from '@remotion/player';
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';
import {
  layeredToTimeline,
  applyTimelineChange,
  LANES,
  type LaneId,
} from '../src/timeline/layered-adapter';

// Fixed, typed lanes (D4) — the structure comes from the reel, not free-form
// adding. Order matches the adapter's row order.
const LANE_LABELS: Record<LaneId, string> = {
  video: 'Video',
  overlays: 'Overlays',
  audio: 'Audio',
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
  'brand-watermark': '#4a4c54',
  'brand-disclaimer': '#4a4c54',
};
const colorFor = (effectId: string) => EFFECT_COLOR[effectId] ?? '#5a5c64';
const labelFor = (action: TimelineAction) => {
  // The action id is `${lane}:${itemId}` — show the item id (readable enough
  // for the reviewer smoke; richer labels come later).
  const idx = action.id.indexOf(':');
  return idx >= 0 ? action.id.slice(idx + 1) : action.id;
};

const RULER_H = 32; // xzdarcy's scale (time-ruler) area height — offsets the lane headers
const ROW_H = 34;

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

  const editorData = useMemo(() => layeredToTimeline(reel).editorData, [reel]);

  // Mark the selected action so xzdarcy highlights it.
  const data: TimelineRow[] = useMemo(
    () =>
      editorData.map((r) => ({
        ...r,
        rowHeight: ROW_H,
        actions: r.actions.map((a) => ({ ...a, selected: a.id === selectedId, flexible: true, movable: true })),
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
    <div style={{ display: 'flex', height: '100%', minHeight: 0, background: '#161719' }}>
      {/* Fixed lane-header column (xzdarcy renders only the track area). */}
      <div style={{ width: 84, flex: 'none', borderRight: '1px solid #2a2c32' }}>
        <div style={{ height: RULER_H }} />
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
            }}
          >
            {LANE_LABELS[lane]}
          </div>
        ))}
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
          style={{ width: '100%', height: '100%', background: '#161719' }}
          getActionRender={(action) => (
            <div
              style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                padding: '0 6px',
                borderRadius: 3,
                background: colorFor(action.effectId),
                color: '#f2f2f2',
                fontSize: 11,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                boxShadow: action.selected ? 'inset 0 0 0 2px #e8e8ea' : undefined,
              }}
              title={action.id}
            >
              {labelFor(action)}
            </div>
          )}
          onChange={(d) => {
            onChange(applyTimelineChange(reel, d as TimelineRow[]));
            return false; // we drive rendering via the Remotion Player, skip xzdarcy's engine sync
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
  );
}
