import { AbsoluteFill, Img, staticFile } from 'remotion';
import { theme } from '../config/theme';

const cornerStyle = (corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right', marginPx: number, sizePx: number): React.CSSProperties => {
  const base: React.CSSProperties = { position: 'absolute', width: sizePx, height: sizePx };
  switch (corner) {
    case 'top-left':     return { ...base, top: marginPx,    left: marginPx };
    case 'top-right':    return { ...base, top: marginPx,    right: marginPx };
    case 'bottom-left':  return { ...base, bottom: marginPx, left: marginPx };
    case 'bottom-right': return { ...base, bottom: marginPx, right: marginPx };
  }
};

export const PersistentOverlay: React.FC = () => {
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <Img
        src={staticFile(theme.watermark.asset)}
        style={{
          ...cornerStyle(theme.watermark.corner, theme.watermark.marginPx, theme.watermark.sizePx),
          opacity: theme.watermark.alpha,
        }}
      />
      <div style={{
        position: 'absolute',
        left: 0, right: 0,
        bottom: theme.disclaimer.bottomOffsetPx,
        padding: '6px 40px 4px',
        textAlign: 'right',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: theme.disclaimer.fontSize,
        color: theme.disclaimer.color,
        letterSpacing: '0.05em',
        // No background — present but non-distracting per brand rule #3
      }}>
        {theme.disclaimer.text}
      </div>
    </AbsoluteFill>
  );
};
