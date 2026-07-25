import type { CSSProperties } from 'react';

/** The shared overlay positioning vocabulary — 3 full-width bands + 8 anchored
 *  zones — lifted from campaign's QuotePullOverlay so every renderer positions
 *  by the same set. */
export type Placement =
  | 'upper-third' | 'center' | 'lower-third'
  | 'upper-left' | 'upper-center' | 'upper-right'
  | 'mid-left' | 'mid-right'
  | 'lower-left' | 'lower-center' | 'lower-right';

export interface PlacementGeometry {
  containerStyle: CSSProperties;
  textAlign: 'left' | 'right' | 'center';
}

export const DEFAULT_PLACEMENT: Placement = 'center';

// Anchored *-right / *-center zones sit at top >= 18–20% to clear the top-right
// logo zone; anchored variants cap max-width at 56% so they stay in their half.
const PLACEMENT: Record<Placement, PlacementGeometry> = {
  'upper-third':  { containerStyle: { top: '24%', left: '6%', right: '6%' }, textAlign: 'center' },
  'center':       { containerStyle: { top: '46%', left: '6%', right: '6%' }, textAlign: 'center' },
  'lower-third':  { containerStyle: { top: '58%', left: '6%', right: '6%' }, textAlign: 'center' },
  'upper-left':   { containerStyle: { top: '20%', left: '6%',  maxWidth: '56%' }, textAlign: 'left'  },
  'upper-center': { containerStyle: { top: '20%', left: '6%',  right: '6%'     }, textAlign: 'center' },
  'upper-right':  { containerStyle: { top: '20%', right: '6%', maxWidth: '56%' }, textAlign: 'right' },
  'mid-left':     { containerStyle: { top: '44%', left: '6%',  maxWidth: '56%' }, textAlign: 'left'  },
  'mid-right':    { containerStyle: { top: '44%', right: '6%', maxWidth: '56%' }, textAlign: 'right' },
  'lower-left':   { containerStyle: { top: '60%', left: '6%',  maxWidth: '56%' }, textAlign: 'left'  },
  'lower-center': { containerStyle: { top: '60%', left: '6%',  right: '6%'     }, textAlign: 'center' },
  'lower-right':  { containerStyle: { top: '60%', right: '6%', maxWidth: '56%' }, textAlign: 'right' },
};

/** Geometry for a placement; unknown values fall back to DEFAULT_PLACEMENT. */
export function placementGeometry(p: Placement): PlacementGeometry {
  return PLACEMENT[p] ?? PLACEMENT[DEFAULT_PLACEMENT];
}
