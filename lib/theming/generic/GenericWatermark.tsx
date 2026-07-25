// Explicit React import: files under lib/theming are transformed with the classic JSX runtime under the editor's Vitest config, so `React` must be in scope.
import React from 'react';
import { Img, staticFile } from 'remotion';

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface WatermarkProps {
  /** One or more logo images the user can switch between. */
  assets?: string[];
  /** Back-compat single asset (treated as assets:[asset] when assets is absent). */
  asset?: string;
  /** Which image in `assets` to show (default 0). */
  index?: number;
  corner?: Corner;
  sizePx?: number;
  marginPx?: number;
  alpha?: number;
}

// Declarative corner→edge map (mirrors placement.ts's PlacementGeometry table).
// Each entry names the two edge props to anchor at `marginPx`.
const CORNER_EDGES: Record<Corner, [vertical: 'top' | 'bottom', horizontal: 'left' | 'right']> = {
  'top-left': ['top', 'left'],
  'top-right': ['top', 'right'],
  'bottom-left': ['bottom', 'left'],
  'bottom-right': ['bottom', 'right'],
};

function cornerStyle(corner: Corner, marginPx: number): Pick<React.CSSProperties, 'top' | 'right' | 'bottom' | 'left'> {
  const [v, h] = CORNER_EDGES[corner];
  // Assign into a typed object (not a computed-key literal, which TS widens to
  // an index signature that no longer satisfies the Pick<CSSProperties> return).
  const edges: Pick<React.CSSProperties, 'top' | 'right' | 'bottom' | 'left'> = {};
  edges[v] = marginPx;
  edges[h] = marginPx;
  return edges;
}

export const GenericWatermark: React.FC<WatermarkProps> = (props) => {
  // Back-compat: a single `asset` reads as a one-element `assets` list.
  const imageList = props.assets ?? (props.asset ? [props.asset] : []);
  if (imageList.length === 0) return null;

  // The chosen image, clamped so an out-of-range index never picks `undefined`.
  const idx = Math.min(Math.max(props.index ?? 0, 0), imageList.length - 1);
  const selectedImage = imageList[idx];
  const src = selectedImage.startsWith('http') ? selectedImage : staticFile(selectedImage);

  const style: React.CSSProperties = {
    ...cornerStyle(props.corner ?? 'top-right', props.marginPx ?? 40),
    width: props.sizePx ?? 160,
    height: 'auto',
    opacity: props.alpha ?? 1,
    position: 'absolute',
    pointerEvents: 'none',
  };

  return <Img src={src} style={style} />;
};
