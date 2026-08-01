// Explicit React import: files under lib/theming are transformed with the classic JSX runtime under the editor's Vitest config, so `React` must be in scope.
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import type { CaptionTokens } from '../tokens';
import {
  activeAmount,
  chunkWords,
  linesFromWords,
  strokeShadow,
  DEFAULT_CAPTION_WORD_FADE_MS,
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

// Pop-focus pill geometry and highlight-envelope constants, promoted to
// CaptionTokens fields at Task 5.1. These remain as the DEFAULTS a brand can
// override; campaign-reels' tuned numbers, kept verbatim for render parity.
//
// POP_PAD_X / POP_PAD_Y used to be flat px against a token-driven `fontSize`
// (default 52) — the exact bug this task exists to fix (see tokens.ts's
// `popPadXEm`/`popPadYEm` doc). They and HALO_MAX are now expressed as a
// ratio of `fontSize`, computed in JS against the plain (pre-multiplier)
// token — not CSS `em`, because the pop-focus pill's own computed font-size
// already carries `popFontMultiplier`, and an em there would double-apply it.
// Both ratios below round-trip to the pre-Task-5.1 px literals EXACTLY at the
// default `fontSize` of 52 (verified: `(22/52)*52 === 22`, `(10/52)*52 === 10`
// in IEEE-754 double precision).
const DEFAULT_POP_FONT_MULTIPLIER = 1.04;
const DEFAULT_POP_PAD_X_EM = 22 / 52;
const DEFAULT_POP_PAD_Y_EM = 10 / 52;
/** Brief tail past a chunk's last word so a chunk does not snap out before the
 *  next one takes over. A duration, not geometry — stays absolute ms. */
const DEFAULT_POP_TAIL_MS = 30;
const DEFAULT_POP_LETTER_SPACING = '0.02em';
const DEFAULT_POP_LINE_HEIGHT = 1.1;
// Word gap, RECONCILED at Task 5.1: pop-focus used '0.4em', highlight used
// '0.45em' for the same "space between words" concept. One token now; see
// tokens.ts's `wordGap` doc for which value won and why.
const DEFAULT_WORD_GAP = '0.4em';

// Highlight-mode envelope constants.
const DEFAULT_HIGHLIGHT_OPACITY_INACTIVE = 0.55;
const DEFAULT_HIGHLIGHT_SCALE_BUMP = 0.08;
const DEFAULT_HIGHLIGHT_HALO_MAX_EM = 10 / 52;
const DEFAULT_HIGHLIGHT_HALO_ALPHA = 0.5;
const DEFAULT_HIGHLIGHT_LETTER_SPACING = '0.02em';
const DEFAULT_HIGHLIGHT_LINE_HEIGHT = 1.2;

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
 * Every colour, font AND geometry magnitude arrives from {@link CaptionTokens}
 * with a neutral default — no brand's identity colour, typeface or tuned
 * geometry is in this file. As of Task 5.1 the pop-pill padding and the
 * highlight halo are TOKENS EXPRESSED AS A RATIO of `fontSize`, not px, so
 * they scale when a brand raises `fontSize` instead of silently decoupling
 * from it (see `popPadXEm`/`popPadYEm`/`highlightHaloMaxEm` on
 * {@link CaptionTokens}). Defaults are campaign-reels' tuned numbers, kept
 * verbatim for render parity. Read "neutral" as "carries no brand identity",
 * not as "derived from nothing".
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
  const wordFadeMs = t.wordFadeMs ?? DEFAULT_CAPTION_WORD_FADE_MS;
  const popFontMultiplier = t.popFontMultiplier ?? DEFAULT_POP_FONT_MULTIPLIER;
  const popPadXPx = fontSize * (t.popPadXEm ?? DEFAULT_POP_PAD_X_EM);
  const popPadYPx = fontSize * (t.popPadYEm ?? DEFAULT_POP_PAD_Y_EM);
  const popTailMs = t.popTailMs ?? DEFAULT_POP_TAIL_MS;
  const popLetterSpacing = t.popLetterSpacing ?? DEFAULT_POP_LETTER_SPACING;
  const popLineHeight = t.popLineHeight ?? DEFAULT_POP_LINE_HEIGHT;
  const wordGap = t.wordGap ?? DEFAULT_WORD_GAP;
  const highlightOpacityInactive = t.highlightOpacityInactive ?? DEFAULT_HIGHLIGHT_OPACITY_INACTIVE;
  const highlightScaleBump = t.highlightScaleBump ?? DEFAULT_HIGHLIGHT_SCALE_BUMP;
  const highlightHaloMaxPx = fontSize * (t.highlightHaloMaxEm ?? DEFAULT_HIGHLIGHT_HALO_MAX_EM);
  const highlightHaloAlpha = t.highlightHaloAlpha ?? DEFAULT_HIGHLIGHT_HALO_ALPHA;
  const highlightLetterSpacing = t.highlightLetterSpacing ?? DEFAULT_HIGHLIGHT_LETTER_SPACING;
  const highlightLineHeight = t.highlightLineHeight ?? DEFAULT_HIGHLIGHT_LINE_HEIGHT;

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
      (c) => ms >= c[0].startMs && ms < c[c.length - 1].endMs + popTailMs,
    );
    if (!activeChunk) return null;

    return shell(
      <div
        data-caption-pill
        style={{
          background,
          padding: `${popPadYPx}px ${popPadXPx}px`,
          fontFamily,
          fontWeight,
          fontSize: fontSize * popFontMultiplier,
          letterSpacing: popLetterSpacing,
          lineHeight: popLineHeight,
          whiteSpace: 'nowrap',
        }}
      >
        {activeChunk.map((w, i) => (
          <span
            key={i}
            data-caption-word
            style={{
              display: 'inline-block',
              color: activeAmount(w.startMs, w.endMs, ms, wordFadeMs) > 0 ? activeColor : color,
              textShadow: baseStroke,
              marginRight: i < activeChunk.length - 1 ? wordGap : 0,
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
        lineHeight: highlightLineHeight,
        letterSpacing: highlightLetterSpacing,
      }}
    >
      {active.words && active.words.length > 0 ? (
        active.words.map((w, i) => {
          const amount = activeAmount(w.startMs, w.endMs, ms, wordFadeMs);
          const shadow =
            amount > 0
              ? `0 0 ${highlightHaloMaxPx * amount}px ${withAlpha(
                  activeColor,
                  highlightHaloAlpha * amount,
                )}, ${baseStroke}`
              : baseStroke;
          return (
            <span
              key={i}
              data-caption-word
              style={{
                display: 'inline-block',
                opacity: highlightOpacityInactive + (1 - highlightOpacityInactive) * amount,
                transform: `scale(${1 + highlightScaleBump * amount})`,
                transformOrigin: 'center',
                textShadow: shadow,
                marginRight: i < active.words!.length - 1 ? wordGap : 0,
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
