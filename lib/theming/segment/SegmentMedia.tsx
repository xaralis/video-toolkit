// Explicit React import: files under lib/theming are transformed with the classic JSX runtime under the editor's Vitest config, so `React` must be in scope.
import React from 'react';
import { AbsoluteFill, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { cropCoverStyle } from '../../reel-config-base/crop';
import type { Crop } from '../../reel-config-base/base-types';
import type { VideoRenderProps } from '../types';
import { kenBurnsStyle, findKenBurns, type KenBurnsEffect } from '../effects/ken-burns';
import { applyStyleEffects, composeMediaStyle, type MediaStyleFragment } from '../effects/style-effect';
import { useMediaEffects, applyMediaEffects } from '../effects/media-effects-context';
import { resolveMediaSource, type MediaRole, type MediaSourceResolver } from '../media-source';
import { anchorTiming } from '../../render/overlay-anchor';

const VIDEO_EXT_RE = /\.(mp4|mov|webm)$/i;

/** Reads a numeric config field tolerantly — same shape as the effect
 *  primitives' own reader, so a malformed `backdropBlur` renders with the
 *  default instead of throwing mid-composition. */
function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** The blurred fill behind a `blur-pad` foreground. Carries NOTHING from the
 *  item — no crop, no grade, no ken burns, no effects. That emptiness is the
 *  contract, not an oversight: the clip's own look belongs on the clip, and
 *  applying it here too would grade one picture twice. */
function backdropStyle(blurPx: number, dim: number): React.CSSProperties {
  return {
    position: 'absolute',
    // Oversized rather than scaled with a transform: a blur radius samples
    // past the element's edge, and an exactly-inset element has nothing there
    // but transparency, which reads as a pale border. Bleeding 5% out on every
    // side gives the blur real pixels to sample. Deliberately NOT
    // `transform: scale()` — the backdrop's `transform` staying undefined is
    // what makes "the crop never reached the backdrop" checkable.
    inset: '-5%',
    width: '110%',
    height: '110%',
    objectFit: 'cover',
    filter: `blur(${blurPx}px) brightness(${1 - dim})`,
  };
}

/** The whole shot, contained over the backdrop, carrying the item's entire
 *  computed style chain (crop, grade, ken burns, style effects). */
function foregroundStyle(base: React.CSSProperties): React.CSSProperties {
  return {
    ...base,
    objectFit: 'contain',
    // Right-aligned, matching where the speaker sits in the talking-head
    // segments, so a cut from clip to b-roll doesn't move the picture's centre
    // of gravity — and leaving the left of the frame to the blurred backdrop,
    // which is where the website draws its headline.
    //
    // This is also why `focalX/focalY` are inert under blur-pad: they steer
    // this exact property, and the right-alignment owns it. `crop`'s zoom (a
    // transform) still applies, inherited from `base`.
    objectPosition: '100% 50%',
  };
}

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
  anchoredOverlays,
  renderAnchoredOverlay,
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

  // How this item's media meets the frame. `cover` (the default, and every
  // item authored before this field existed) crops the mismatch away;
  // `blur-pad` shows the whole shot over a blurred copy of itself. Read
  // permissively — a malformed value falls back to the default rather than
  // throwing, the same tolerance `crop` and the effect bags get.
  const fitRaw = (item as { fit?: unknown }).fit;
  const fit = fitRaw === 'blur-pad' ? 'blur-pad' : 'cover';
  const backdropBlur = num((item as { backdropBlur?: unknown }).backdropBlur, 32);
  const backdropDim = num((item as { backdropDim?: unknown }).backdropDim, 0.45);

  // `item.kind` maps 1:1 onto MediaRole for the three footage kinds.
  const src = resolveSrc(item.source, item.kind, override);
  const useImg = item.kind === 'photo' && !VIDEO_EXT_RE.test(item.source);

  // On-screen span for this item, extended by the handles borrowed at each
  // edge for cross-item transitions (0 when the item has no neighbor overlap).
  const durationInFrames = Math.round(((item.endMs - item.startMs) / 1000) * fps) + handles.inHalf + handles.outHalf;

  // `crop` is a permissive `z.record` field on the schema (like the
  // transition records), so it is asserted to its shape here; malformed
  // values are tolerated downstream by cropCoverStyle.
  //
  // The merge, as of Phase 4 Task 3.2 (crop + style effects) and Task 3.4
  // (grade folded INTO the style-effect axis rather than merged separately,
  // right here, afterward): crop's own fragment is the BASE, then every
  // STYLE-axis effect on the item — `item.grade` FIRST (synthesized inside
  // `applyStyleEffects`), then ken-burns / a brand's own style-effect
  // registration in `item.effects[]` array order — composes onto it via
  // `composeMediaStyle`'s ONE rule per property (see style-effect.ts). This is
  // the SAME merge the old hand-inlined version did —
  // segment-media-merge-baseline.test.tsx pins the 18-cell matrix
  // byte-for-byte across both rewrites, including the objectPosition/
  // transformOrigin PAIRING (the highest-risk regression named in the task
  // brief) and grade's own filter + white-balance `defs`.
  const cropStyle = cropCoverStyle(item.crop as Crop | undefined, item.focalX, item.focalY);
  const cropFragment: MediaStyleFragment = {
    transform: cropStyle.transform,
    objectPosition: cropStyle.objectPosition,
    transformOrigin: cropStyle.transformOrigin,
  };
  const styleEffectFragment = applyStyleEffects(styleEffects, item, frame, durationInFrames);
  const merged = composeMediaStyle(cropFragment, styleEffectFragment);
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

  // Phase 4 Task 4.1 — draws this item's `anchoredOverlays` (routed 'anchored'
  // onto THIS item's id) at the exact composition frame they would have landed
  // on if routed 'track' instead (see ../../render/overlay-anchor.ts).
  //
  // Wrapped in an `AbsoluteFill` ONLY when there is at least one overlay to
  // draw — that conditional is what keeps the zero-overlay case (every
  // existing caller, until a brand actually routes something 'anchored') an
  // IDENTICAL tree to before this capability existed: `mediaNode`/the
  // `wbDef` fragment returned bare, exactly as before. An unconditional
  // wrapper would insert a new element around every clip/broll/photo in both
  // brand repos, which is exactly the parity break Task 4.1 must not cause.
  const wrapWithAnchoredOverlays = (node: React.ReactNode): React.ReactNode => {
    const overlays = anchoredOverlays ?? [];
    if (overlays.length === 0 || !renderAnchoredOverlay) return node;
    return (
      <AbsoluteFill>
        {node}
        {overlays.map((o) => {
          const { from, durationInFrames } = anchorTiming(o, item, handles, fps);
          if (durationInFrames <= 0) return null;
          return (
            <Sequence key={o.id} from={from} durationInFrames={durationInFrames} name={o.id}>
              {renderAnchoredOverlay(o)}
            </Sequence>
          );
        })}
      </AbsoluteFill>
    );
  };

  /** Final assembly, shared by the Img and OffthreadVideo paths: apply the
   *  media-effect and anchored-overlay wrappers and prepend the white-balance
   *  `defs` fragment when a grade needs one. `element(style)` builds the media
   *  element itself — called once for `cover`, twice for `blur-pad`. */
  const assemble = (element: (s: React.CSSProperties) => React.ReactNode): React.ReactNode => {
    // `fit: 'blur-pad'` — for footage whose aspect doesn't match the
    // composition (a portrait phone b-roll in a 16:9 frame), where `cover`
    // would crop most of the picture away. Renders the SAME source twice: a
    // blurred cover backdrop filling the frame, and the whole shot contained
    // on top of it.
    //
    // The division of labour is the contract (see the design spec): everything
    // that belongs to the CLIP — grade, ken burns, crop, style effects,
    // media-scope effects — goes on the foreground. The backdrop is dumb fill
    // and carries none of it, or every grade would be applied twice to one
    // picture. Frame-level looks (`scope: 'clip'` effects — grain, vignette)
    // wrap this whole output from outside and so cover both, which is correct:
    // a vignette is a look on the frame, not on the clip.
    const mediaNode =
      fit === 'blur-pad' ? (
        <>
          {element(backdropStyle(backdropBlur, backdropDim))}
          {wrapWithMediaEffects(element(foregroundStyle(style)))}
        </>
      ) : (
        wrapWithMediaEffects(element(style))
      );

    return wrapWithAnchoredOverlays(
      wbDef ? (
        <>
          {wbDef}
          {mediaNode}
        </>
      ) : (
        mediaNode
      ),
    );
  };

  if (useImg) return assemble((s) => <Img src={src} style={s} />);

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

  return assemble((s) => <OffthreadVideo src={src} muted startFrom={startFrom} endAt={endAt} style={s} />);
};
