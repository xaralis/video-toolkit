import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

// Overlay payload shape — kept local to avoid coupling lib/ to any template's
// config/types. Templates pass values matching this shape.
interface Props {
  kind: 'source-tag';
  text: string;
  position: 'bottom-left' | 'bottom-right' | 'top-right';
  appearAt: number;
  durationMs: number;
}

const POS: Record<Props['position'], React.CSSProperties> = {
  'bottom-left':  { left: 40,  bottom: 200 },
  'bottom-right': { right: 40, bottom: 200 },
  'top-right':    { right: 40, top: 250 },
};

export const SourceTagOverlay: React.FC<Props> = ({ text, position, appearAt, durationMs }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const start = Math.round((appearAt / 1000) * fps);
  const end   = start + Math.round((durationMs / 1000) * fps);
  if (frame < start || frame > end) return null;
  const local = frame - start;
  const opacity = interpolate(local, [0, 6, end - start - 6, end - start], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{
      position: 'absolute',
      ...POS[position],
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 20,
      color: '#9a9a95',
      letterSpacing: '0.06em',
      background: 'rgba(10,10,10,0.6)',
      padding: '6px 12px',
      opacity,
      textShadow: '0 2px 8px rgba(0,0,0,0.6)',
    }}>{text}</div>
  );
};
