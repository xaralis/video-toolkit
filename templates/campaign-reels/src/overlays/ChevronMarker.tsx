import { interpolate, useCurrentFrame } from 'remotion';
import { theme } from '../config/theme';

interface Props {
  label: string;
}

// Once-per-reel category marker. Renders at composition root (NOT per segment).
// Vertically centered on the PP watermark logo (y = 128 = 48 + 80).
// Fade-in 6f → hold 45f → fade-out 10f → never reappears.
const REVEAL_FRAMES = 12;
const HOLD_FRAMES = 60;
const FADEOUT_FRAMES = 18;
const TOTAL_FRAMES = REVEAL_FRAMES + HOLD_FRAMES + FADEOUT_FRAMES;

// PP logo center y = watermark.top (48) + sizePx/2 (80) = 128
const LOGO_CENTER_Y = 128;

export const ChevronMarker: React.FC<Props> = ({ label }) => {
  const frame = useCurrentFrame();

  if (frame > TOTAL_FRAMES) return null;

  const opacity = interpolate(
    frame,
    [0, REVEAL_FRAMES, REVEAL_FRAMES + HOLD_FRAMES, TOTAL_FRAMES],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  // Slide in from the left on entry, slide out to the right on exit —
  // mirrors QuotePullOverlay (Rule #24). The two together = unified brand
  // motion vocabulary across on-video chrome.
  const entrySlide = interpolate(frame, [0, REVEAL_FRAMES], [-24, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const exitSlide = interpolate(
    frame,
    [REVEAL_FRAMES + HOLD_FRAMES, TOTAL_FRAMES],
    [0, 24],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const translateX = entrySlide + exitSlide;

  // Brand chevron is a sharp SVG triangle (viewBox 0 0 8 10), NOT the
  // Unicode ▸ glyph — see brands/<brand>/assets/components/ and the source
  // BrandChevron.tsx in the campaign site. Width 0.6em / height 0.75em so
  // it scales with the label fontSize. Margin-right ~0.65em matches the
  // "prefix" spacing used in the brand Label component.
  const chevronSize = theme.chevron.fontSize;

  return (
    <div
      style={{
        position: 'absolute',
        top: LOGO_CENTER_Y,
        left: 40,
        transform: `translate(${translateX}px, -50%)`,
        opacity,
        backgroundColor: '#0a0a0a',
        padding: '10px 18px',
        fontFamily: 'JetBrains Mono, monospace',
        fontWeight: 400,
        fontSize: chevronSize,
        letterSpacing: theme.chevron.letterSpacing,
        color: theme.chevron.color,
        textTransform: 'uppercase',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <svg
        viewBox="0 0 8 10"
        aria-hidden="true"
        style={{
          width: '0.6em',
          height: '0.75em',
          marginRight: '0.65em',
          display: 'inline-block',
        }}
      >
        <polygon points="0,0 8,5 0,10" fill="currentColor" />
      </svg>
      {label}
    </div>
  );
};
