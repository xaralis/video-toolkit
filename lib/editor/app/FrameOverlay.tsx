import { useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import styles from './FrameOverlay.module.css';

export interface FrameOverlayProps {
  /** Horizontal crop focus, 0..1 (0=left, 0.5=center, 1=right). Defaults to 0.5. */
  focalX?: number;
  /** Vertical crop focus, 0..1 (0=top, 0.5=center, 1=bottom). Defaults to 0.5. */
  focalY?: number;
  /**
   * Called continuously (once per pointermove) during a drag of the focus
   * dot, with the new focalX/focalY fractions already clamped to [0, 1].
   */
  onFocalChange: (focalX: number, focalY: number) => void;
  /** Renders nothing when false — e.g. no segment selected, or the selected segment has no focal fields. Defaults to true. */
  visible?: boolean;
}

type DragState = {
  rectLeft: number;
  rectTop: number;
  rectWidth: number;
  rectHeight: number;
};

function clamp01(n: number): number {
  return Math.min(Math.max(n, 0), 1);
}

/**
 * FrameOverlay — draggable focus-dot overlay for editing a segment's
 * focalX/focalY (the crop focus point used for `objectFit: cover`),
 * rendered on top of the 9:16 preview stage.
 *
 * Presentational and controlled: no persisted internal state, only a ref
 * that tracks an in-flight pointer drag — transient gesture bookkeeping,
 * the same pattern Timeline uses for its trim/seek drags. Fills its
 * positioned parent (`position:absolute; inset:0`) with
 * `pointer-events:none` so it never blocks the Player underneath; only the
 * dot itself (`pointer-events:auto`) is interactive, so the rest of the
 * frame remains clickable/scrubbable through the overlay.
 *
 * Dragging the dot converts the pointer position within the container's
 * `getBoundingClientRect()` (captured once at pointerdown, same as
 * Timeline's seek gesture) into [0, 1] fractions and calls `onFocalChange`
 * continuously during the drag, via stable window pointermove/pointerup
 * listeners — jsdom doesn't implement `setPointerCapture`, so window
 * listeners are also what makes this testable (see Timeline.tsx for the
 * same pattern).
 *
 * Renders nothing when `visible` is `false`.
 */
export function FrameOverlay({
  focalX,
  focalY,
  onFocalChange,
  visible = true,
}: FrameOverlayProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const onFocalChangeRef = useRef(onFocalChange);
  onFocalChangeRef.current = onFocalChange;

  // Stable (created once, on mount) so add/removeEventListener target the
  // same function identity across renders. Reads current drag state and the
  // latest onFocalChange via refs, so it never goes stale despite being
  // created once.
  const handlePointerMoveRef = useRef((e: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const fx = drag.rectWidth > 0 ? clamp01((e.clientX - drag.rectLeft) / drag.rectWidth) : 0;
    const fy = drag.rectHeight > 0 ? clamp01((e.clientY - drag.rectTop) / drag.rectHeight) : 0;
    onFocalChangeRef.current(fx, fy);
  });

  const handlePointerUpRef = useRef(() => {
    dragRef.current = null;
    window.removeEventListener('pointermove', handlePointerMoveRef.current);
    window.removeEventListener('pointerup', handlePointerUpRef.current);
  });

  function startDrag(e: ReactPointerEvent<HTMLDivElement>) {
    // Stop propagation/prevent default so this never bubbles into a click
    // on whatever sits under the overlay (the Player stage).
    e.stopPropagation();
    e.preventDefault();

    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;

    dragRef.current = {
      rectLeft: rect.left,
      rectTop: rect.top,
      rectWidth: rect.width,
      rectHeight: rect.height,
    };
    window.addEventListener('pointermove', handlePointerMoveRef.current);
    window.addEventListener('pointerup', handlePointerUpRef.current);
  }

  // Safety net: if the overlay unmounts mid-drag (e.g. segment deselected),
  // drop any listeners startDrag() registered rather than leaking them on
  // `window`.
  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handlePointerMoveRef.current);
      window.removeEventListener('pointerup', handlePointerUpRef.current);
    };
  }, []);

  if (visible === false) return null;

  const fx = focalX ?? 0.5;
  const fy = focalY ?? 0.5;

  return (
    <div
      ref={rootRef}
      className={styles.root}
      data-testid="frame-overlay"
      style={{ pointerEvents: 'none' }}
    >
      <div
        className={styles.dot}
        data-testid="focus-dot"
        data-fx={fx}
        data-fy={fy}
        title="Drag to set which part of the shot stays in frame"
        style={{ left: `${fx * 100}%`, top: `${fy * 100}%`, pointerEvents: 'auto' }}
        onPointerDown={startDrag}
      >
        <span className={styles.marker} />
        <span className={styles.label}>focus</span>
        {/*
          Live numeric readout of the current focal position — makes it clear
          whether a drag registered (and by how much) without requiring the
          user to eyeball the dot's position against the frame. Persistent
          (not only while dragging) so it also confirms the value that was
          loaded from the segment before any interaction happens.
        */}
        <span className={styles.readout} data-testid="focal-readout">
          {`x ${fx.toFixed(2)} · y ${fy.toFixed(2)}`}
        </span>
      </div>
    </div>
  );
}
