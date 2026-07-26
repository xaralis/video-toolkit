// Explicit React import: files under lib/theming are transformed with the classic JSX runtime under the editor's Vitest config, so `React` must be in scope.
import React from 'react';
import { Img, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { cropCoverStyle } from '../../reel-config-base/crop';
import { gradeFilter, gradeNeedsWb, gradeWbMatrixValues } from '../../reel-config-base/grade';
import type { Crop, Grade } from '../../reel-config-base/base-types';
import type { VideoRenderProps } from '../types';
import { kenBurnsStyle, findKenBurns, type KenBurnsEffect } from '../effects/ken-burns';

const VIDEO_EXT_RE = /\.(mp4|mov|webm)$/i;

function resolveSrc(source: string): string {
  return source.startsWith('http') ? source : staticFile(source);
}

// Ken Burns lives in ../effects/ken-burns.ts as of Phase 3 Task 2 (its math is
// pinned there by a parity test). Re-exported so existing importers of this
// module keep working.
export { kenBurnsStyle, findKenBurns, type KenBurnsEffect };

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

  // `crop`/`grade` are permissive `z.record` fields on the schema (like the
  // transition records), so they are asserted to their shapes here; malformed
  // values are tolerated downstream by cropCoverStyle/gradeFilter.
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

  const grade = item.grade as Grade | undefined;
  const filter = gradeFilter(grade, `grade-${item.id}`);
  // Self-contained white-balance (temperature/tint) SVG filter def, so grade
  // works for every brand without depending on a brand-side <GradeDefs>. Only
  // rendered when the grade actually needs WB — absent for every clip without
  // temperature/tint, so existing renders are byte-identical.
  const wbDef = gradeNeedsWb(grade) ? (
    <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
      <defs>
        <filter id={`grade-${item.id}`} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={gradeWbMatrixValues(grade!)} />
        </filter>
      </defs>
    </svg>
  ) : null;

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
    return wbDef ? (
      <>
        {wbDef}
        <Img src={src} style={style} />
      </>
    ) : (
      <Img src={src} style={style} />
    );
  }

  // clip/broll (and a video-as-photo) all render via OffthreadVideo. Only
  // clip/broll carry a source trim — photo has no sourceInMs (its full span
  // IS the on-screen span), so it plays from its own start with no borrow.
  const startFrom =
    item.kind === 'photo' ? undefined : Math.max(0, Math.round((item.sourceInMs / 1000) * fps) - handles.inHalf);
  // Bound playback to the source out-point (+ the borrowed out-handle), so a
  // clip/broll never plays past what its trim covers — needed by callers
  // that don't wrap this in a Sequence sized to exactly that span (e.g. a
  // multi-clip sub-clip sharing its parent segment's Sequence). For the
  // existing single-media callers this is a no-op: their Sequence already
  // stops at this exact frame whenever on-screen span == source-trim span
  // (the 1× playback case), so nothing visible changes.
  const endAt = item.kind === 'photo' ? undefined : Math.round((item.sourceOutMs / 1000) * fps) + handles.outHalf;

  const video = <OffthreadVideo src={src} muted startFrom={startFrom} endAt={endAt} style={style} />;
  return wbDef ? (
    <>
      {wbDef}
      {video}
    </>
  ) : (
    video
  );
};
