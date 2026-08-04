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
import { resolveFraming } from '../../reel-config-base/framing';
import { focalObjectPosition } from '../../reel-config-base/focal';
import { deriveSpeed } from '../../reel-config-base/speed';
import { timelineToSourceFrames } from '../../reel-config-base/clip-time';

const VIDEO_EXT_RE = /\.(mp4|mov|webm)$/i;

/** The blurred fill behind a `pad: 'blur'` foreground. Carries NOTHING from the
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
 *  computed style chain (crop, grade, ken burns, style effects) — except
 *  `objectPosition`, which placement (`placeX`/`placeY`) owns outright. */
function foregroundStyle(base: React.CSSProperties, placeX: number, placeY: number): React.CSSProperties {
  return {
    ...base,
    objectFit: 'contain',
    // Placement owns `objectPosition` (where the whole shot sits in the
    // leftover space); the pan owns `transformOrigin` (the crop's zoom
    // pivot, carried through unmodified on `base`) — both are live under
    // contain, simultaneously, at any zoom > 1. Previously this was hard-
    // pinned to '100% 50%' with a comment claiming focalX/focalY were inert
    // under blur-pad because "the right-alignment owns it" — that was
    // already false: `cropCoverStyle` also emits `transformOrigin`, which
    // this function never overrode, so the pan point has always survived
    // into the foreground and visibly changed what shows at any zoom > 1.
    //
    // This MUST be set unconditionally, even when placement sits at its
    // default (0.5/0.5): if it were only set on a non-default placement,
    // `base.objectPosition` — which carries the crop's PAN (focalX/focalY or
    // crop.x/crop.y) via the spread above — would leak through, and the pan
    // would apply twice: once through `transformOrigin` (the zoom pivot) and
    // again through `objectPosition` (the contain letterbox position), which
    // is not what placement means.
    objectPosition: focalObjectPosition(placeX, placeY),
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

  // How this item's media meets the frame (`fit`), and what fills the
  // leftover space when it does (`pad`) — two independent axes as of
  // framing.ts, which also absorbs the legacy `fit: 'blur-pad'` as
  // `{ fit: 'contain', pad: 'blur' }` so old configs keep rendering
  // unmodified. `resolveFraming` is tolerant the same way `crop` and the
  // effect bags are: a malformed value falls back to its default rather than
  // throwing.
  const { fit, pad, padColor, blur, dim, placeX, placeY } = resolveFraming(item);

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
   *  element itself — called once for `cover` or a pad-less `contain`, twice
   *  when `pad: 'blur'` needs a second copy of the same source, and not at
   *  all for the `pad: 'color'` fill (which is a plain div, not `element`). */
  const assemble = (element: (s: React.CSSProperties) => React.ReactNode): React.ReactNode => {
    // `fit: 'contain'` — for footage whose aspect doesn't match the
    // composition (a portrait phone b-roll in a 16:9 frame), where `cover`
    // would crop most of the picture away. The pad axis picks what fills the
    // leftover space, independent of that decision:
    //   - `pad: 'blur'` — the SAME source again, blurred and covering the
    //     frame behind the contained foreground (this is what the legacy
    //     `fit: 'blur-pad'` always meant, and `resolveFraming` absorbs it as
    //     exactly this pair).
    //   - `pad: 'color'` with a `padColor` — a single flat fill behind the
    //     foreground.
    //   - `pad: 'color'` with no `padColor`, or `pad: 'none'` — no backdrop
    //     node at all. A transparent pad and no pad are the same picture, and
    //     emitting nothing keeps the tree identical to `cover`'s.
    //
    // The division of labour is the contract (see the design spec): everything
    // that belongs to the CLIP — grade, ken burns, crop, style effects,
    // media-scope effects — goes on the foreground. The backdrop, when there
    // is one, is dumb fill and carries none of it, or every grade would be
    // applied twice to one picture. Frame-level looks (`scope: 'clip'`
    // effects — grain, vignette) wrap this whole output from outside and so
    // cover both, which is correct: a vignette is a look on the frame, not on
    // the clip.
    const backdropNode: React.ReactNode =
      fit !== 'contain'
        ? null
        : pad === 'blur'
          ? element(backdropStyle(blur, dim))
          : pad === 'color' && padColor !== undefined
            ? <AbsoluteFill style={{ backgroundColor: padColor }} />
            : null;

    const mediaNode =
      fit === 'contain' ? (
        <>
          {backdropNode}
          {wrapWithMediaEffects(element(foregroundStyle(style, placeX, placeY)))}
        </>
      ) : (
        // `fit: 'cover'` — unchanged: no backdrop, foreground returned bare,
        // referentially identical tree to before this axis split existed.
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

  // Playback speed — see speed.ts: NOT a schema field, the ratio the item's
  // two spans (timeline vs source) already encode. 1 for every item that
  // predates this feature (their spans were always kept in lock step) and
  // for `photo` (no `sourceInMs`/`sourceOutMs` to ratio against).
  const speed = item.kind === 'photo' ? 1 : deriveSpeed(item);

  // clip/broll (and a video-as-photo) all render via OffthreadVideo. Only
  // clip/broll carry a source trim — photo has no sourceInMs (its full span
  // IS the on-screen span), so it plays from its own start with no borrow.
  //
  // `startFrom` is a SOURCE frame position and `handles.inHalf` a count of
  // TIMELINE frames, so the handle must be converted before it can be
  // subtracted. Measured, not inferred: rendering a frame-numbered ramp video
  // through `<OffthreadVideo startFrom endAt playbackRate>` (Remotion 4.0.425)
  // shows source frame `startFrom + k * playbackRate` at outer offset k — i.e.
  // `startFrom` is NOT scaled by the rate, while everything measured from it
  // is. (`endAt` is the other way round, counting OUTER frames — see below;
  // the two props genuinely live in different domains.)
  //
  // So the k = `inHalf` outer frames borrowed before the cut cost
  // `inHalf * speed` SOURCE frames, and subtracting the raw `inHalf` only
  // lands right at 1x. At 0.5x it took twice the source it should, underflowed
  // to 0 on a short head, and left the picture early for the whole clip. The
  // budget side (`handleRoomFrames`, handle-room.ts) was already redefined in
  // timeline frames by the timeline-vs-source-ms work; this is the half that
  // SPENDS it, and it is what makes the two agree.
  const startFrom =
    item.kind === 'photo'
      ? undefined
      : Math.max(0, Math.round((item.sourceInMs / 1000) * fps) - Math.round(timelineToSourceFrames(item, handles.inHalf)));

  // Bound playback to the source out-point (+ the borrowed out-handle), so a
  // clip/broll never plays past what its trim covers — needed by callers
  // that don't wrap this in a Sequence sized to exactly that span (e.g. a
  // multi-clip sub-clip sharing its parent segment's Sequence). For the
  // existing single-media callers this is a no-op: their Sequence already
  // stops at this exact frame whenever on-screen span == source-trim span
  // (the 1× playback case), so nothing visible changes.
  //
  // At speed !== 1 this formula would truncate the video early: `endAt`
  // (Remotion's `trimAfter`) bounds how long THIS element's own auto-wrapped
  // Sequence stays mounted (see OffthreadVideo's trimBefore/trimAfter
  // wrapping), and that bound is independent of `playbackRate` — it counts
  // OUTER frames, not source frames. A slow-down (speed < 1, more outer
  // frames than source frames) would hide the video after only
  // `sourceSpanFrames` outer frames, well before the timeline slot
  // (`durationInFrames`, already widened by the speed change) is up. So once
  // speed departs from 1, `endAt` is redefined as `startFrom +
  // durationInFrames` — the item's own full on-screen span — instead of the
  // raw source out-point; `playbackRate` is what makes that span actually
  // land on `sourceOutMs` by the end. At speed === 1 the two formulas are
  // provably the same value (that's the invariant the old formula relied on
  // without ever stating it), so the ORIGINAL formula is kept byte-for-byte
  // for that case rather than switched to the algebraically-equal one —
  // zero behavioural change for every clip that isn't using this feature.
  const endAt =
    item.kind === 'photo'
      ? undefined
      : speed === 1
        ? Math.round((item.sourceOutMs / 1000) * fps) + handles.outHalf
        : (startFrom as number) + durationInFrames;

  return assemble((s) => (
    <OffthreadVideo
      src={src}
      muted
      startFrom={startFrom}
      endAt={endAt}
      style={s}
      {...(speed !== 1 ? { playbackRate: speed } : {})}
    />
  ));
};
