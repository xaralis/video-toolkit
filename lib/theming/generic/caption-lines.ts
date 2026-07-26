// lib/theming/generic/caption-lines.ts — the PURE half of core's caption
// renderer: word grouping, the per-word active envelope, phrase chunking and
// the stacked-shadow stroke.
//
// Deliberately NO React and NO `remotion` import. This is where the real logic
// of a caption track lives, and keeping it pure means it is testable without a
// frame hook, a mock or a DOM. `GenericCaptions.tsx` is the thin presentational
// shell on top of it.
//
// Ported from the one brand that ships burned-in captions today
// (`brand-lib/overlays/CaptionStrip.tsx`, which says in-file that it is
// hardcoded to that brand). Every magnitude that was a module constant there is
// a parameter here, defaulting to the value that actually renders today.

/** A word with second-based timings — the shape `lib/transcripts` produces. */
export interface CaptionSourceWord {
  start: number;
  end: number;
  word: string;
}

/** A word inside a built line, with ms-based timings. */
export interface CaptionLineWord {
  startMs: number;
  endMs: number;
  word: string;
}

/** One caption line. `words` is absent when a caller supplies lines directly
 *  and has no word-level timing — the renderer then draws the plain `text`. */
export interface CaptionLine {
  startMs: number;
  endMs: number;
  text: string;
  words?: CaptionLineWord[];
}

/** Max characters a line may reach before the greedy grouper breaks. */
export const DEFAULT_CAPTION_MAX_CHARS = 28;
/** An inter-word gap LONGER than this forces a line break (a breath / silence). */
export const DEFAULT_CAPTION_GAP_BREAK_MS = 350;
/** Added to the LAST line's `endMs` *and* to its last word's `endMs`, so the
 *  final subtitle does not vanish in the moment a transition cuts in. */
export const DEFAULT_CAPTION_LAST_LINE_GRACE_MS = 600;
/** Upper bound on a phrase chunk in `pop-focus` mode. */
export const DEFAULT_CAPTION_MAX_WORDS_PER_CHUNK = 4;
/** Half-width of the linear ramp around a word's active window, in ms. */
export const DEFAULT_CAPTION_WORD_FADE_MS = 30;

export interface LinesFromWordsOptions {
  maxChars?: number;
  gapBreakMs?: number;
  lastLineGraceMs?: number;
}

/**
 * Greedy word grouping into readable lines.
 *
 * A break happens when either
 *   - the gap between this word and the previous one EXCEEDS `gapBreakMs`
 *     (a pause; breaking there keeps the line aligned with the speech), or
 *   - adding this word would push the line PAST `maxChars`.
 *
 * The last line (and its last word) is extended by `lastLineGraceMs` — two
 * separate mutations of the same result, both load-bearing: the line's `endMs`
 * keeps the line on screen, the word's `endMs` keeps the last word lit while it
 * is there.
 */
export function linesFromWords(
  words: CaptionSourceWord[],
  options: LinesFromWordsOptions = {},
): CaptionLine[] {
  const maxChars = options.maxChars ?? DEFAULT_CAPTION_MAX_CHARS;
  const lastLineGraceMs = options.lastLineGraceMs ?? DEFAULT_CAPTION_LAST_LINE_GRACE_MS;
  // Compared in SECONDS against the source words' second-based timings, which
  // is what the ported implementation does; converting the words to ms first
  // would change results at the boundary through float rounding.
  const gapBreakSec = (options.gapBreakMs ?? DEFAULT_CAPTION_GAP_BREAK_MS) / 1000;

  const lines: CaptionLine[] = [];
  let cur: CaptionLineWord[] = [];
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
    const candidate =
      cur.length === 0 ? w.word : `${cur.map((x) => x.word).join(' ')} ${w.word}`;
    const shouldBreak = cur.length > 0 && (gap > gapBreakSec || candidate.length > maxChars);
    if (shouldBreak) flush(prev.end);
    if (cur.length === 0) curStart = w.start;
    cur.push({ startMs: w.start * 1000, endMs: w.end * 1000, word: w.word.trim() });
  }
  if (cur.length > 0) flush(words[words.length - 1].end);

  if (lines.length > 0) {
    const last = lines[lines.length - 1];
    last.endMs += lastLineGraceMs;
    if (last.words && last.words.length > 0) {
      last.words[last.words.length - 1].endMs += lastLineGraceMs;
    }
  }
  return lines;
}

/**
 * Per-word active envelope: 0..1 for how "active" a word is at time `ms`.
 *
 * Sharp 1 inside `[startMs, endMs]`, with a LINEAR RAMP of `fadeMs` on each
 * side. The ramp is not decoration — without it the colour switch depends on
 * exact ms→frame rounding and a short word can blink on and off at the
 * boundary between two frames.
 */
export function activeAmount(
  startMs: number,
  endMs: number,
  ms: number,
  fadeMs: number = DEFAULT_CAPTION_WORD_FADE_MS,
): number {
  if (ms < startMs - fadeMs || ms > endMs + fadeMs) return 0;
  if (ms >= startMs && ms <= endMs) return 1;
  if (ms < startMs) return (ms - (startMs - fadeMs)) / fadeMs;
  return Math.max(0, 1 - (ms - endMs) / fadeMs);
}

/**
 * Split a line into stable phrase chunks of AT MOST `maxWordsPerChunk` words,
 * distributed as EVENLY as possible.
 *
 * Evenness is the point: a naive greedy split leaves a 1-word remainder that
 * flashes for a fraction of a second. So 5 words → [3,2] (not [4,1]),
 * 7 → [4,3], 9 → [3,3,3]. The chunk cap is preserved, so the `nowrap` pill
 * never grows wider than the cap implies.
 */
export function chunkWords<T>(
  words: T[],
  maxWordsPerChunk: number = DEFAULT_CAPTION_MAX_WORDS_PER_CHUNK,
): T[][] {
  const n = words.length;
  if (n === 0) return [];
  const numChunks = Math.max(1, Math.ceil(n / maxWordsPerChunk));
  const base = Math.floor(n / numChunks);
  const extra = n % numChunks; // the first `extra` chunks get one word more
  const chunks: T[][] = [];
  let idx = 0;
  for (let c = 0; c < numChunks; c++) {
    const size = base + (c < extra ? 1 : 0);
    chunks.push(words.slice(idx, idx + size));
    idx += size;
  }
  return chunks;
}

/**
 * An outline drawn as stacked text-shadows at every integer offset in the
 * (2·px+1)² neighbourhood except the centre — i.e. `(2px+1)² − 1` shadows.
 *
 * COST NOTE, ported as found: at the default `strokeWidthPx: 4` that is **80
 * stacked shadows per span**, re-rasterised every frame for every visible word.
 * It is a real render-time expense and a genuine future optimisation target
 * (`-webkit-text-stroke`, or a paint-once SVG filter), but changing it here
 * would change the pixels of the one brand shipping captions today, so it is
 * deliberately left alone.
 */
export function strokeShadow(px: number, color: string): string {
  const offsets: Array<[number, number]> = [];
  for (let dx = -px; dx <= px; dx++) {
    for (let dy = -px; dy <= px; dy++) {
      if (dx === 0 && dy === 0) continue;
      offsets.push([dx, dy]);
    }
  }
  return offsets.map(([dx, dy]) => `${dx}px ${dy}px 0 ${color}`).join(', ');
}
