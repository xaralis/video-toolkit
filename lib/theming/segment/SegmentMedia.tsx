// Explicit React import: files under lib/theming are transformed with the classic JSX runtime under the editor's Vitest config, so `React` must be in scope.
import React from 'react';
import { Img, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { cropCoverStyle } from '../../reel-config-base/crop';
import { gradeFilter, gradeNeedsWb, gradeWbMatrixValues } from '../../reel-config-base/grade';
import type { Crop, Grade } from '../../reel-config-base/base-types';
import type { VideoRenderProps } from '../types';
import { kenBurnsStyle, findKenBurns, type KenBurnsEffect } from '../effects/ken-burns';
import { applyStyleEffects, composeMediaStyle, type MediaStyleFragment } from '../effects/style-effect';
import { useMediaEffects, applyMediaEffects } from '../effects/media-effects-context';
import { resolveMediaSource, type MediaRole, type MediaSourceResolver } from '../media-source';

const VIDEO_EXT_RE = /\.(mp4|mov|webm)$/i;

/** `item.source` → a URL Remotion can load, through core's ONE media-path rule
 *  (../media-source.ts) and then `staticFile`.
 *
 *  Both brands prefix BEFORE calling here (one's clip/broll renderers hand over
 *  `recordings/…`/`broll/…`; the other's sources are full `media/…` paths), so
 *  the rule's idempotence is what keeps them rendering byte-identically — it
 *  sees a source that already contains a slash and returns it untouched. A
 *  brand that hands over a BARE filename now gets the folder convention for
 *  free instead of a
 *  broken path. Resolution happens HERE, at render time: `item.source` is never
 *  written back, because `loadTranscriptSync` derives the caption sidecar from
 *  the bare name. */
function resolveSrc(source: string, role: MediaRole, override?: MediaSourceResolver): string {
  const path = (override ?? resolveMediaSource)(source, role);
  return path.startsWith('http') ? path : staticFile(path);
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
export const SegmentMedia: React.FC<VideoRenderProps> = ({
  item,
  handles,
  resolveMediaSource: override,
  styleEffects,
}) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  // Phase 4 Task 3.3 — read BEFORE the early return below so the hook order
  // never depends on `item.kind` (rules of hooks). Empty `[]` outside any
  // `MediaEffectsContext.Provider` (every existing SegmentMedia test, and the
  // Task 3.1 merge baseline), so `applyMediaEffects` below is a no-op there —
  // parity is automatic, not asserted.
  const mediaEffects = useMediaEffects();

  if (item.kind !== 'clip' && item.kind !== 'broll' && item.kind !== 'photo') return null;

  // `item.kind` maps 1:1 onto MediaRole for the three footage kinds.
  const src = resolveSrc(item.source, item.kind, override);
  const useImg = item.kind === 'photo' && !VIDEO_EXT_RE.test(item.source);

  // On-screen span for this item, extended by the handles borrowed at each
  // edge for cross-item transitions (0 when the item has no neighbor overlap).
  const durationInFrames = Math.round(((item.endMs - item.startMs) / 1000) * fps) + handles.inHalf + handles.outHalf;

  // `crop`/`grade` are permissive `z.record` fields on the schema (like the
  // transition records), so they are asserted to their shapes here; malformed
  // values are tolerated downstream by cropCoverStyle/gradeFilter.
  //
  // The merge, as of Phase 4 Task 3.2: crop's own fragment is the BASE, then
  // every STYLE-axis effect on the item (`applyStyleEffects` — ken-burns
  // today, or a brand's own style-effect registration) composes onto it via
  // `composeMediaStyle`'s ONE rule per property (see style-effect.ts), then
  // grade's filter+defs compose the same way. This is the SAME merge the old
  // hand-inlined version did — segment-media-merge-baseline.test.tsx pins the
  // 18-cell matrix byte-for-byte across the rewrite, including the
  // objectPosition/transformOrigin PAIRING (the highest-risk regression named
  // in the task brief).
  const cropStyle = cropCoverStyle(item.crop as Crop | undefined, item.focalX, item.focalY);
  const cropFragment: MediaStyleFragment = {
    transform: cropStyle.transform,
    objectPosition: cropStyle.objectPosition,
    transformOrigin: cropStyle.transformOrigin,
  };
  const styleEffectFragment = applyStyleEffects(styleEffects, item, frame, durationInFrames);
  let merged = composeMediaStyle(cropFragment, styleEffectFragment);

  const grade = item.grade as Grade | undefined;
  const filterId = `grade-${item.id}`;
  const filter = gradeFilter(grade, filterId);
  // Self-contained white-balance (temperature/tint) SVG filter def, so grade
  // works for every brand without depending on a brand-side <GradeDefs>. Only
  // rendered when the grade actually needs WB — absent for every clip without
  // temperature/tint, so existing renders are byte-identical.
  const gradeDefs = gradeNeedsWb(grade) ? (
    <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
      <defs>
        <filter id={filterId} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={gradeWbMatrixValues(grade!)} />
        </filter>
      </defs>
    </svg>
  ) : undefined;
  merged = composeMediaStyle(merged, { filter, defs: gradeDefs });
  const wbDef = merged.defs ?? null;

  const style: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: merged.objectPosition,
    ...(merged.transform ? { transform: merged.transform, transformOrigin: merged.transformOrigin } : {}),
    ...(merged.filter ? { filter: merged.filter } : {}),
    // CRITICAL 1 fix (Task 3.2 review, round 1): `opacity` is in the
    // MediaStyleFragment contract and `composeMediaStyle` multiplies it, but
    // nothing read it back out until now — a style effect setting `opacity`
    // rendered fully green and changed nothing on screen. Conditioned on
    // `!== undefined` (not truthiness — `opacity: 0` is a legitimate fully
    // transparent value) so parity holds: crop/grade never set `opacity`, so
    // when no style effect does either, `merged.opacity` stays `undefined`
    // and this key is omitted exactly as before this fix existed.
    ...(merged.opacity !== undefined ? { opacity: merged.opacity } : {}),
  };

  // Applies this item's MEDIA-scope effects (Phase 4 Task 3.3) around the
  // media element, innermost-first like `applyEffects` — the first entry ends
  // up closest to the media, the last outermost. `mediaStyle` hands each
  // effect the EXACT style this element renders with (crop + style-effects +
  // grade, already merged), so a media-scope effect building a second media
  // source (PP's `blend`) can match it without recomputing the transform.
  // Returns `node` REFERENTIALLY UNCHANGED when `mediaEffects` is empty — no
  // wrapper allocated, so an item with none renders byte-identically to
  // before this axis existed (see the merge baseline test, unmodified).
  //
  // Delegated to the SHARED applier (media-effects-context.tsx) rather than a
  // local closure (review round 1, MINOR 5) — the same function
  // `useMediaEffects()`'s own doc points a hand-rolled brand renderer at, so
  // there is exactly one implementation of this ordering/mediaStyle contract.
  const wrapWithMediaEffects = (node: React.ReactNode): React.ReactNode =>
    applyMediaEffects(mediaEffects, { item, handles, mediaStyle: style }, node);

  if (useImg) {
    const mediaNode = wrapWithMediaEffects(<Img src={src} style={style} />);
    return wbDef ? (
      <>
        {wbDef}
        {mediaNode}
      </>
    ) : (
      mediaNode
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
  const mediaNode = wrapWithMediaEffects(video);
  return wbDef ? (
    <>
      {wbDef}
      {mediaNode}
    </>
  ) : (
    mediaNode
  );
};
