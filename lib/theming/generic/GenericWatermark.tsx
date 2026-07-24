import React from 'react';
import { Img, staticFile } from 'remotion';

export interface WatermarkProps {
  /** One or more logo images the user can switch between. */
  assets?: string[];
  /** Back-compat single asset (treated as assets:[asset] when assets is absent). */
  asset?: string;
  /** Which image in `assets` to show (default 0). */
  index?: number;
  corner?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  sizePx?: number;
  marginPx?: number;
  alpha?: number;
}

const cornerStyle = (
  corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right',
  marginPx: number,
): Pick<React.CSSProperties, 'top' | 'right' | 'bottom' | 'left'> => {
  switch (corner) {
    case 'top-left':
      return { top: marginPx, left: marginPx };
    case 'top-right':
      return { top: marginPx, right: marginPx };
    case 'bottom-left':
      return { bottom: marginPx, left: marginPx };
    case 'bottom-right':
      return { bottom: marginPx, right: marginPx };
  }
};

export const GenericWatermark: React.FC<WatermarkProps> = (props) => {
  // Resolve image list: use assets if present, fallback to single asset
  const imageList = props.assets ?? (props.asset ? [props.asset] : []);

  // If no images, render nothing
  if (imageList.length === 0) {
    return null;
  }

  // Pick the image, clamped to valid range
  const idx = Math.min(Math.max(props.index ?? 0, 0), imageList.length - 1);
  const selectedImage = imageList[idx];

  // Resolve src: use HTTP URLs directly, local paths via staticFile
  const src = selectedImage.startsWith('http') ? selectedImage : staticFile(selectedImage);

  // Determine corner position
  const corner = props.corner ?? 'top-right';
  const marginPx = props.marginPx ?? 40;
  const sizePx = props.sizePx ?? 160;
  const alpha = props.alpha ?? 1;

  const cornerPos = cornerStyle(corner, marginPx);

  return (
    <Img
      src={src}
      style={{
        ...cornerPos,
        width: sizePx,
        height: 'auto',
        opacity: alpha,
        position: 'absolute',
        pointerEvents: 'none',
      } as React.CSSProperties}
    />
  );
};
