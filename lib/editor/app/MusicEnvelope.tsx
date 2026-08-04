import { memo } from 'react';
import { envelopePath } from './timeline-paths';

export interface MusicEnvelopeProps {
  /** Polyline vertices from computeMusicEnvelope (frame → linear gain). */
  points: Array<{ frame: number; gain: number }>;
  totalFrames: number;
  color?: string;
}

// Draws the derived music-volume envelope as a staircase over the Music block
// (which spans the whole reel). Levels are constant between video items and
// step at each boundary — reflecting the per-clip musicBoost + outro rules.
// Drawn on the SAME dB scale as VolumeLine (-24…+6) so the draggable base-volume
// line aligns with it and the boosts read as steps above the base. Read-only.
// MEMOIZED for the same measured reason as Waveform — the timeline re-renders on
// every playhead frame and this staircase cannot change while the playhead
// moves. `points` comes from a `useMemo` keyed on `[reel, fps]`, so the
// reference is stable for the whole of playback and the memo holds.
function MusicEnvelopeImpl({ points, totalFrames, color = '#e8e8ea' }: MusicEnvelopeProps) {
  if (points.length === 0 || totalFrames <= 0) return null;
  const MIN = -24;
  const MAX = 6;
  const W = 1000;
  const H = 100;
  const d = envelopePath(points, totalFrames, W, H, MIN, MAX);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      <path d={d} stroke={color} strokeWidth={1.5} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export const MusicEnvelope = memo(MusicEnvelopeImpl);
