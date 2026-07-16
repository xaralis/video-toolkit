import { useCurrentFrame, useVideoConfig } from 'remotion';

// Caption override payload shape — kept local to avoid coupling lib/ to any
// template's config/types. Templates pass values matching this shape.
interface CaptionOverride {
  lines?: Array<{ startMs: number; endMs: number; text: string }>;
}

// Typography + placement tokens for the caption strip. Currently hardcoded
// to this template's default look — matching all sibling overlays in this
// directory. Full per-brand theming is future work (see web-program-intro
// design notes); switch these to a theme prop when a brand needs a
// different caption style.
const FONT_FAMILY = 'JetBrains Mono, monospace';
const FONT_SIZE = 52;
const FONT_WEIGHT = 700;
const TEXT_COLOR = '#c6f432';
const STROKE_COLOR = '#0a0a0a';
const STROKE_WIDTH_PX = 4;
const MAX_WIDTH_PCT = 0.86;
const BOTTOM_PCT = 0.2; // baseline bottom position as fraction of frame height (lower lane; quote-pulls sit above)

interface Props {
  caption?: CaptionOverride;
  transcript?: { words: Array<{ start: number; end: number; word: string }> };
  /** Time ranges (ms, segment-relative) during which captions are LIFTED to a
   *  higher position to clear a title plate or other bottom-anchored chrome.
   *  Captions are never suppressed — see brand rule #16. */
  liftWindows?: Array<{ startMs: number; endMs: number }>;
}

// When inside a lift window, captions move from BOTTOM_PCT (20%) up to
// LIFT_BOTTOM_PCT to clear the title plate.
const LIFT_BOTTOM_PCT = 0.42;

const SILENCE_BREAK_SEC = 0.35;

// Grace period appended to the LAST line's endMs so the subtitle doesn't
// vanish in the moment before a transition cuts in. Prevents the "sentence
// disappears mid-air right when whip-pan starts" effect.
const LAST_LINE_GRACE_MS = 600;

type LineWord = { startMs: number; endMs: number; word: string };
type Line = { startMs: number; endMs: number; text: string; words?: LineWord[] };

const linesFromWords = (
  words: Array<{ start: number; end: number; word: string }>,
  maxChars = 28,
): Line[] => {
  const lines: Line[] = [];
  let cur: LineWord[] = [];
  let curStart = 0;

  const flush = (endTime: number) => {
    if (cur.length === 0) return;
    lines.push({
      startMs: curStart * 1000,
      endMs: endTime * 1000,
      text: cur.map((w) => w.word.trim()).join(' '),
      words: cur,
    });
    cur = [];
  };

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const prev = words[i - 1];
    const gap = prev ? w.start - prev.end : 0;
    const candidate = cur.length === 0 ? w.word : `${cur.map((x) => x.word).join(' ')} ${w.word}`;
    const shouldBreak = cur.length > 0 && (gap > SILENCE_BREAK_SEC || candidate.length > maxChars);
    if (shouldBreak) flush(prev.end);
    if (cur.length === 0) curStart = w.start;
    cur.push({ startMs: w.start * 1000, endMs: w.end * 1000, word: w.word.trim() });
  }
  if (cur.length > 0) flush(words[words.length - 1].end);

  // Extend the last line's endMs + last word's endMs by a grace period so
  // transitions don't chop the subtitle mid-air.
  if (lines.length > 0) {
    const last = lines[lines.length - 1];
    last.endMs += LAST_LINE_GRACE_MS;
    if (last.words && last.words.length > 0) {
      last.words[last.words.length - 1].endMs += LAST_LINE_GRACE_MS;
    }
  }
  return lines;
};

// Per-word active envelope — brand rule #33: at frame ms, returns 0..1 for
// how "active" a word is. Sharp inside [start, end], with a 1-frame smoothing
// around the edges so the colour switch isn't dependent on exact ms→frame
// rounding (otherwise a word can blink at the boundary).
const WORD_FADE_MS = 30;
const activeAmount = (startMs: number, endMs: number, ms: number): number => {
  if (ms < startMs - WORD_FADE_MS || ms > endMs + WORD_FADE_MS) return 0;
  if (ms >= startMs && ms <= endMs) return 1;
  if (ms < startMs) return (ms - (startMs - WORD_FADE_MS)) / WORD_FADE_MS;
  return Math.max(0, 1 - (ms - endMs) / WORD_FADE_MS);
};

// 8-direction coal outline via stacked text-shadows.
const stroke = (px: number, color: string): string => {
  const offsets: Array<[number, number]> = [];
  for (let dx = -px; dx <= px; dx++) {
    for (let dy = -px; dy <= px; dy++) {
      if (dx === 0 && dy === 0) continue;
      offsets.push([dx, dy]);
    }
  }
  return offsets.map(([dx, dy]) => `${dx}px ${dy}px 0 ${color}`).join(', ');
};

// Caption rendering mode — brand rule #33. Two variants:
//   'highlight'  → whole line visible; active word pops via opacity / scale / lime halo
//   'pop-focus'  → JBM + linen chunk in coal box; active word pops in lime
// Brand default is 'pop-focus' (BRAND-RULES.md rule #6).
const CAPTION_MODE: 'highlight' | 'pop-focus' = 'pop-focus';

export const CaptionStrip: React.FC<Props> = ({ caption, transcript, liftWindows }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;

  const isLifted = !!(
    liftWindows && liftWindows.some((b) => ms >= b.startMs && ms <= b.endMs)
  );
  const bottomPct = isLifted ? LIFT_BOTTOM_PCT : BOTTOM_PCT;

  const lines: Line[] = caption?.lines
    ? (caption.lines as Line[])
    : transcript
    ? linesFromWords(transcript.words)
    : [];

  const active = lines.find((l) => ms >= l.startMs && ms <= l.endMs);
  if (!active) return null;

  const baseStroke = stroke(STROKE_WIDTH_PX, STROKE_COLOR);

  // ──────── Pop-focus mode (phrase chunks) ────────
  if (CAPTION_MODE === 'pop-focus' && active.words && active.words.length > 0) {
    // The line is broken into fixed phrase chunks (N words). The CURRENT
    // chunk is rendered statically — stable on screen — while the active
    // word inside it lights up (linen → lime) with a halo. When the chunk
    // ends, the next chunk replaces it. Stable line under the eye + word
    // tracking via colour shift = readable but kinetic.
    const POP_FONT_MULTIPLIER = 1.04;        // -20% from previous 1.3
    const POP_CHUNK_SIZE = 4;
    const POP_TAIL_MS = 30;                  // snappy chunk turnover
    const POP_PAD_X = 22;
    const POP_PAD_Y = 10;
    const POP_INACTIVE_COLOR = '#f5f5f0';    // linen — readable but recedes
    const POP_ACTIVE_COLOR = '#c6f432';      // lime — pops on active word

    // Chunk the line into stable phrase groups of AT MOST POP_CHUNK_SIZE words,
    // distributed as EVENLY as possible so a line never ends in a 1–2 word
    // "micro" chunk that flashes for a fraction of a second. e.g. 5 words →
    // [3,2] not [4,1]; 7 → [4,3]; 9 → [3,3,3]. Max chunk size stays ≤ 4 so the
    // nowrap pill width is unchanged. (Brand rule #33 — glue tiny remainders.)
    const chunks: LineWord[][] = [];
    {
      const n = active.words.length;
      const numChunks = Math.max(1, Math.ceil(n / POP_CHUNK_SIZE));
      const base = Math.floor(n / numChunks);
      const extra = n % numChunks; // first `extra` chunks get one extra word
      let idx = 0;
      for (let c = 0; c < numChunks; c++) {
        const size = base + (c < extra ? 1 : 0);
        chunks.push(active.words.slice(idx, idx + size));
        idx += size;
      }
    }
    // Pick the chunk whose time window contains `ms` (with brief tail past
    // the chunk's last word so the chunk doesn't snap-out before the next
    // chunk takes over).
    const activeChunk = chunks.find((c) => {
      const cStart = c[0].startMs;
      const cEnd = c[c.length - 1].endMs;
      return ms >= cStart && ms < cEnd + POP_TAIL_MS;
    });
    if (!activeChunk) return null;

    return (
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: `${bottomPct * 100}%`,
          display: 'flex',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            background: '#0a0a0a',
            padding: `${POP_PAD_Y}px ${POP_PAD_X}px`,
            fontFamily: FONT_FAMILY,
            fontWeight: FONT_WEIGHT,
            fontSize: FONT_SIZE * POP_FONT_MULTIPLIER,
            letterSpacing: '0.02em',
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
          }}
        >
          {activeChunk.map((w, i) => {
            const t = activeAmount(w.startMs, w.endMs, ms);
            const color = t > 0 ? POP_ACTIVE_COLOR : POP_INACTIVE_COLOR;
            return (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  color,
                  textShadow: baseStroke,
                  marginRight: i < activeChunk.length - 1 ? '0.4em' : 0,
                }}
              >
                {w.word}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  // ──────── Highlight mode (default) ────────
  const OPACITY_INACTIVE = 0.55;
  const SCALE_BUMP = 0.08;
  const HALO_MAX_PX = 10;
  const HALO_ALPHA = 0.5;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: `${bottomPct * 100}%`,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          maxWidth: `${MAX_WIDTH_PCT * 100}%`,
          fontFamily: FONT_FAMILY,
          fontWeight: FONT_WEIGHT,
          fontSize: FONT_SIZE,
          color: TEXT_COLOR,
          textAlign: 'center',
          lineHeight: 1.2,
          letterSpacing: '0.02em',
        }}
      >
        {active.words && active.words.length > 0 ? (
          active.words.map((w, i) => {
            const t = activeAmount(w.startMs, w.endMs, ms);
            const opacity = OPACITY_INACTIVE + (1 - OPACITY_INACTIVE) * t;
            const scale = 1 + SCALE_BUMP * t;
            const haloPx = HALO_MAX_PX * t;
            const haloAlpha = HALO_ALPHA * t;
            const shadow =
              t > 0
                ? `0 0 ${haloPx}px rgba(198,244,50,${haloAlpha}), ${baseStroke}`
                : baseStroke;
            return (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  opacity,
                  transform: `scale(${scale})`,
                  transformOrigin: 'center',
                  textShadow: shadow,
                  marginRight: i < active.words!.length - 1 ? '0.45em' : 0,
                }}
              >
                {w.word}
              </span>
            );
          })
        ) : (
          // Caption override path (caption.lines without word-level timing).
          // Render as single span — no per-word highlight available.
          <span style={{ textShadow: baseStroke }}>{active.text}</span>
        )}
      </div>
    </div>
  );
};
