import { useEffect, useRef } from 'react';
import { PEAKS_PER_SEC } from './useAudioPeaks';

export interface WaveformProps {
  peaks?: Float32Array;
  /** Slice offset into the source (the audio in-point). */
  sourceInMs?: number;
  /** Visible span of this block (endMs − startMs). */
  spanMs: number;
  color?: string;
  /**
   * Timeline zoom in px per second. When given, the waveform renders at this
   * FIXED horizontal scale and is anchored (see `anchor`) instead of stretching
   * to the block. This is what makes the samples HOLD IN PLACE while a handle is
   * dragged: xzdarcy resizes the block live, but a fixed-width, right-anchored
   * waveform keeps its samples put and lets the trimmed-off front clip past the
   * block's left edge (the block is overflow:hidden), rather than sliding along.
   */
  pxPerSec?: number;
  /** Which edge the fixed-scale waveform sticks to. Audio uses 'right' so a
   *  left-handle trim holds; defaults to 'right'. Ignored without `pxPerSec`. */
  anchor?: 'left' | 'right';
}

// Draws the waveform slice for a block as vertical bars. Without `pxPerSec` it
// fills the container (preserveAspectRatio="none", stretches). With `pxPerSec`
// it renders at a fixed px width anchored to one edge (see the prop docs) so a
// live trim holds the samples in place instead of sliding them.
export function Waveform({ peaks, sourceInMs = 0, spanMs, color = 'rgba(255,255,255,0.55)', pxPerSec, anchor = 'right' }: WaveformProps) {
  if (!peaks || peaks.length === 0) return null;
  const startIdx = Math.floor((sourceInMs / 1000) * PEAKS_PER_SEC);
  const count = Math.max(1, Math.round((spanMs / 1000) * PEAKS_PER_SEC));
  const W = 1000;
  const H = 100;
  const mid = H / 2;
  const step = W / count;
  // Bar width follows the SPACING, so a short block and a long one read with the
  // same weight. The viewBox is a fixed 1000 units wide however many peaks go
  // into it, so a hard-coded strokeWidth makes density a function of block
  // length: a 3s bed (step 8.3) drew hairlines covering ~12% of the width while
  // a 54s music bed (step 0.46) drew overlapping strokes that merged into a
  // solid mass. That difference reads as "the music is more visible" and no
  // amount of opacity fixes it. 0.7 leaves a hairline gap between bars so the
  // shape stays legible instead of becoming a filled block.
  const barWidth = Math.max(0.6, step * 0.7);
  let d = '';
  for (let i = 0; i < count; i++) {
    const p = peaks[startIdx + i] ?? 0;
    const x = i * step;
    const h = p * mid;
    d += `M${x.toFixed(1)},${(mid - h).toFixed(1)}L${x.toFixed(1)},${(mid + h).toFixed(1)}`;
  }
  const layout: React.CSSProperties = pxPerSec
    ? { top: 0, bottom: 0, width: (spanMs / 1000) * pxPerSec, [anchor]: 0 }
    : { inset: 0, width: '100%' };
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ position: 'absolute', height: '100%', pointerEvents: 'none', ...layout }}
    >
      <path d={d} stroke={color} strokeWidth={barWidth} fill="none" />
    </svg>
  );
}

// A horizontal volume level line over an audio block (its constant volumeDb).
// dB mapped [vMin, vMax] → bottom…top, clamped. When `onChange` is given, the
// line is draggable (drag up/down to set volume): only a thick transparent
// hit-line is interactive, so a click elsewhere on the block still selects it,
// and pointer events stop propagating so the timeline doesn't start a clip drag.
export function VolumeLine({
  volumeDb = 0,
  color = 'rgba(232,232,234,0.85)',
  onChange,
  resetDb = 0,
  vMin = -24,
  vMax = 6,
}: {
  volumeDb?: number;
  color?: string;
  onChange?: (db: number) => void;
  /** Double-click the line to reset to this level. */
  resetDb?: number;
  /** dB scale bottom / top. Default -24…+6; audio uses a symmetric range so 0dB sits mid-block. */
  vMin?: number;
  vMax?: number;
}) {
  const V_MIN = vMin;
  const V_MAX = vMax;
  const svgRef = useRef<SVGSVGElement>(null);
  // Only change the volume for moves that belong to THIS line's own drag. A clip
  // resize is an interactjs drag on the trim handle: as its pointer sweeps across
  // the block it passes over the volume line, and React would fire this line's
  // onPointerMove (buttons===1) mid-resize — dragging the volume by accident.
  // Gating on our own pointerdown stops that.
  const dragging = useRef(false);
  useEffect(() => {
    const up = () => (dragging.current = false);
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);
  const frac = Math.max(0, Math.min(1, (volumeDb - V_MIN) / (V_MAX - V_MIN)));
  const y = 100 - frac * 96 - 2;
  const dbFromClientY = (clientY: number): number => {
    const el = svgRef.current;
    if (!el) return volumeDb;
    const r = el.getBoundingClientRect();
    const fy = Math.max(0, Math.min(1, (clientY - r.top) / r.height)); // 0 = top
    return Math.round((V_MAX - fy * (V_MAX - V_MIN)) * 10) / 10;
  };
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  // Fill the block exactly (width+height 100%) so the line sits at the same y for
  // a given dB regardless of block width — an SVG with a viewBox but no explicit
  // height sizes to the viewBox aspect ratio, which made the line drift on wider
  // blocks. The resize handles sit on top in DOM order and the dragging gate
  // above stops mid-resize grabs, so no horizontal inset is needed.
  return (
    <svg
      ref={svgRef}
      viewBox="0 0 1000 100"
      preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      {onChange && (
        <line
          x1={0}
          y1={y}
          x2={1000}
          y2={y}
          stroke="transparent"
          strokeWidth={14}
          vectorEffect="non-scaling-stroke"
          style={{ pointerEvents: 'stroke', cursor: 'ns-resize' }}
          onMouseDown={stop}
          onDoubleClick={(e) => {
            stop(e);
            onChange(resetDb);
          }}
          onPointerDown={(e) => {
            stop(e);
            e.preventDefault();
            dragging.current = true;
            (e.target as Element).setPointerCapture?.(e.pointerId);
            onChange(dbFromClientY(e.clientY));
          }}
          onPointerMove={(e) => {
            if (!dragging.current) return; // only OUR drag moves the volume
            stop(e);
            onChange(dbFromClientY(e.clientY));
          }}
          onPointerUp={() => (dragging.current = false)}
        />
      )}
      <line x1={0} y1={y} x2={1000} y2={y} stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
    </svg>
  );
}
