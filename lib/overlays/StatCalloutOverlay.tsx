import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

// Overlay payload shape — kept local to avoid coupling lib/ to any template's
// config/types. Templates pass values matching this shape.
interface Props {
  kind: 'stat-callout';
  number: string;
  unit?: string;
  label?: string;
  appearAt: number;
  durationMs: number;
  color: 'lime' | 'teal';
}

export const StatCalloutOverlay: React.FC<Props> = ({ number, unit, label, appearAt, durationMs, color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const startFrame = Math.round((appearAt / 1000) * fps);
  const endFrame = startFrame + Math.round((durationMs / 1000) * fps);
  if (frame < startFrame || frame > endFrame) return null;
  const local = frame - startFrame;
  const inSpring = spring({ frame: local, fps, config: { damping: 12, stiffness: 200, mass: 0.7 } });
  const opacity = interpolate(local, [0, 8, endFrame - startFrame - 12, endFrame - startFrame], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const scale = interpolate(inSpring, [0, 1], [0.6, 1]);
  const accent = color === 'lime' ? '#c6f432' : '#2ad4c5';

  return (
    <div style={{
      position: 'absolute',
      left: '50%', top: '38%',
      transform: `translate(-50%, -50%) scale(${scale})`,
      opacity,
      pointerEvents: 'none',
      textAlign: 'center',
      textShadow: '0 2px 16px rgba(0,0,0,0.7)',
    }}>
      {/* number + unit on ONE line, baseline-aligned (e.g. "200 let") */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 30 }}>
        <span style={{ fontFamily: 'Geist, sans-serif', fontWeight: 700, fontSize: 210, color: accent, lineHeight: 0.95, letterSpacing: '-0.03em' }}>{number}</span>
        {unit && <span style={{ fontFamily: 'Geist, sans-serif', fontWeight: 700, fontSize: 96, color: accent }}>{unit}</span>}
      </div>
      {label && (
        <div style={{
          fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 46, color: '#f5f5f0',
          letterSpacing: '0.04em', marginTop: 18, whiteSpace: 'nowrap',
          // coal stroke so the small caption reads on busy footage
          textShadow: '-2px -2px 0 #0a0a0a, 2px -2px 0 #0a0a0a, -2px 2px 0 #0a0a0a, 2px 2px 0 #0a0a0a, 0 0 10px #0a0a0a',
        }}>{label}</div>
      )}
    </div>
  );
};
