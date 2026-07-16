import { Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { parseAccents, applyBrandEndpoint } from '../transcripts/accent-parser';

interface Props {
  text: string;
  /** ms from start of containing segment */
  appearAt: number;
  durationMs: number;
}

const ACCENT_COLOR = { lime: '#c6f432', teal: '#2ad4c5' };

// Title plate: a SINGLE continuous coal block from above the title down to
// the frame bottom. Title text sits at the top of the block; skyline silhouette
// sits inside the block near the bottom. No gap between title and skyline
// where the underlying video would show through. (Rule #18.)
//
// TitleOverlay ALWAYS renders from frame 0 of its containing segment — the
// intro title must hit screen instantly to anchor the viewer. `appearAt` is
// accepted for API symmetry but ignored. `durationMs` controls how long the
// title is held.
export const TitleOverlay: React.FC<Props> = ({ text, appearAt: _appearAt, durationMs }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const start = 0;
  const end = Math.round((durationMs / 1000) * fps);

  if (frame < start || frame > end) return null;
  const local = frame - start;
  const totalFrames = end - start;

  // Entry: snap-in at frame 0 (no opacity ramp — Rule #22 requires the title
  // be visible IMMEDIATELY when its segment begins).
  // Exit: curtain-drop synchronized with fade-out — over the last ~7 frames,
  // the plate translates down by 100% of its own height AND fades to 0
  // opacity. The two together feel more decisive than either alone.
  const exitDuration = 3;
  const exitStart = Math.max(0, totalFrames - exitDuration);
  const translateYPct = interpolate(
    local,
    [exitStart, totalFrames],
    [0, 100],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const opacity = interpolate(
    local,
    [exitStart, totalFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const tokens = parseAccents(applyBrandEndpoint(text));

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        // Coal fill applied to the OUTER container so it spans from top of
        // title (with its padding) all the way down to the frame bottom.
        background: '#0a0a0a',
        // Padding at top sets where the title sits inside the block.
        // No bottom padding — skyline anchors to the bottom edge of the block.
        paddingTop: 50,
        transform: `translateY(${translateYPct}%)`,
        opacity,
        pointerEvents: 'none',
      }}
    >
      {/* Title text — content-sized inside the coal block */}
      <div
        style={{
          padding: '0 60px',
          fontFamily: 'Geist, sans-serif',
          fontWeight: 700,
          fontSize: 104,
          color: '#f5f5f0',
          lineHeight: 1.05,
          letterSpacing: '-0.02em',
          textAlign: 'left',
        }}
      >
        {tokens.map((t, i) => (
          <span key={i} style={{ color: t.color ? ACCENT_COLOR[t.color] : 'inherit' }}>
            {t.text}
          </span>
        ))}
      </div>
      {/* Skyline INSIDE the coal block — anchored to the bottom of the block */}
      <Img
        src={staticFile('brand/skyline.svg')}
        style={{
          display: 'block',
          width: '100%',
          height: 'auto',
          marginTop: 56,
        }}
      />
    </div>
  );
};
