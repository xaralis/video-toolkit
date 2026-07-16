import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

// "Adoption stamp" overlay: an eyebrow label + a bold headline + a lime
// checkmark that draws on. Used to punch in a confident "this proposal was
// adopted" beat shortly after an A/B blend reveals our proposed variant.
//
// Motion vocabulary is deliberately DIFFERENT from QuotePullOverlay's decoder
// scramble (rule #21): this is a declarative stamp, not a quote — a spring
// pop-in + a stroke-drawn checkmark reads as "✓ done / approved".
//
// Brand discipline: solid coal pill (rule #26), 0-radius, lime accent on the
// 1-word eyebrow + the check only (rule #1 — the headline stays linen, never a
// whole-lime sentence). The badge is a label/stamp element, so the whole thing
// is JBM Mono (eyebrow + headline) like the chevron label (rule #2), NOT Geist
// overlay text (rule #23) — it reads as a system "status chip", not a quote.

interface Props {
  /** Headline — e.g. "Prosadili jsme". Rendered JBM Mono Bold, linen. */
  text: string;
  /** Small uppercased eyebrow above the headline. Default "UPDATE". */
  eyebrow?: string;
  /** MILLISECONDS into the segment when the badge animates in. */
  appearAt: number;
  /** How long the badge holds, MILLISECONDS (min 3000 — rule #19). */
  durationMs: number;
}

const LIME = '#c6f432';
const COAL = '#0a0a0a';
const LINEN = '#f5f5f0';

// Length of the checkmark stroke path (rough arc length of the polyline
// below) — used to drive the stroke-draw via strokeDashoffset.
const TICK_LEN = 80;

export const UpdateBadgeOverlay: React.FC<Props> = ({
  text,
  eyebrow = 'UPDATE',
  appearAt,
  durationMs,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const start = Math.round((appearAt / 1000) * fps);
  const end = start + Math.round((durationMs / 1000) * fps);
  const local = frame - start;

  // Render nothing outside the badge's window.
  if (frame < start || frame >= end) return null;

  // Container entrance: a PRONOUNCED spring pop — bigger scale delta + a
  // bouncier spring (low damping) so it overshoots past 1 and settles. ~2×
  // punchier than a gentle fade-in. interpolate is intentionally un-clamped on
  // the right so the spring's overshoot rides through into scale/rise.
  const enter = spring({
    frame: local,
    fps,
    config: { damping: 9, stiffness: 150, mass: 0.9 },
  });
  const scale = interpolate(enter, [0, 1], [0.64, 1]);
  const rise = interpolate(enter, [0, 1], [38, 0]);

  const enterFade = interpolate(local, [0, 6], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const exitFade = interpolate(frame, [end - 8, end], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const opacity = Math.min(enterFade, exitFade);

  // Checkmark: the lime disc pops in just after the container, then the tick
  // strokes on over ~9 frames.
  const checkDelay = 5;
  const circlePop = spring({
    frame: local - checkDelay,
    fps,
    config: { damping: 9, stiffness: 180, mass: 0.7 },
  });
  // Allow right overshoot (no right-clamp) so the disc pops past 1.0 and
  // settles — matches the container's punchier entrance.
  const circleScale = interpolate(circlePop, [0, 1], [0, 1], {
    extrapolateLeft: 'clamp',
  });
  const tickDraw = interpolate(local, [checkDelay + 4, checkDelay + 13], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const checkSize = 64;

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-start',
        alignItems: 'center',
        paddingTop: '33%',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          transform: `translateY(${rise}px) scale(${scale})`,
          opacity,
          background: COAL,
          padding: '26px 44px 30px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 10,
          maxWidth: '88%',
        }}
      >
        <span
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontWeight: 400,
            fontSize: 26,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: LIME,
          }}
        >
          {eyebrow}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <svg
            width={checkSize}
            height={checkSize}
            viewBox="0 0 100 100"
            style={{
              flexShrink: 0,
              transform: `scale(${circleScale})`,
              transformOrigin: 'center',
            }}
          >
            <circle cx="50" cy="50" r="46" fill={LIME} />
            <path
              d="M28 51 L44 68 L73 34"
              fill="none"
              stroke={COAL}
              strokeWidth="11"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={TICK_LEN}
              strokeDashoffset={TICK_LEN * (1 - tickDraw)}
            />
          </svg>
          <span
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontWeight: 400,
              fontSize: 60,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: LINEN,
              lineHeight: 1.0,
              whiteSpace: 'nowrap',
            }}
          >
            {text}
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
