import { interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

// Overlay payload shape — kept local to avoid coupling lib/ to any template's
// config/types. Templates pass values matching this shape.
interface LogoEntry {
  src: string;
  appearAt: number; // ms into the segment when this logo appears (replaces prev)
}

interface Props {
  kind: 'party-logos';
  logos: LogoEntry[];
  durationMs: number; // overlay end = logos[0].appearAt + durationMs
}

// Single centred party logo at a time on a solid coal pill. Each logo appears
// at its own `appearAt` and REPLACES the previous — a speech-synced naming
// beat ("Piráti. Noví lidovci. TOP 09. Zelení."). Motion mirrors the brand
// chevron / quote-pull vocabulary (rule #24): fade + small horizontal slide.
//
// Brand rules honoured:
//  - #26 solid coal `#0a0a0a`, 0-radius pill (logos are linen → need dark bed)
//  - #24 fade + horizontal slide entry
//  - logos normalised to equal HEIGHT so wildly different aspect ratios read
//    with consistent visual weight across the sequence (only one shows at once)
const COAL = '#0a0a0a';
const LOGO_HEIGHT = 168; // px — equal height for every logo (weight parity)
const ENTRY_FRAMES = 7; // fade+slide in
const SWAP_FADE_FRAMES = 4; // brief fade at the tail before the next logo
const SLIDE_PX = 20;

export const PartyLogosOverlay: React.FC<Props> = ({ logos, durationMs }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!logos || logos.length === 0) return null;

  const sorted = [...logos].sort((a, b) => a.appearAt - b.appearAt);
  const msToF = (ms: number) => Math.round((ms / 1000) * fps);

  const startF = msToF(sorted[0].appearAt);
  const endF = msToF(sorted[0].appearAt + durationMs);
  if (frame < startF || frame >= endF) return null;

  // Which logo is active? The last one whose appearAt <= current frame.
  let activeIdx = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (frame >= msToF(sorted[i].appearAt)) activeIdx = i;
  }
  const active = sorted[activeIdx];
  const winStart = msToF(active.appearAt);
  const winEnd =
    activeIdx < sorted.length - 1 ? msToF(sorted[activeIdx + 1].appearAt) : endF;

  const local = frame - winStart;
  const winLen = Math.max(1, winEnd - winStart);

  // Entry: fade + slide in. Tail: brief fade before the swap / overlay end.
  const opacity = interpolate(
    local,
    [0, ENTRY_FRAMES, Math.max(ENTRY_FRAMES, winLen - SWAP_FADE_FRAMES), winLen],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const slide = interpolate(local, [0, ENTRY_FRAMES], [-SLIDE_PX, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        transform: `translateY(-50%)`,
        pointerEvents: 'none',
      }}
    >
      <div
        // key forces a fresh element per logo so the entry animation restarts
        // cleanly on each swap.
        key={active.src}
        style={{
          background: COAL,
          padding: '26px 40px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity,
          transform: `translateX(${slide}px)`,
        }}
      >
        <img
          src={staticFile(`logos/${active.src}`)}
          style={{ height: LOGO_HEIGHT, width: 'auto', display: 'block' }}
        />
      </div>
    </div>
  );
};
