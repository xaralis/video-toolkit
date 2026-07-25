import React from 'react';
import type { OverlayRenderProps } from '../types';
import { placementGeometry } from '../placement';
import { parseAccents } from '../../transcripts/accent-parser';

/** Core default text renderer: positioned plain text, sane defaults, NO accent
 *  coloring and NO animation. The fallback when a brand registers no custom
 *  text renderer. */
export const GenericTextOverlay: React.FC<OverlayRenderProps> = ({ text, placement, fontSize = 64 }) => {
  const plain = parseAccents(text).map((t) => t.text).join('');
  const geo = placementGeometry(placement);
  return React.createElement(
    'div',
    {
      style: {
        position: 'absolute',
        ...geo.containerStyle,
        transform: 'translateY(-50%)',
        textAlign: geo.textAlign,
        color: '#ffffff',
        fontFamily: 'sans-serif',
        fontWeight: 700,
        fontSize,
        lineHeight: 1.3,
        whiteSpace: 'pre-wrap',
        pointerEvents: 'none',
      } as React.CSSProperties,
    },
    plain,
  );
};
