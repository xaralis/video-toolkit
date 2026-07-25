export interface MusicEnvelopeProps {
  /** Polyline vertices from computeMusicEnvelope (frame → linear gain). */
  points: Array<{ frame: number; gain: number }>;
  totalFrames: number;
  color?: string;
}

// Draws the derived music-volume envelope as a staircase over the Music block
// (which spans the whole reel). Levels are constant between video items and
// step at each boundary — reflecting the per-clip musicBoost + outro rules.
// Normalized to the loudest point so the shape (base / +6 broll / +10 outro /
// fade to 0) reads clearly. Read-only.
export function MusicEnvelope({ points, totalFrames, color = '#e8e8ea' }: MusicEnvelopeProps) {
  if (points.length === 0 || totalFrames <= 0) return null;
  const maxGain = Math.max(...points.map((p) => p.gain), 1e-6);
  const W = 1000;
  const H = 100;
  const x = (f: number) => (f / totalFrames) * W;
  const y = (g: number) => H - Math.max(0, Math.min(1, g / maxGain)) * (H - 2) - 1;

  let d = `M${x(points[0].frame).toFixed(1)},${y(points[0].gain).toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    // horizontal at the previous level, then a vertical step to the new level
    d += `L${x(points[i].frame).toFixed(1)},${y(points[i - 1].gain).toFixed(1)}`;
    d += `L${x(points[i].frame).toFixed(1)},${y(points[i].gain).toFixed(1)}`;
  }

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
