import { useCurrentFrame, useVideoConfig } from 'remotion';
import { parseAccents, applyBrandEndpoint } from '../transcripts/accent-parser';

// QuotePullBase — the shared, brand-agnostic skeleton for a quote-pull overlay.
// It owns the parts every brand's quote-pull needs identically — appear/duration
// gating, accent parsing, and splitting the (single- or multi-line) text into
// lines/tokens — and delegates the ACTUAL look (typography, colours, per-line or
// per-char reveal, placement) to a brand-supplied `render` prop. Each brand
// exports a thin QuotePull that extends this with its own rendering (campaign's
// decoder-scramble pill; roost's stacked cream/brown stroke stack), instead of
// duplicating the gating/parse plumbing. Lives in core so every brand imports it
// via @video-toolkit/lib.

/** One accent-parsed run: text + its accent key ('lime' | 'teal' | brand key) or null. */
export interface QuotePullToken {
  text: string;
  color: string | null;
}

export interface QuotePullRenderCtx {
  /** Flat accent runs across the whole text (newlines live inside token text). */
  tokens: QuotePullToken[];
  /** The same runs split into lines on '\n' — for stacked/multi-line brands. */
  lines: QuotePullToken[][];
  /** The raw (endpoint-applied) text. */
  text: string;
  /** Frames since the overlay appeared, and its total on-screen frame count. */
  localFrame: number;
  totalFrames: number;
  fps: number;
}

export interface QuotePullBaseProps {
  text: string;
  /** ms from the composition/segment start (the caller mounts it in a Sequence). */
  appearAtMs: number;
  durationMs: number;
  /** Apply the brand-endpoint accent transform (trailing-punctuation rule). Default true. */
  applyEndpoint?: boolean;
  render: (ctx: QuotePullRenderCtx) => React.ReactNode;
}

/** Split accent runs into per-line token arrays on embedded '\n'. */
function splitLines(tokens: QuotePullToken[]): QuotePullToken[][] {
  const lines: QuotePullToken[][] = [[]];
  for (const t of tokens) {
    const parts = t.text.split('\n');
    parts.forEach((p, i) => {
      if (i > 0) lines.push([]);
      if (p.length > 0) lines[lines.length - 1].push({ text: p, color: t.color });
    });
  }
  return lines;
}

export function QuotePullBase({ text, appearAtMs, durationMs, applyEndpoint = true, render }: QuotePullBaseProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const start = Math.round((appearAtMs / 1000) * fps);
  const end = start + Math.round((durationMs / 1000) * fps);
  if (frame < start || frame > end) return null;

  const source = applyEndpoint ? applyBrandEndpoint(text) : text;
  const tokens = parseAccents(source).map((t) => ({ text: t.text, color: t.color })) as QuotePullToken[];
  return <>{render({ tokens, lines: splitLines(tokens), text: source, localFrame: frame - start, totalFrames: end - start, fps })}</>;
}
