// Explicit React import: files under lib/theming are transformed with the classic JSX runtime under the editor's Vitest config, so `React` must be in scope.
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import type { CaptionTokens } from '../tokens';
import {
  activeAmount,
  chunkWords,
  linesFromWords,
  strokeShadow,
  type CaptionLine,
  type CaptionLineWord,
  type CaptionLiftWindow,
  type CaptionSourceWord,
} from './caption-lines';

// `CaptionLiftWindow` used to be DECLARED here, documented as
// "ms, composition-relative", while this component compares it against a
// Sequence-LOCAL `ms` two screens down. It now lives in ./caption-lines.ts with
// the corrected units (see that file, and `rebaseCaptionTimes`), and is
// re-exported from here so every existing import path keeps working.
export type { CaptionLiftWindow };

export interface GenericCaptionsProps {
  /** Word-level timings (seconds), e.g. from `transcriptWindow`. Grouped into
   *  lines by {@link linesFromWords}. Optional so a caller with pre-built
   *  `lines` and no word timing can omit it entirely. */
  words?: CaptionSourceWord[];
  /** Explicit lines. When present the grouper is SKIPPED entirely — this is the
   *  hand-authored-subtitle escape hatch. */
  lines?: CaptionLine[];
  liftWindows?: CaptionLiftWindow[];
  tokens?: CaptionTokens;
}

// Pop-focus pill geometry, campaign-reels' tuned numbers kept verbatim for
// render parity. Not tokens (yet): they are internal to the one mode and the
// brief's CaptionTokens contract is deliberately closed. A second brand that
// needs to move them is the signal to promote them.
const POP_FONT_MULTIPLIER = 1.04;
const POP_PAD_X = 22;
const POP_PAD_Y = 10;
/** Brief tail past a chunk's last word so a chunk does not snap out before the
 *  next one takes over. */
const POP_TAIL_MS = 30;

// Highlight-mode envelope constants.
const HIGHLIGHT_OPACITY_INACTIVE = 0.55;
const HIGHLIGHT_SCALE_BUMP = 0.08;
const HIGHLIGHT_HALO_MAX_PX = 10;
const HIGHLIGHT_HALO_ALPHA = 0.5;

/** Append an alpha channel to a 6-digit hex colour. Any other notation is
 *  returned untouched — this exists so the highlight halo can fade with the
 *  active envelope WITHOUT core hardcoding an `rgba(...)` of one brand's accent
 *  (the ported implementation did exactly that). */
const withAlpha = (color: string, alpha: number): string => {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  const hex = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${color}${hex}`;
};

/**
 * Core's generic burned-in caption track.
 *
 * Two modes, both ported from the single brand that ships captions today:
 *   - `pop-focus` (the default, and that brand's live mode): the line is split
 *     into stable phrase chunks; the current chunk sits still as a `nowrap`
 *     pill while the active word flips colour. Stable line under the eye plus
 *     word tracking by colour = readable but kinetic.
 *   - `highlight`: the whole line is centred, inactive words recede by opacity,
 *     the active word scales up and gains a halo. Dead in that brand's code but
 *     ported anyway — it is the mode a second brand is likely to want, and a
 *     mode that exists only in a brand repo is the copy-paste channel Phase 3
 *     closes.
 *
 * TIME DOMAIN, stated once for all three inputs: `words`, `lines` and
 * `liftWindows` are ALL read against `useCurrentFrame()`, which Remotion
 * rebases to the enclosing `<Sequence>`. So every one of them is in THIS
 * COMPONENT'S OWN local ms, never composition-absolute. A caller holding
 * composition-absolute config runs it through `rebaseCaptionTimes` first —
 * which is exactly what core's own mount (`TrackCaptionsOverlay` in
 * lib/render/layered-composition.tsx) does.
 *
 * Every colour and font arrives from {@link CaptionTokens} with a neutral
 * default — no brand's identity colour or typeface is in this file.
 * GEOMETRY AND TYPOGRAPHY MAGNITUDES ARE NOT ALL TOKENIZED YET: the pop-pill
 * padding, the highlight envelope constants and the default sizes below are
 * campaign-reels' tuned numbers, kept verbatim for render parity and not yet
 * promoted to tokens. They are defaults a second brand cannot currently move
 * (see the constants' own note). Read "neutral" as "carries no brand
 * identity", not as "derived from nothing".
 */
export const GenericCaptions: React.FC<GenericCaptionsProps> = ({
  words,
  lines,
  liftWindows,
  tokens,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;

  const t = tokens ?? {};
  const mode = t.mode ?? 'pop-focus';
  const fontFamily = t.fontFamily ?? 'monospace';
  const fontSize = t.fontSize ?? 52;
  const fontWeight = t.fontWeight ?? 700;
  const color = t.color ?? '#ffffff';
  const activeColor = t.activeColor ?? '#ffff00';
  const background = t.background ?? '#000000';
  const strokeColor = t.strokeColor ?? '#000000';
  const strokeWidthPx = t.strokeWidthPx ?? 4;
  const maxWidthPct = t.maxWidthPct ?? 0.86;
  const bottomPctBase = t.bottomPct ?? 0.2;
  const liftBottomPct = t.liftBottomPct ?? 0.42;

  const isLifted = !!liftWindows?.some((w) => ms >= w.startMs && ms <= w.endMs);
  const bottomPct = isLifted ? liftBottomPct : bottomPctBase;

  const resolvedLines: CaptionLine[] =
    lines ??
    (words
      ? linesFromWords(words, {
          maxChars: t.maxChars,
          gapBreakMs: t.gapBreakMs,
          lastLineGraceMs: t.lastLineGraceMs,
        })
      : []);

  const active = resolvedLines.find((l) => ms >= l.startMs && ms <= l.endMs);
  if (!active) return null;

  // See strokeShadow's cost note: 80 stacked shadows per span at the default
  // stroke width. Computed ONCE per frame and shared by every span.
  const baseStroke = strokeShadow(strokeWidthPx, strokeColor);

  const shell = (children: React.ReactNode) => (
    <div
      data-captions-root
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
      {children}
    </div>
  );

  // ──────── pop-focus: one phrase chunk at a time, in a pill ────────
  if (mode === 'pop-focus' && active.words && active.words.length > 0) {
    const chunks = chunkWords<CaptionLineWord>(active.words, t.maxWordsPerChunk);
    const activeChunk = chunks.find(
      (c) => ms >= c[0].startMs && ms < c[c.length - 1].endMs + POP_TAIL_MS,
    );
    if (!activeChunk) return null;

    return shell(
      <div
        data-caption-pill
        style={{
          background,
          padding: `${POP_PAD_Y}px ${POP_PAD_X}px`,
          fontFamily,
          fontWeight,
          fontSize: fontSize * POP_FONT_MULTIPLIER,
          letterSpacing: '0.02em',
          lineHeight: 1.1,
          whiteSpace: 'nowrap',
        }}
      >
        {activeChunk.map((w, i) => (
          <span
            key={i}
            data-caption-word
            style={{
              display: 'inline-block',
              color: activeAmount(w.startMs, w.endMs, ms) > 0 ? activeColor : color,
              textShadow: baseStroke,
              marginRight: i < activeChunk.length - 1 ? '0.4em' : 0,
            }}
          >
            {w.word}
          </span>
        ))}
      </div>,
    );
  }

  // ──────── highlight: whole line, active word pops ────────
  return shell(
    <div
      data-caption-line
      style={{
        maxWidth: `${maxWidthPct * 100}%`,
        fontFamily,
        fontWeight,
        fontSize,
        color,
        textAlign: 'center',
        lineHeight: 1.2,
        letterSpacing: '0.02em',
      }}
    >
      {active.words && active.words.length > 0 ? (
        active.words.map((w, i) => {
          const amount = activeAmount(w.startMs, w.endMs, ms);
          const shadow =
            amount > 0
              ? `0 0 ${HIGHLIGHT_HALO_MAX_PX * amount}px ${withAlpha(
                  activeColor,
                  HIGHLIGHT_HALO_ALPHA * amount,
                )}, ${baseStroke}`
              : baseStroke;
          return (
            <span
              key={i}
              data-caption-word
              style={{
                display: 'inline-block',
                opacity: HIGHLIGHT_OPACITY_INACTIVE + (1 - HIGHLIGHT_OPACITY_INACTIVE) * amount,
                transform: `scale(${1 + HIGHLIGHT_SCALE_BUMP * amount})`,
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
        // Explicit-lines path with no word timing: one span, no per-word pop.
        <span data-caption-word style={{ textShadow: baseStroke }}>
          {active.text}
        </span>
      )}
    </div>,
  );
};
