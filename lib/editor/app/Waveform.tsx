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
// dB mapped -24…+6 → bottom…top, clamped.
export function VolumeLine({ volumeDb = 0, color = 'rgba(232,232,234,0.85)' }: { volumeDb?: number; color?: string }) {
  const MIN = -24;
  const MAX = 6;
  const frac = Math.max(0, Math.min(1, (volumeDb - MIN) / (MAX - MIN)));
  const y = 100 - frac * 96 - 2;
  return (
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      <line x1={0} y1={y} x2={1000} y2={y} stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
