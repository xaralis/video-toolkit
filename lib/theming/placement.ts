import type { CSSProperties } from 'react';

/** The shared overlay positioning vocabulary — 3 full-width bands + 8 anchored
 *  zones — lifted from campaign's QuotePullOverlay so every renderer positions
 *  by the same set.
 *
 *  This ordered tuple is the SINGLE source of truth: the `Placement` type, the
 *  `PLACEMENT` geometry record below, and the editor's position dropdown
 *  (`OVERLAY_POSITIONS` in LayeredInspector) all derive from it. Keeping them
 *  from being three hand-maintained lists is what stops the vocabulary drifting
 *  — the drift that let the old dropdown's `center-left`/`center-right` (which
 *  had no geometry entry) silently render as the center fallback. */
export const PLACEMENTS = [
  'upper-third', 'center', 'lower-third',
  'upper-left', 'upper-center', 'upper-right',
  'mid-left', 'mid-right',
  'lower-left', 'lower-center', 'lower-right',
] as const;

export type Placement = (typeof PLACEMENTS)[number];

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

/** Legacy / synonym position strings the editor may have persisted before the
 *  dropdown adopted the canonical PLACEMENTS vocabulary, each mapped to the real
 *  zone it should now resolve to. Values outside PLACEMENTS that aren't listed
 *  here fall through to DEFAULT_PLACEMENT.
 *
 *  `center-left`/`center-right` resolve to the mid halves: same vertical band
 *  they always implied, and the nearest real zone — previously they silently
 *  fell back to full center, jumping the overlay to the middle. */
const PLACEMENT_ALIASES: Record<string, Placement> = {
  'center-left': 'mid-left',
  'center-right': 'mid-right',
};

/** Geometry for a placement; legacy synonyms are normalized via PLACEMENT_ALIASES,
 *  and anything still unknown falls back to DEFAULT_PLACEMENT. */
export function placementGeometry(p: Placement): PlacementGeometry {
  return PLACEMENT[p] ?? PLACEMENT[PLACEMENT_ALIASES[p as string]] ?? PLACEMENT[DEFAULT_PLACEMENT];
}

export interface CompactPlacementGeometry {
  /** Absolute offsets for a shrink-to-fit box. Never sets left AND right. */
  containerStyle: CSSProperties;
  /** True when the box must additionally be pulled back by translateX(-50%). */
  centered: boolean;
  textAlign: 'left' | 'right' | 'center';
}

/** Placement geometry adapted for a COMPACT overlay — a chevron marker, a
 *  badge, a source tag: something that shrink-wraps its content and carries its
 *  own background plate.
 *
 *  Such a box cannot take `placementGeometry`'s containerStyle verbatim. That
 *  geometry is written for full-bleed text blocks, so the three bands set both
 *  `left: 6%` and `right: 6%` — which on a plated box stretches the plate into
 *  a letterbox bar across the frame. Here the placement's vertical band is kept
 *  as-is and the horizontal is collapsed to a SINGLE edge: the anchored zones
 *  keep whichever side they're anchored to, and a band's left+right pair
 *  becomes a true center (left 50% + the `centered` flag, so the caller can
 *  fold translateX(-50%) into whatever transform it is already building).
 *
 *  Deriving from the same PLACEMENT table is the point: the vocabulary stays
 *  single-sourced, so a placement added to PLACEMENTS works for compact
 *  overlays for free. */
export function compactPlacementGeometry(p: Placement): CompactPlacementGeometry {
  const { containerStyle, textAlign } = placementGeometry(p);
  const { top, left, right } = containerStyle;
  if (left !== undefined && right !== undefined) {
    return { containerStyle: { top, left: '50%' }, centered: true, textAlign };
  }
  return {
    containerStyle: right !== undefined ? { top, right } : { top, left },
    centered: false,
    textAlign,
  };
}
