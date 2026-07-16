import { interpolate, useCurrentFrame } from 'remotion';

// Mandatory AI-disclosure tag. Auto-rendered by BrollSegment whenever a b-roll
// segment has `aiGenerated: true` (see campaign-reels CLAUDE.md / BRAND-RULES).
//
// Brand chevron primitive (BRAND-RULES #2): a sharp inline SVG triangle — NOT
// the Unicode ▸ glyph — JetBrains Mono weight 400 (not bold) uppercase, on a
// solid coal pill (#0a0a0a, rule #26), lime label. Entry = fade + slide-in
// over 12 frames (rule #24 motion vocabulary, shared with ChevronMarker).
//
// DELIBERATE deviation from the chevron's reveal-hold-FADEOUT (#13): a
// disclosure must stay visible the ENTIRE time the synthetic image is on
// screen, so there is NO fade-out — after the reveal it holds at full opacity
// for the whole segment.
const REVEAL_FRAMES = 12;
const LIME = '#c6f432';
const COAL = '#0a0a0a';

export const AIVisualTag: React.FC = () => {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame, [0, REVEAL_FRAMES], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  // Right-anchored, so slide in from the right (+24 → 0).
  const translateX = interpolate(frame, [0, REVEAL_FRAMES], [24, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        top: 250,
        right: 40,
        transform: `translateX(${translateX}px)`,
        opacity,
        backgroundColor: COAL,
        padding: '10px 18px',
        fontFamily: 'JetBrains Mono, monospace',
        fontWeight: 400,
        fontSize: 22,
        letterSpacing: '0.08em',
        color: LIME,
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
      AI vizualizace
    </div>
  );
};
