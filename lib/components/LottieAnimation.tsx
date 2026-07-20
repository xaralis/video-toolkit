/**
 * Lottie Animation Component
 *
 * Frame-synced wrapper around @remotion/lottie's <Lottie>. Loads animation data
 * from a public/ path (via staticFile) or accepts inline animationData, and renders
 * it deterministically against the Remotion timeline. Optionally recolors fills/strokes
 * at runtime and positions itself as an overlay.
 *
 * @example
 * ```tsx
 * import { LottieAnimation } from '../../../lib/components';
 *
 * // From a materialized asset in the project's public/lottie/
 * <LottieAnimation src="lottie/spinner.json" size={220} x={50} y={50} />
 *
 * // Inline data with a quick runtime recolor
 * <LottieAnimation animationData={data} recolor={{ '#ea580c': '#1d4ed8' }} loop />
 * ```
 */

import { Lottie, LottieAnimationData } from '@remotion/lottie';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  cancelRender,
  continueRender,
  delayRender,
  staticFile,
} from 'remotion';

export interface LottieAnimationProps {
  /** Path relative to the project's public/ dir, e.g. 'lottie/spinner.json'. One of src/animationData required. */
  src?: string;
  /** Inline Lottie JSON. Takes precedence over src. */
  animationData?: LottieAnimationData;
  /** Loop playback (default true). */
  loop?: boolean;
  /** Playback rate multiplier (default 1). Maps to Lottie playbackRate. */
  speed?: number;
  /** Play direction: 1 forward (default), -1 reverse. */
  direction?: 1 | -1;
  /** Runtime hex→hex recolor of fills/strokes, e.g. { '#ea580c': '#1d4ed8' }. */
  recolor?: Record<string, string>;
  /** Horizontal center as % of parent (0–100). If x/y/size omitted, renders inline. */
  x?: number;
  /** Vertical center as % of parent (0–100). */
  y?: number;
  /** Rendered width & height in px. */
  size?: number;
  /** Extra style overrides merged last. */
  style?: React.CSSProperties;
}

const clampByte = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

const hexToRgb = (hex: string): [number, number, number] => {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
};

const rgbToHex = (k: number[]): string =>
  '#' +
  k
    .slice(0, 3)
    .map((c) => clampByte(c * 255).toString(16).padStart(2, '0'))
    .join('');

/** Deep-clone `data` and remap fill/stroke colors per a hex→hex map. */
export const recolorLottie = (
  data: LottieAnimationData,
  map: Record<string, string>,
): LottieAnimationData => {
  const norm: Record<string, string> = {};
  for (const [from, to] of Object.entries(map)) norm[from.toLowerCase()] = to;
  const clone = JSON.parse(JSON.stringify(data));
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
    } else if (node && typeof node === 'object') {
      const obj = node as Record<string, any>;
      if (
        (obj.ty === 'fl' || obj.ty === 'st') &&
        obj.c &&
        Array.isArray(obj.c.k) &&
        obj.c.k.length >= 3 &&
        obj.c.k.slice(0, 3).every((n: unknown) => typeof n === 'number')
      ) {
        const current = rgbToHex(obj.c.k).toLowerCase();
        if (norm[current]) {
          const [r, g, b] = hexToRgb(norm[current]);
          const alpha = obj.c.k.length > 3 ? obj.c.k[3] : 1;
          obj.c.k = [r, g, b, alpha];
        }
      }
      Object.values(obj).forEach(walk);
    }
  };
  walk(clone);
  return clone;
};

export const LottieAnimation: React.FC<LottieAnimationProps> = ({
  src,
  animationData,
  loop = true,
  speed = 1,
  direction = 1,
  recolor,
  x,
  y,
  size,
  style,
}) => {
  const [handle] = useState(() => delayRender('Loading Lottie animation'));
  const [loaded, setLoaded] = useState<LottieAnimationData | null>(
    animationData ?? null,
  );

  const continuedRef = useRef(false);
  const finishLoading = useCallback(() => {
    if (!continuedRef.current) {
      continuedRef.current = true;
      continueRender(handle);
    }
  }, [handle]);

  useEffect(() => {
    if (animationData) {
      setLoaded(animationData);
      finishLoading();
      return;
    }
    if (!src) {
      cancelRender(new Error('LottieAnimation requires `src` or `animationData`'));
      return;
    }
    let cancelled = false;
    fetch(staticFile(src))
      .then((res) => res.json())
      .then((json: LottieAnimationData) => {
        if (!cancelled) {
          setLoaded(json);
          finishLoading();
        }
      })
      .catch((err) => cancelRender(err));
    return () => {
      cancelled = true;
    };
  }, [src, animationData, finishLoading]);

  const finalData = useMemo(
    () => (loaded && recolor ? recolorLottie(loaded, recolor) : loaded),
    [loaded, recolor],
  );

  if (!finalData) return null;

  const positioned =
    x !== undefined || y !== undefined || size !== undefined;
  const containerStyle: React.CSSProperties = positioned
    ? {
        position: 'absolute',
        left: `${x ?? 50}%`,
        top: `${y ?? 50}%`,
        width: size,
        height: size,
        transform: 'translate(-50%, -50%)',
        ...style,
      }
    : { width: size, height: size, ...style };

  return (
    <div style={containerStyle}>
      <Lottie
        animationData={finalData}
        loop={loop}
        direction={direction}
        playbackRate={speed}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};

export default LottieAnimation;
