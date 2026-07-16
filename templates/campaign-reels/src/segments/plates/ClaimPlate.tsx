import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { PatternBg } from './PatternBg';

interface Props {
  lines: string[];
  pattern?: 'pixels' | 'diagonals' | 'dots' | 'grid' | 'none';
  endpoint?: boolean;
}

export const ClaimPlate: React.FC<Props> = ({ lines, pattern = 'pixels', endpoint = true }) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill>
      <PatternBg variant={pattern} intensity={0.6} />
      <AbsoluteFill style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'flex-start', justifyContent: 'center',
        padding: '0 80px',
        color: '#f5f5f0',
      }}>
        {lines.map((line, i) => {
          const start = i * 6;
          const opacity = interpolate(frame, [start, start + 12], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });
          const translateY = interpolate(frame, [start, start + 12], [40, 0], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });
          return (
            <div key={i} style={{
              fontFamily: 'Geist, sans-serif',
              fontWeight: 700,
              fontSize: 120,
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
              opacity,
              transform: `translateY(${translateY}px)`,
            }}>
              {line}
              {i === lines.length - 1 && endpoint && <span style={{ color: '#2ad4c5' }}>.</span>}
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
