// Explicit React import: files under lib/theming are transformed with the classic JSX runtime under the editor's Vitest config, so `React` must be in scope.
import React from 'react';

/** The look constants of the disclaimer row. Every field is optional with a
 *  NEUTRAL default (see tokens.ts's discipline) — a brand's real values are
 *  named as EXAMPLES only, never baked in. */
export interface DisclaimerProps {
  /** The legal line itself. Empty (or whitespace-only) draws nothing. */
  text?: string;
  /** Distance from the bottom edge, in composition px. Default 40 (one brand
   *  shipping today lifts it to sit above its caption band). */
  bottomOffsetPx?: number;
  /** Horizontal inset, in composition px. Default 40. */
  paddingX?: number;
  /** Default `monospace` (one brand uses `JetBrains Mono, monospace`). */
  fontFamily?: string;
  /** Default 20. */
  fontSize?: number;
  /** Default 400. */
  fontWeight?: number;
  /** Default `#ffffff`. */
  color?: string;
  /** Default `normal` (a brand tracking its legal line out uses `0.05em`). */
  letterSpacing?: string;
  /** Default `center`. */
  textAlign?: 'left' | 'center' | 'right';
  /** Default 1. */
  alpha?: number;
}

/** A full-width legal row pinned to the bottom edge. Deliberately has NO
 *  background: it must be present but non-distracting, and a plate behind it
 *  is a brand decision, not core's. */
export const GenericDisclaimer: React.FC<DisclaimerProps> = (props) => {
  const text = props.text ?? '';
  if (text.trim().length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: props.bottomOffsetPx ?? 40,
        padding: `0 ${props.paddingX ?? 40}px`,
        textAlign: props.textAlign ?? 'center',
        fontFamily: props.fontFamily ?? 'monospace',
        fontSize: props.fontSize ?? 20,
        fontWeight: props.fontWeight ?? 400,
        color: props.color ?? '#ffffff',
        letterSpacing: props.letterSpacing ?? 'normal',
        opacity: props.alpha ?? 1,
        pointerEvents: 'none',
      }}
    >
      {text}
    </div>
  );
};
