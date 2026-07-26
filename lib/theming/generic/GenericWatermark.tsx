// Explicit React import: files under lib/theming are transformed with the classic JSX runtime under the editor's Vitest config, so `React` must be in scope.
import React from 'react';
import { Img, staticFile } from 'remotion';

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** How the mark is painted.
 *  - `image` (default): an `<Img>` of the asset, exactly as before.
 *  - `tint`: NO `<Img>` at all — the PNG is applied as an alpha MASK over a
 *    solid-colour div, so ONE asset renders in ANY brand colour. Lifted from a
 *    brand template that had been carrying this technique privately. */
export type WatermarkMode = 'image' | 'tint';

/** Margin from the frame edge. A single number sets both axes (that is what
 *  `marginPx` has always meant); the object form anchors each axis
 *  independently, which a tightly-cropped mark needs — one brand shipping
 *  today uses vertical 40 / horizontal 36. */
export type WatermarkMargin = number | { vertical: number; horizontal: number };

export interface WatermarkProps {
  /** One or more logo images the user can switch between. */
  assets?: string[];
  /** Back-compat single asset (treated as assets:[asset] when assets is absent). */
  asset?: string;
  /** Which image in `assets` to show (default 0). */
  index?: number;
  corner?: Corner;
  sizePx?: number;
  /** Back-compat alias for `margin` as a single number. `margin` wins. */
  marginPx?: number;
  margin?: WatermarkMargin;
  alpha?: number;
  mode?: WatermarkMode;
  /** The tint colour. Only read when `mode` is `'tint'`. */
  color?: string;
}

/** Neutral default margin, both axes. Never a brand's value. */
export const DEFAULT_WATERMARK_MARGIN_PX = 40;
/** Neutral tint fallback, used when `mode: 'tint'` carries no `color` — black,
 *  so a missing brand colour is visible rather than an invisible mark. */
export const DEFAULT_WATERMARK_TINT_COLOR = '#000000';
/** Neutral default box size. */
export const DEFAULT_WATERMARK_SIZE_PX = 160;

/** THE one margin rule: `margin` wins over the `marginPx` alias; a bare number
 *  means both axes; neither given means the neutral default on both. */
export function resolveWatermarkMargin(
  margin: WatermarkMargin | undefined,
  marginPx: number | undefined,
): { vertical: number; horizontal: number } {
  const raw = margin ?? marginPx ?? DEFAULT_WATERMARK_MARGIN_PX;
  return typeof raw === 'number' ? { vertical: raw, horizontal: raw } : raw;
}

// Declarative corner→edge map (mirrors placement.ts's PlacementGeometry table).
// Each entry names the two edge props, and WHICH margin axis each anchors at.
const CORNER_EDGES: Record<Corner, [vertical: 'top' | 'bottom', horizontal: 'left' | 'right']> = {
  'top-left': ['top', 'left'],
  'top-right': ['top', 'right'],
  'bottom-left': ['bottom', 'left'],
  'bottom-right': ['bottom', 'right'],
};

function cornerStyle(
  corner: Corner,
  margin: { vertical: number; horizontal: number },
): Pick<React.CSSProperties, 'top' | 'right' | 'bottom' | 'left'> {
  const [v, h] = CORNER_EDGES[corner];
  // Assign into a typed object (not a computed-key literal, which TS widens to
  // an index signature that no longer satisfies the Pick<CSSProperties> return).
  const edges: Pick<React.CSSProperties, 'top' | 'right' | 'bottom' | 'left'> = {};
  edges[v] = margin.vertical;
  edges[h] = margin.horizontal;
  return edges;
}

/** The mark's whole inline style. Exported because the `WebkitMask*` longhands
 *  are DROPPED by jsdom's CSSStyleDeclaration — asserting them off rendered DOM
 *  would pass vacuously, so the tint contract is pinned on this builder, which
 *  is the same one the component below uses. */
export function watermarkStyle(props: WatermarkProps, src: string): React.CSSProperties {
  const sizePx = props.sizePx ?? DEFAULT_WATERMARK_SIZE_PX;
  const base: React.CSSProperties = {
    ...cornerStyle(props.corner ?? 'top-right', resolveWatermarkMargin(props.margin, props.marginPx)),
    width: sizePx,
    opacity: props.alpha ?? 1,
    position: 'absolute',
    pointerEvents: 'none',
  };

  if (props.mode === 'tint') {
    const mask = `url(${src})`;
    return {
      ...base,
      // An empty div has NO intrinsic size, so unlike the <Img> path the tint
      // box needs an explicit height. `maskSize: contain` keeps the mark's own
      // aspect ratio inside that square — it is a bounding box, not a stretch.
      height: sizePx,
      backgroundColor: props.color ?? DEFAULT_WATERMARK_TINT_COLOR,
      WebkitMaskImage: mask,
      maskImage: mask,
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
    };
  }

  // `height: 'auto'` — the <Img> keeps the asset's own aspect ratio. Core does
  // NOT force a square box here; a brand whose asset is square gets a square
  // mark for free, and one whose asset is not keeps its proportions.
  return { ...base, height: 'auto' };
}

export const GenericWatermark: React.FC<WatermarkProps> = (props) => {
  // Back-compat: a single `asset` reads as a one-element `assets` list.
  const imageList = props.assets ?? (props.asset ? [props.asset] : []);
  if (imageList.length === 0) return null;

  // The chosen image, clamped so an out-of-range index never picks `undefined`.
  const idx = Math.min(Math.max(props.index ?? 0, 0), imageList.length - 1);
  const selectedImage = imageList[idx];
  const src = selectedImage.startsWith('http') ? selectedImage : staticFile(selectedImage);

  const style = watermarkStyle(props, src);

  if (props.mode === 'tint') return <div style={style} />;
  return <Img src={src} style={style} />;
};
