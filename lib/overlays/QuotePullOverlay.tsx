import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { parseAccents, applyBrandEndpoint } from '../transcripts/accent-parser';

// Overlay payload shape — kept local to avoid coupling lib/ to any template's
// config/types. Templates pass values matching this shape.
interface Props {
  kind: 'quote-pull';
  text: string;
  placement:
    | 'upper-third' | 'center' | 'lower-third'
    | 'upper-left' | 'upper-center' | 'upper-right'
    | 'mid-left' | 'mid-right'
    | 'lower-left' | 'lower-center' | 'lower-right';
  appearAt: number;
  durationMs: number;
}

const ACCENT_COLOR = { lime: '#c6f432', teal: '#2ad4c5' };
const LINEN = '#f5f5f0';

// =============================================================================
// Placement geometry (rule #28)
// =============================================================================
// Three full-width bands (legacy/headline use) + 8 anchored zones with
// max-width 56% so they don't collide with the opposite half of the frame.
// Anchored *-right / *-center zones avoid the top-right logo zone by sitting
// at top >= 18% (logo extends top 48 → ~208px = 11% of 1920px height; 18%
// gives generous clearance). The anchored variants set textAlign to match
// their gravity (left-anchored = left-aligned, right-anchored = right-aligned)
// so the text reads cleanly against the anchored edge.
type PlacementGeometry = {
  containerStyle: React.CSSProperties;
  textAlign: 'left' | 'right' | 'center';
};

const PLACEMENT: Record<Props['placement'], PlacementGeometry> = {
  // Full-width bands
  'upper-third':  { containerStyle: { top: '24%', left: '6%', right: '6%' }, textAlign: 'center' },
  'center':       { containerStyle: { top: '46%', left: '6%', right: '6%' }, textAlign: 'center' },
  // lower-* sit in a FIXED lane in the upper-chest area (below the chin, above
  // the lower-third caption band at bottom 28%). They no longer trigger a
  // caption lift — captions stay pinned (brand rule #5/#16: two fixed lanes,
  // captions never jump). Pre-2-lane geometry was top 68/70%.
  'lower-third':  { containerStyle: { top: '58%', left: '6%', right: '6%' }, textAlign: 'center' },
  // Anchored zones — max-width 56% keeps pills inside their half of the frame
  'upper-left':   { containerStyle: { top: '20%', left: '6%',  maxWidth: '56%' }, textAlign: 'left'  },
  'upper-center': { containerStyle: { top: '20%', left: '6%',  right: '6%'      }, textAlign: 'center' },
  'upper-right':  { containerStyle: { top: '20%', right: '6%', maxWidth: '56%' }, textAlign: 'right' },
  'mid-left':     { containerStyle: { top: '44%', left: '6%',  maxWidth: '56%' }, textAlign: 'left'  },
  'mid-right':    { containerStyle: { top: '44%', right: '6%', maxWidth: '56%' }, textAlign: 'right' },
  'lower-left':   { containerStyle: { top: '60%', left: '6%',  maxWidth: '56%' }, textAlign: 'left'  },
  'lower-center': { containerStyle: { top: '60%', left: '6%',  right: '6%'      }, textAlign: 'center' },
  'lower-right':  { containerStyle: { top: '60%', right: '6%', maxWidth: '56%' }, textAlign: 'right' },
};

// =============================================================================
// Decoder reveal — mirrors a brand's OutroStinger.astro (website component)
// =============================================================================
// Each character has its OWN randomized start time and scramble duration. During
// scramble, the char renders a random HEX glyph with a muted gray phosphor halo
// and ramping opacity. On lock, the real character snaps in with a 420ms linen
// "lock-flash" drop-shadow that fades to 0.
//
// Timing tuned for word-by-word feel: each word's chars start within a tight
// window (≤2f), scramble for ~4–8f, then lock with a quick flash. The next
// word arrives every 5f so the whole 5-word quote-pull reveals in ~30f (~1s).
//
// Per-char ordering inside a word has a mild left-to-right bias plus a tiny
// jitter, so it reads as a "word entering" rather than random parallel reveal.

const HEX = '0123456789ABCDEF';
const SCRAMBLE_STEP_FRAMES = 2;          // glyph swap every 2f (~15 Hz at 30fps)
const SCRAMBLE_OPACITY_START = 0.25;
const SCRAMBLE_OPACITY_PEAK = 0.9;
const CHAR_LR_BIAS = 0.7;                // each subsequent char in a word starts ~0.7f later
const CHAR_START_JITTER_FRAMES = 2;      // 0..1 extra frames of random spread
const CHAR_SCRAMBLE_MIN_FRAMES = 4;
const CHAR_SCRAMBLE_RANGE_FRAMES = 5;    // → scramble dur 4–8f ≈ 130–270ms
const LOCK_FLASH_FRAMES = 9;             // 300ms — slightly tighter than outro's 420ms
const WORD_STAGGER_FRAMES = 5;           // next word starts every 5f for word-by-word pacing

// =============================================================================
// Deterministic PRNG — mulberry32. Lets us seed per (wordIdx, charIdx) so the
// per-char timing is stable across renders. Outro uses an analogous seeded RNG.
// =============================================================================
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Choose a glyph for a scrambling char at a given frame. Deterministic per
// (wordIdx, charIdx, frame-bucket) so the same render is reproducible.
function pickGlyph(wordIdx: number, charIdx: number, frame: number): string {
  const bucket = Math.floor(frame / SCRAMBLE_STEP_FRAMES);
  const seed = wordIdx * 9301 + charIdx * 49297 + bucket * 233 + 0xc6f432;
  const t = (seed ^ (seed >>> 13)) * 1597;
  return HEX[(t >>> 4) & 0xf];
}

interface Token {
  text: string;
  color: 'lime' | 'teal' | null;
  // Optional per-char color override. Used when trailing punctuation
  // (with its own color, e.g. teal `.`) gets glued to a preceding word so
  // the punctuation can't be orphaned to a new line by browser wrap logic
  // (rule #29).
  charColors?: Array<'lime' | 'teal' | null>;
}

// Trailing single-char punctuation that should be glued to the preceding
// word so it never wraps to its own line.
const GLUE_PUNCT = /^[.!?,;:]$/;

function splitTokensIntoWords(tokens: Token[]): Token[] {
  const out: Token[] = [];
  for (const t of tokens) {
    const parts = t.text.split(/(\s+)/);
    for (const part of parts) {
      if (part.length === 0) continue;
      if (/^\s+$/.test(part)) {
        if (out.length > 0) {
          out[out.length - 1] = {
            ...out[out.length - 1],
            text: out[out.length - 1].text + part,
          };
        }
        continue;
      }
      // Glue single-char punctuation onto the previous word so the period
      // (or comma etc.) can never orphan to its own line. Preserve its color
      // via charColors.
      if (GLUE_PUNCT.test(part) && out.length > 0) {
        const prev = out[out.length - 1];
        const prevColors = prev.charColors ?? Array.from(prev.text, () => prev.color);
        out[out.length - 1] = {
          text: prev.text + part,
          color: prev.color,
          charColors: [...prevColors, ...Array.from(part, () => t.color)],
        };
        continue;
      }
      out.push({ text: part, color: t.color });
    }
  }
  return out;
}

// =============================================================================
// Per-character renderer with scramble → lock → flash decay pipeline.
// =============================================================================
const DecoderChar: React.FC<{
  ch: string;
  wordIdx: number;
  charIdx: number;
  localFrame: number;
  wordStartFrame: number;
  baseColor: string;
}> = ({ ch, wordIdx, charIdx, localFrame, wordStartFrame, baseColor }) => {
  // Whitespace passes through unchanged.
  if (/\s/.test(ch)) return <>{ch}</>;

  const rng = mulberry32(wordIdx * 9301 + charIdx * 49297 + 0xc6f432);
  // Char start = left-to-right bias (charIdx * 0.7f) + small jitter (0–1f).
  // Means the FIRST char of each word starts immediately at wordStart, with
  // later chars staggered by ~1f each — feels like the word "types in" fast.
  const startOffset = Math.floor(charIdx * CHAR_LR_BIAS) + Math.floor(rng() * CHAR_START_JITTER_FRAMES);
  const scrambleDur = CHAR_SCRAMBLE_MIN_FRAMES + Math.floor(rng() * CHAR_SCRAMBLE_RANGE_FRAMES);

  const startFrame = wordStartFrame + startOffset;
  const lockFrame = startFrame + scrambleDur;

  // Each char is rendered as a width-stable CELL:
  //   - "sizing" layer: the FINAL char with visibility toggled (always occupies
  //     its natural Geist width, so the pill never re-flows during scramble)
  //   - "scramble overlay" layer: absolute-positioned hex glyph that appears only
  //     during the scramble phase, centered within the cell
  // This means as soon as the chars enter pre-start they're already in layout
  // at full final width — the pill snaps to its final size and stays there.

  // Pre-start: cell occupies space but is invisible
  if (localFrame < startFrame) {
    return (
      <span style={{ display: 'inline-block', visibility: 'hidden', color: baseColor }}>
        {ch}
      </span>
    );
  }

  // Scramble phase: sizing layer hidden, scramble glyph overlaid centered
  if (localFrame < lockFrame) {
    const progress = (localFrame - startFrame) / scrambleDur;
    const opacity = SCRAMBLE_OPACITY_START + progress * (SCRAMBLE_OPACITY_PEAK - SCRAMBLE_OPACITY_START);
    const haloSize = opacity * 5;
    const haloAlpha = opacity * 0.5;
    const glyph = pickGlyph(wordIdx, charIdx, localFrame);
    return (
      <span style={{ display: 'inline-block', position: 'relative' }}>
        <span style={{ visibility: 'hidden', color: baseColor }}>{ch}</span>
        <span
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            textAlign: 'center',
            color: baseColor,
            opacity,
            filter: `drop-shadow(0 0 ${haloSize}px rgba(154,154,149,${haloAlpha}))`,
          }}
        >
          {glyph}
        </span>
      </span>
    );
  }

  // Locked — real char in flow with lock-flash decay; cell width unchanged.
  const sinceLock = localFrame - lockFrame;
  if (sinceLock < LOCK_FLASH_FRAMES) {
    const t = sinceLock / LOCK_FLASH_FRAMES;
    const flashSize = interpolate(t, [0, 0.55, 1], [18, 7, 0], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const flashAlpha = interpolate(t, [0, 0.55, 1], [0.95, 0.45, 0], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    return (
      <span
        style={{
          display: 'inline-block',
          color: baseColor,
          filter: `drop-shadow(0 0 ${flashSize}px rgba(245,245,240,${flashAlpha}))`,
        }}
      >
        {ch}
      </span>
    );
  }

  // Fully settled.
  return <span style={{ display: 'inline-block', color: baseColor }}>{ch}</span>;
};

export const QuotePullOverlay: React.FC<Props> = ({ text, placement, appearAt, durationMs }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const start = Math.round((appearAt / 1000) * fps);
  const end = start + Math.round((durationMs / 1000) * fps);

  if (frame < start || frame > end) return null;

  const local = frame - start;
  const totalFrames = end - start;

  // Appear + disappear: fade + horizontal slide, matching the ChevronMarker
  // motion vocabulary. Entry slides IN from the left (-24px → 0) while fading
  // in over 12 frames. Exit slides OUT to the right (0 → +24px) while fading
  // out over the last 12 frames. The decoder character reveal happens DURING
  // and AFTER the entry slide — the pill is already mostly settled when each
  // word starts scrambling, so the per-char motion stays the focal point.
  const ENTRY_FRAMES = 12;
  const EXIT_FRAMES = 12;
  const SLIDE_PX = 24;

  const pillOpacity = interpolate(
    local,
    [0, ENTRY_FRAMES, totalFrames - EXIT_FRAMES, totalFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const entrySlide = interpolate(
    local,
    [0, ENTRY_FRAMES],
    [-SLIDE_PX, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const exitSlide = interpolate(
    local,
    [totalFrames - EXIT_FRAMES, totalFrames],
    [0, SLIDE_PX],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const translateX = entrySlide + exitSlide;

  const wordTokens = splitTokensIntoWords(parseAccents(applyBrandEndpoint(text)));
  const geometry = PLACEMENT[placement];

  return (
    <div
      style={{
        position: 'absolute',
        ...geometry.containerStyle,
        transform: `translate(${translateX}px, -50%)`,
        opacity: pillOpacity,
        textAlign: geometry.textAlign,
        pointerEvents: 'none',
        // Text is laid out as inline with per-line background via
        // box-decoration-break: clone. The wrapper just positions and sets
        // the typography; the background lives on the inline span below.
        fontFamily: 'Geist, sans-serif',
        fontWeight: 600,
        fontSize: 80,
        // Tight but not overlapping. Brand `leading-tight` is 1.25 for
        // pure text, but with the per-line pill backgrounds below, Geist
        // Bold's natural metrics + the 2/4px padding extend each pill ~6px
        // past the line-box, which causes adjacent pills to overlap and
        // double the alpha. 1.35 gives ~14px clearance — still tight,
        // looks like one designed system, no visible stack-banding.
        lineHeight: 1.35,
        letterSpacing: '-0.02em',
        color: LINEN,
      }}
    >
      <span
        style={{
          // Each wrapped line gets its OWN background pill of just-line-width.
          // box-decoration-break: clone re-applies background + padding +
          // border-radius per fragment when the inline element wraps.
          display: 'inline',
          // SOLID coal (not 0.88) — exception to rule #26. Per-line pills
          // via box-decoration-break:clone physically overlap by a few px
          // regardless of line-height; at any alpha < 1.0 that overlap
          // doubles the alpha and renders as a visible darker band.
          // Going solid removes the artifact without losing the "tight
          // typography" feel.
          background: '#0a0a0a',
          padding: '2px 26px 4px',
          boxDecorationBreak: 'clone',
          WebkitBoxDecorationBreak: 'clone',
        }}
      >
        {wordTokens.map((w, i) => {
            const wordStart = i * WORD_STAGGER_FRAMES;
            const baseColor = w.color ? ACCENT_COLOR[w.color] : LINEN;
            // Separate trailing whitespace so it can be a wrap opportunity
            // OUTSIDE the word's atomic nowrap box. Each word's chars render
            // inside an inline-block with white-space:nowrap, preventing
            // mid-word breaks across char-cells. Glued trailing punctuation
            // (rule #29) lives inside the same nowrap box; its color comes
            // from `w.charColors[k]` when present.
            const trailing = w.text.match(/(\s*)$/)?.[1] ?? '';
            const wordCore = w.text.slice(0, w.text.length - trailing.length);
            const chars = Array.from(wordCore);
            return (
              <span key={i}>
                <span style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
                  {chars.map((ch, k) => {
                    const charColor = w.charColors?.[k];
                    const colorForChar = charColor ? ACCENT_COLOR[charColor] : (charColor === null ? LINEN : baseColor);
                    return (
                      <DecoderChar
                        key={k}
                        ch={ch}
                        wordIdx={i}
                        charIdx={k}
                        localFrame={local}
                        wordStartFrame={wordStart}
                        baseColor={colorForChar}
                      />
                    );
                  })}
                </span>
                {trailing}
              </span>
            );
          })}
      </span>
    </div>
  );
};
