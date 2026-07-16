import { AbsoluteFill } from 'remotion';

interface Props {
  variant: 'pixels' | 'diagonals' | 'dots' | 'grid' | 'none';
  intensity?: number;
}

export const PatternBg: React.FC<Props> = ({ variant, intensity = 0.5 }) => {
  if (variant === 'none') return <AbsoluteFill style={{ backgroundColor: '#0a0a0a' }} />;

  const op = Math.min(1, Math.max(0, intensity));
  let backgroundImage = '';
  let backgroundSize = '';

  switch (variant) {
    case 'pixels':
      backgroundImage = `radial-gradient(circle at 3px 3px, #c6f432 1.5px, transparent 1.5px)`;
      backgroundSize  = '36px 36px';
      break;
    case 'dots':
      backgroundImage = `radial-gradient(circle at 2px 2px, #c6f432 1px, transparent 1px)`;
      backgroundSize  = '60px 60px';
      break;
    case 'grid':
      backgroundImage = `radial-gradient(circle at 2px 2px, #f5f5f0 1px, transparent 1px)`;
      backgroundSize  = '60px 60px';
      break;
    case 'diagonals':
      backgroundImage = `repeating-linear-gradient(135deg, #f5f5f0 0 1px, transparent 1px 24px)`;
      backgroundSize  = 'auto';
      break;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0a' }}>
      <AbsoluteFill style={{ backgroundImage, backgroundSize, opacity: op * 0.6 }} />
    </AbsoluteFill>
  );
};
