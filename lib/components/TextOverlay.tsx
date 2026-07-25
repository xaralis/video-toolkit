// Explicit React import: files under lib/components are transformed with the classic JSX runtime under the editor's Vitest config, so `React` must be in scope.
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { parseAccents, applyBrandEndpoint } from '../transcripts/accent-parser';
import { resolveAccentColor, type AccentSlot } from '../theming/palette';

// TextOverlayBase — the shared, brand-agnostic skeleton for a quote-pull overlay.
// It owns the parts every brand's quote-pull needs identically — appear/duration
// gating, accent parsing, and splitting the (single- or multi-line) text into
// lines/tokens — and delegates the ACTUAL look (typography, colours, per-line or
// per-char reveal, placement) to a brand-supplied `render` prop. Each brand
// exports a thin quote-pull that extends this with its own rendering, instead of
// duplicating the gating/parse plumbing. Lives in core so every brand imports it
// via @video-toolkit/lib.

/** One accent-parsed run: text + the brand accent-slot key it names, or null when unaccented. */
export interface TextToken {
  text: string;
  color: string | null;
}

export interface TextRenderCtx {
  /** Flat accent runs across the whole text (newlines live inside token text). */
  tokens: TextToken[];
  /** The same runs split into lines on '\n' — for stacked/multi-line brands. */
  lines: TextToken[][];
  /** The raw (endpoint-applied) text. */
  text: string;
  /** Frames since the overlay appeared, and its total on-screen frame count. */
  localFrame: number;
  totalFrames: number;
  fps: number;
}

export interface TextOverlayBaseProps {
  text: string;
  /** ms from the composition/segment start (the caller mounts it in a Sequence). */
  appearAtMs: number;
  durationMs: number;
  /** The brand accent-slot key that wraps a trailing `.` (the endpoint rule).
   *  Omit it — the default — to leave the text exactly as authored. Core has no
   *  accent slot of its own, so there is nothing to fall back to. */
  endpointKey?: string;
  /** When present, token color KEYS are resolved to hex via this palette; when
   *  absent, tokens keep their raw accent key (back-compat). */
  palette?: readonly AccentSlot[];
  render: (ctx: TextRenderCtx) => React.ReactNode;
}

/** Split accent runs into per-line token arrays on embedded '\n'. */
function splitLines(tokens: TextToken[]): TextToken[][] {
  const lines: TextToken[][] = [[]];
  for (const t of tokens) {
    const parts = t.text.split('\n');
    parts.forEach((p, i) => {
      if (i > 0) lines.push([]);
      if (p.length > 0) lines[lines.length - 1].push({ text: p, color: t.color });
    });
  }
  return lines;
}

export function TextOverlayBase({ text, appearAtMs, durationMs, endpointKey, palette, render }: TextOverlayBaseProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const start = Math.round((appearAtMs / 1000) * fps);
  const end = start + Math.round((durationMs / 1000) * fps);
  if (frame < start || frame > end) return null;

  const source = applyBrandEndpoint(text, endpointKey);
  const parsed = parseAccents(source).map((t) => ({ text: t.text, color: t.color })) as TextToken[];
  const tokens: TextToken[] = palette
    ? parsed.map((t) => ({ text: t.text, color: resolveAccentColor(palette, t.color) }))
    : parsed;
  return <>{render({ tokens, lines: splitLines(tokens), text: source, localFrame: frame - start, totalFrames: end - start, fps })}</>;
}
