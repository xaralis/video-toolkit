// Explicit React import: files under lib/theming are transformed with the classic JSX runtime under the editor's Vitest config, so `React` must be in scope.
import React from 'react';
import { Img, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig, interpolate, Easing } from 'remotion';
import { cropCoverStyle } from '../../reel-config-base/crop';
import { gradeFilter } from '../../reel-config-base/grade';
import type { Crop, Grade } from '../../reel-config-base/base-types';
import type { VideoRenderProps } from '../types';

const VIDEO_EXT_RE = /\.(mp4|mov|webm)$/i;

function resolveSrc(source: string): string {
  return source.startsWith('http') ? source : staticFile(source);
}

// Ken Burns effect params, as found on a VideoItem's `effects` array (permissive
// passthrough per EffectSchema). Two shapes are supported, mirroring the two
// per-brand originals this primitive unifies:
//  - roost's `direction` shorthand (KenBurnsPhoto.tsx)
//  - campaign's explicit from/to fields (PhotoSegment.tsx / BrollSegment.tsx)
interface KenBurnsEffect {
  type: 'ken-burns';
  direction?: 'in' | 'left' | 'up';
  fromScale?: number;
  toScale?: number;
  fromX?: number;
  toX?: number;
  fromY?: number;
  toY?: number;
}

function findKenBurns(effects: Array<{ type: string }> | undefined): KenBurnsEffect | undefined {
  return effects?.find((e): e is KenBurnsEffect => e.type === 'ken-burns');
}

// Ken Burns transform for the current frame.
//  - `direction` shorthand: replicates KenBurnsPhoto's exact math — scale
//    1.08 + p*(in?0.12:0.06), translate up to -60px for left/up. Pure
//    transform, no objectPosition opinion (composes with a static crop).
//  - explicit from/to shorthand: replicates BrollSegment/PhotoSegment's eased
//    pan+zoom across normalized focal points (falling back to the item's own
//    focalX/focalY as the pan base when a from/to endpoint is omitted). This
//    shape drives its own objectPosition/transformOrigin because the pan
//    point is itself animated — a moving pan point supersedes the crop's
//    fixed one — but the SCALE still composes with the crop's zoom below (via
//    transform string concatenation), so a brand can crop-zoom AND ken-burns
//    zoom at once.
function kenBurnsStyle(
  kb: KenBurnsEffect,
  frame: number,
  durationInFrames: number,
  focalX: number | undefined,
  focalY: number | undefined,
): { transform: string; objectPosition?: string; transformOrigin?: string } {
  if (kb.direction) {
    const p = interpolate(frame, [0, Math.max(1, durationInFrames)], [0, 1], { extrapolateRight: 'clamp' });
    const scale = 1.08 + p * (kb.direction === 'in' ? 0.12 : 0.06);
    const x = kb.direction === 'left' ? interpolate(p, [0, 1], [0, -60]) : 0;
    const y = kb.direction === 'up' ? interpolate(p, [0, 1], [0, -60]) : 0;
    return { transform: `scale(${scale}) translate(${x}px, ${y}px)` };
  }
  const e = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.ease),
  });
  const lerp = (a: number, b: number) => a + (b - a) * e;
  const baseX = focalX ?? 0.5;
  const baseY = focalY ?? 0.5;
  const x = lerp(kb.fromX ?? baseX, kb.toX ?? baseX);
  const y = lerp(kb.fromY ?? baseY, kb.toY ?? baseY);
  const scale = lerp(kb.fromScale ?? 1, kb.toScale ?? 1);
  const pos = `${x * 100}% ${y * 100}%`;
  return { transform: `scale(${scale})`, objectPosition: pos, transformOrigin: pos };
}

/** Brand-agnostic mechanics for rendering a footage VideoItem (clip/broll/photo):
 *  element choice (Img vs OffthreadVideo, incl. video-as-photo by extension),
 *  trim, cover-crop, grade, and Ken Burns. This is the shared primitive both
 *  brands' clip/broll/photo renderers compose around — vintage, paper-frame,
 *  and overlays are brand wrappers rendered AROUND this, not part of it.
 *  multi-clip/card/outro items render nothing here (out of scope). */
export const SegmentMedia: React.FC<VideoRenderProps> = ({ item, handles }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();

  if (item.kind !== 'clip' && item.kind !== 'broll' && item.kind !== 'photo') return null;

  const src = resolveSrc(item.source);
  const useImg = item.kind === 'photo' && !VIDEO_EXT_RE.test(item.source);

  // On-screen span for this item, extended by the handles borrowed at each
  // edge for cross-item transitions (0 when the item has no neighbor overlap).
  const durationInFrames = Math.round(((item.endMs - item.startMs) / 1000) * fps) + handles.inHalf + handles.outHalf;

  const cropStyle = cropCoverStyle(item.crop as Crop | undefined, item.focalX, item.focalY);
  let transform = cropStyle.transform;
  let objectPosition = cropStyle.objectPosition;
  let transformOrigin = cropStyle.transformOrigin;

  const kb = findKenBurns(item.effects);
  if (kb) {
    const kbs = kenBurnsStyle(kb, frame, durationInFrames, item.focalX, item.focalY);
    transform = [transform, kbs.transform].filter(Boolean).join(' ');
    if (kbs.objectPosition) {
      objectPosition = kbs.objectPosition;
      transformOrigin = kbs.transformOrigin;
    }
  }

  const filter = gradeFilter(item.grade as Grade | undefined, `grade-${item.id}`);

  const style: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition,
    ...(transform ? { transform, transformOrigin } : {}),
    ...(filter ? { filter } : {}),
  };

  if (useImg) {
    return <Img src={src} style={style} />;
  }

  // clip/broll (and a video-as-photo) all render via OffthreadVideo. Only
  // clip/broll carry a source trim — photo has no sourceInMs (its full span
  // IS the on-screen span), so it plays from its own start with no borrow.
  const startFrom =
    item.kind === 'photo' ? undefined : Math.max(0, Math.round((item.sourceInMs / 1000) * fps) - handles.inHalf);

  return <OffthreadVideo src={src} muted startFrom={startFrom} style={style} />;
};
