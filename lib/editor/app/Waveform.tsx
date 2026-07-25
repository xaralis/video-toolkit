import { useRef } from 'react';
import { PEAKS_PER_SEC } from './useAudioPeaks';

export interface WaveformProps {
  peaks?: Float32Array;
  /** Slice offset into the source (the audio in-point). */
  sourceInMs?: number;
  /** Visible span of this block (endMs − startMs). */
  spanMs: number;
  color?: string;
}

// Draws the waveform slice for a block as vertical bars filling its container
// (preserveAspectRatio="none" so it stretches to the block width/height).
export function Waveform({ peaks, sourceInMs = 0, spanMs, color = 'rgba(255,255,255,0.28)' }: WaveformProps) {
  if (!peaks || peaks.length === 0) return null;
  const startIdx = Math.floor((sourceInMs / 1000) * PEAKS_PER_SEC);
  const count = Math.max(1, Math.round((spanMs / 1000) * PEAKS_PER_SEC));
  const W = 1000;
  const H = 100;
  const mid = H / 2;
  const step = W / count;
  let d = '';
  for (let i = 0; i < count; i++) {
    const p = peaks[startIdx + i] ?? 0;
    const x = i * step;
    const h = p * mid;
    d += `M${x.toFixed(1)},${(mid - h).toFixed(1)}L${x.toFixed(1)},${(mid + h).toFixed(1)}`;
  }
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      <path d={d} stroke={color} strokeWidth={1} fill="none" />
    </svg>
  );
}

// A horizontal volume level line over an audio block (its constant volumeDb).
// dB mapped -24…+6 → bottom…top, clamped. When `onChange` is given, the line is
// draggable (drag up/down to set volume): only a thick transparent hit-line is
// interactive, so a click elsewhere on the block still selects it, and pointer
// events stop propagating so the timeline doesn't start a clip drag.
const V_MIN = -24;
const V_MAX = 6;
export function VolumeLine({
  volumeDb = 0,
  color = 'rgba(232,232,234,0.85)',
  onChange,
}: {
  volumeDb?: number;
  color?: string;
  onChange?: (db: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
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
          strokeWidth={16}
          vectorEffect="non-scaling-stroke"
          style={{ pointerEvents: 'stroke', cursor: 'ns-resize' }}
          onMouseDown={stop}
          onPointerDown={(e) => {
            stop(e);
            e.preventDefault();
            (e.target as Element).setPointerCapture?.(e.pointerId);
            onChange(dbFromClientY(e.clientY));
          }}
          onPointerMove={(e) => {
            if (e.buttons !== 1) return;
            stop(e);
            onChange(dbFromClientY(e.clientY));
          }}
        />
      )}
      <line x1={0} y1={y} x2={1000} y2={y} stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
    </svg>
  );
}
