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
