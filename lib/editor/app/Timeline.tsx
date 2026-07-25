import { useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  segmentDurationFrames,
  totalDurationFrames,
} from '@video-toolkit/lib/reel-config-base/duration';
import { frameFromClientX, rulerTicks } from './timeline-util';
import styles from './Timeline.module.css';

/**
 * Structural segment shape — only the fields `segmentDurationFrames` reads.
 * Deliberately not importing the full reel-config-base segment union so this
 * component stays decoupled from any one template's segment variants.
 */
export type Segment = {
  id: string;
  type: string;
  source?: string;
  trimIn?: number;
  trimOut?: number;
  durationMs?: number;
};

export type TrimEdge = 'start' | 'end';

export interface TimelineProps {
  segments: Segment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /**
   * Called during a drag-to-trim gesture on the selected block's start/end
   * handle, once per pointermove, with the INCREMENTAL deltaFrames for that
   * move (not a cumulative total since drag-start). The caller is expected
   * to feed each call through `applyTrim` (see `./trim`) and persist the
   * result. Optional — the Timeline renders and behaves the same (handles
   * are inert) without it.
   */
  onTrim?: (id: string, edge: TrimEdge, deltaFrames: number) => void;
  /**
   * Called with the frame under the pointer when the user presses down on
   * the timeline TRACK (the row of blocks — not a trim handle) and again on
   * each subsequent pointermove while still pressed, i.e. a click-to-seek or
   * click-and-drag-to-scrub gesture. The frame is computed from the pointer's
   * clientX against the track's own bounding rect via `frameFromClientX`, and
   * is independent of which block (if any) is under the cursor. Optional —
   * the Timeline renders and behaves the same (no seek gesture) without it.
   * A trim-handle drag always stopPropagation()s before this can fire, so
   * trimming never also seeks.
   *
   * This same pointerdown is also what drives block selection (see
   * `onSelect`): a native `click` can't be relied on here because
   * `setPointerCapture` (see `startSeek`) retargets the resulting click away
   * from the block's `<button>` and onto the track itself in real browsers.
   * So the track's pointerdown handler hit-tests its event target for the
   * nearest `[data-segment-id]` ancestor and calls `onSelect` directly when
   * one is found — same gesture, same event, no dependency on `click`.
   */
  onSeek?: (frame: number) => void;
  fps: number;
  outroFrames: number;
  /**
   * Current playback position, in frames from the start of the reel. When
   * provided, a thin vertical playhead line is overlaid on the timeline at
   * `(playheadFrame / total) * 100%`, clamped to [0, total]. Omit (or pass
   * null/undefined) to render no playhead at all — existing callers that
   * don't pass this prop are unaffected.
   */
  playheadFrame?: number | null;
}

/**
 * The block's always-visible label. Deliberately just the 1-based scene
 * index (or "outro") rather than `${type} · ${index}` — on a timeline with
 * many short segments, blocks are often too narrow to show the type without
 * truncating to an unreadable fragment (e.g. "cli…" or "c…"). The index
 * alone always fits and stays legible; the type (plus source and duration)
 * is still available on hover via `titleFor`.
 */
function labelFor(seg: Segment, index: number): string {
  return seg.type === 'outro' ? 'outro' : `${index + 1}`;
}

/**
 * Full human description for the block's native `title` tooltip, e.g.
 * "Scene 3 · clip · TH-01a_uvod-secap.mp4 · 2.3s". Includes the source
 * filename only when the segment has one (broll/multi-clip/card/outro
 * segments may not).
 */
function titleFor(seg: Segment, index: number, durationFrames: number, fps: number): string {
  const parts = [`Scene ${index + 1}`, seg.type];
  if (seg.source) parts.push(seg.source);
  const seconds = fps > 0 ? durationFrames / fps : 0;
  parts.push(`${seconds.toFixed(1)}s`);
  return parts.join(' · ');
}

type DragState = {
  id: string;
  edge: TrimEdge;
  lastClientX: number;
  framesPerPixel: number;
};

/**
 * Timeline — horizontal strip of scene blocks, one per segment.
 *
 * Presentational and controlled: no internal state (aside from a ref that
 * tracks an in-flight pointer drag, which is transient gesture bookkeeping,
 * not component state). Each block's flex-grow is proportional to its
 * duration in frames (via `segmentDurationFrames`), so the strip reads as a
 * proportional scrubber even without a shared pixels-per-frame scale.
 * Clicking a block reports its id via `onSelect`, fired from the same
 * track pointerdown that drives `onSeek` (see that prop's doc — a native
 * `click` can land on the wrong element once pointer capture retargets it,
 * so selection doesn't depend on one). The currently selected segment is
 * styled distinctly and grows thin left/right drag handles.
 * Dragging a handle reports incremental deltaFrames via `onTrim` — see that
 * prop's doc for the contract. Dragging a handle never triggers `onSelect`.
 *
 * A thin time ruler renders above the blocks with `rulerTicks` positions.
 * Pressing anywhere on the block TRACK (not a handle) reports the frame
 * under the pointer via `onSeek`, and continues to do so on drag (scrub);
 * see that prop's doc for the contract.
 */
export function Timeline({
  segments,
  selectedId,
  onSelect,
  onTrim,
  onSeek,
  fps,
  outroFrames,
  playheadFrame,
}: TimelineProps) {
  const dragRef = useRef<DragState | null>(null);
  const onTrimRef = useRef(onTrim);
  onTrimRef.current = onTrim;
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;
  // Latest total, kept in a ref so the stable pointermove handler (created
  // once, like the trim handlers below) always reads the current value
  // rather than closing over a stale one from the render that started the
  // gesture.
  const totalRef = useRef(0);
  const seekDragRef = useRef<{ trackLeft: number; trackWidth: number } | null>(null);

  // Stable (created once, on mount) so add/removeEventListener target the
  // same function identity across renders. Reads current drag state and the
  // latest onTrim via refs, so it never goes stale despite being created once.
  const handlePointerMoveRef = useRef((e: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const deltaPx = e.clientX - drag.lastClientX;
    if (deltaPx === 0) return;
    drag.lastClientX = e.clientX;
    const deltaFrames = deltaPx * drag.framesPerPixel;
    onTrimRef.current?.(drag.id, drag.edge, deltaFrames);
  });

  const handlePointerUpRef = useRef(() => {
    dragRef.current = null;
    window.removeEventListener('pointermove', handlePointerMoveRef.current);
    window.removeEventListener('pointerup', handlePointerUpRef.current);
  });

  // Same stable-ref-on-window pattern as the trim drag above (jsdom doesn't
  // implement setPointerCapture, so window listeners are what make this
  // testable — see startSeek's feature-detected setPointerCapture call for
  // the real-browser affordance that's layered on top).
  const handleSeekPointerMoveRef = useRef((e: PointerEvent) => {
    const drag = seekDragRef.current;
    if (!drag) return;
    const frame = frameFromClientX(e.clientX, drag.trackLeft, drag.trackWidth, totalRef.current);
    onSeekRef.current?.(frame);
  });

  const handleSeekPointerUpRef = useRef(() => {
    seekDragRef.current = null;
    window.removeEventListener('pointermove', handleSeekPointerMoveRef.current);
    window.removeEventListener('pointerup', handleSeekPointerUpRef.current);
  });

  function startSeek(e: ReactPointerEvent<HTMLDivElement>) {
    const track = e.currentTarget;
    const rect = track.getBoundingClientRect();
    seekDragRef.current = { trackLeft: rect.left, trackWidth: rect.width };

    // Feature-detected: real browsers support it (keeps the gesture bound to
    // the track even if the pointer leaves it); jsdom does not implement it
    // at all, so skip rather than throw in tests. The window listeners above
    // are what actually drive the gesture either way.
    if (typeof track.setPointerCapture === 'function') {
      track.setPointerCapture(e.pointerId);
    }

    const frame = frameFromClientX(e.clientX, rect.left, rect.width, totalRef.current);
    onSeekRef.current?.(frame);

    // Select the block under the pointer, if any, from this same pointerdown
    // rather than the block's own onClick: setPointerCapture above retargets
    // the native `click` that would normally follow onto the track div, so a
    // block's onClick never sees it in a real browser. Hit-testing the raw
    // event target (captured BEFORE setPointerCapture can affect anything —
    // that call only retargets future events, not this one) sidesteps that
    // entirely. No block under the pointer (track background) is a no-op,
    // same as before this pointerdown-driven seek existed.
    const blockEl = (e.target as HTMLElement).closest?.('[data-segment-id]');
    const segmentId = blockEl?.getAttribute('data-segment-id');
    if (segmentId) {
      onSelect(segmentId);
    }

    window.addEventListener('pointermove', handleSeekPointerMoveRef.current);
    window.addEventListener('pointerup', handleSeekPointerUpRef.current);
  }

  function startDrag(
    e: ReactPointerEvent<HTMLSpanElement>,
    id: string,
    edge: TrimEdge,
    durationFrames: number
  ) {
    // Stop propagation so this doesn't bubble into the block button's
    // onClick (which would fire onSelect) — a handle drag selects nothing.
    e.stopPropagation();
    e.preventDefault();

    const blockEl = e.currentTarget.parentElement;
    const widthPx = blockEl?.getBoundingClientRect().width ?? 0;
    if (!widthPx || !durationFrames) return;

    dragRef.current = {
      id,
      edge,
      lastClientX: e.clientX,
      framesPerPixel: durationFrames / widthPx,
    };
    window.addEventListener('pointermove', handlePointerMoveRef.current);
    window.addEventListener('pointerup', handlePointerUpRef.current);
  }

  // Safety net: if the Timeline unmounts mid-drag (e.g. hot reload, or the
  // parent swaps it out), drop any listeners a startDrag() call registered
  // rather than leaking them on `window`.
  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handlePointerMoveRef.current);
      window.removeEventListener('pointerup', handlePointerUpRef.current);
      window.removeEventListener('pointermove', handleSeekPointerMoveRef.current);
      window.removeEventListener('pointerup', handleSeekPointerUpRef.current);
    };
  }, []);

  const total = totalDurationFrames(segments, fps, outroFrames);
  totalRef.current = total;
  const ticks = rulerTicks(total, fps);
  const hasPlayhead = playheadFrame !== undefined && playheadFrame !== null;
  const clampedPlayheadFrame = hasPlayhead
    ? Math.min(Math.max(playheadFrame as number, 0), total)
    : 0;
  // Guard against total === 0 (no segments): avoid NaN from a 0/0 division.
  const playheadLeftPct = hasPlayhead && total > 0 ? (clampedPlayheadFrame / total) * 100 : 0;

  return (
    <div className={styles.root}>
      <div className={styles.ruler} data-testid="ruler">
        {ticks.map((tick) => (
          <div
            key={tick.frame}
            className={styles.tick}
            data-testid={`tick-${tick.frame}`}
            style={{ left: total > 0 ? `${(tick.frame / total) * 100}%` : '0%' }}
          >
            <span className={styles.tickLabel}>{tick.label}</span>
          </div>
        ))}
      </div>
      <div className={styles.timeline} data-testid="track" onPointerDown={startSeek}>
        {hasPlayhead && (
          <div
            className={styles.playhead}
            data-testid="playhead"
            data-left-pct={playheadLeftPct}
            style={{ left: `${playheadLeftPct}%`, pointerEvents: 'none' }}
          />
        )}
        {segments.map((seg, index) => {
          const durationFrames = segmentDurationFrames(seg, fps, outroFrames);
          const isSelected = seg.id === selectedId;
          return (
            <button
              key={seg.id}
              type="button"
              className={isSelected ? `${styles.block} ${styles.selected}` : styles.block}
              style={{ flexGrow: durationFrames, flexBasis: 0 }}
              data-duration-frames={durationFrames}
              data-segment-id={seg.id}
              // Selection is driven by the track's pointerdown hit-test above
              // (see startSeek) so it fires together with onSeek and doesn't
              // depend on a native click — which setPointerCapture retargets
              // away from this button in real browsers anyway. This onClick
              // is a harmless fallback for non-pointer activation (e.g.
              // keyboard Enter/Space on a focused block), which never goes
              // through the track's pointerdown handler at all.
              onClick={() => onSelect(seg.id)}
              title={titleFor(seg, index, durationFrames, fps)}
            >
              {isSelected && (
                <>
                  <span
                    className={styles.handleStart}
                    data-testid={`trim-handle-start-${seg.id}`}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => startDrag(e, seg.id, 'start', durationFrames)}
                  />
                  <span
                    className={styles.handleEnd}
                    data-testid={`trim-handle-end-${seg.id}`}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => startDrag(e, seg.id, 'end', durationFrames)}
                  />
                </>
              )}
              <span className={styles.label}>{labelFor(seg, index)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
