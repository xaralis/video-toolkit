import type { CSSProperties } from 'react';

/** The editor chrome's "on" accent — core's editor UI colour, NOT a brand
 *  colour. Mirrors `--ed-color-accent` in `app/editor.in.css`; kept as a JS
 *  string for the few consumers that cannot use a class (an SVG stroke, a
 *  spinner border). A brand's palette reaches the editor only through
 *  `accentSlots`. */
export const EDITOR_ACCENT = '#7c5cff';

/** One button metric across the whole timeline toolbar. */
export const BTN_H = 28;
export const BTN_FONT = 12;

export const zoomBtn: CSSProperties = {
  background: '#26282f',
  color: '#e8e8ea',
  border: '1px solid #34363e',
  borderRadius: 4,
  width: BTN_H,
  height: BTN_H,
  fontSize: BTN_FONT,
  lineHeight: '1',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

/** A pill toggle (Ripple / Snap / Beats): accented when on, neutral when off. */
export const toggleBtn = (on: boolean): CSSProperties => ({
  background: on ? EDITOR_ACCENT : '#26282f',
  color: on ? '#17181c' : '#e8e8ea',
  border: '1px solid #34363e',
  borderRadius: 4,
  height: BTN_H,
  padding: '0 12px',
  fontSize: BTN_FONT,
  cursor: 'pointer',
});
