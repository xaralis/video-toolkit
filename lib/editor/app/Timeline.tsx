import { useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { segmentDurationFrames } from '@video-toolkit/lib/reel-config-base/duration';
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
  fps: number;
  outroFrames: number;
}

function labelFor(seg: Segment, index: number): string {
  return seg.type === 'outro' ? 'outro' : `${seg.type} · ${index + 1}`;
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
 * Clicking a block reports its id via `onSelect`; the currently selected
 * segment is styled distinctly and grows thin left/right drag handles.
 * Dragging a handle reports incremental deltaFrames via `onTrim` — see that
 * prop's doc for the contract. Dragging a handle never triggers `onSelect`.
 */
export function Timeline({
  segments,
  selectedId,
  onSelect,
  onTrim,
  fps,
  outroFrames,
}: TimelineProps) {
  const dragRef = useRef<DragState | null>(null);
  const onTrimRef = useRef(onTrim);
  onTrimRef.current = onTrim;

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
    };
  }, []);

  return (
    <div className={styles.timeline}>
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
            onClick={() => onSelect(seg.id)}
            title={labelFor(seg, index)}
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
  );
}
