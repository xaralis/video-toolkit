// lib/render/layered-composition.tsx — ONE assembly for the whole layered
// model. Every brand renders every track identically; the CompositionTheme
// contributes only look (renderers, background, routing) — see spec
// docs/superpowers/specs/2026-07-25-layered-reel-composition-design.md.
import React from 'react';
import { AbsoluteFill, Audio, Sequence, useVideoConfig } from 'remotion';
import type { LayeredReel, OverlayItem, VideoItem, AudioItem } from '../reel-config-base/layered-schema';
import { computeMusicEnvelope } from '../reel-config-base/music-envelope';
import type { CompositionTheme, Placement } from '../theming';
import {
  resolveOverlayRenderer,
  overlayConfig,
  overlayRegistry,
  resolveVideoRenderer,
  videoConfig,
  DEFAULT_PLACEMENT,
  applyEffects,
  collectMediaEffects,
  MediaEffectsContext,
  MediaEffectsConsumptionContext,
  defaultRenderBrandTrack,
  resolveGenericSource,
  GenericCaptions,
  rebaseCaptionTimes,
  type CaptionLine,
  type CaptionLiftWindow,
  type CaptionSourceWord,
} from '../theming';
import { buildVideoNodes } from './video-track';
import { buildAudioNodes } from './audio-track';
import { routeOverlays, overlayKind } from './overlay-routing';
import { warnOnce } from './warn-once';

// The default renderer for 'text' (and its legacy 'quote-pull' alias): adapts
// the raw OverlayItem to the theming module's text contract, so brands keep
// registering their Text via BrandTheme.overlays.text exactly as before.
const TrackTextOverlay: React.FC<{ item: OverlayItem; theme: CompositionTheme }> = ({ item, theme }) => {
  // Renderer RESOLUTION deliberately stays hardcoded to 'text': 'quote-pull' is
  // documented (above) as an alias that resolves the SAME 'text' registration.
  // CONFIG, however, is per-kind — a brand registering distinct config for
  // 'text' vs 'quote-pull' must get its OWN kind's config, not always 'text's;
  // that was the write-only-prop bug (task 4.2).
  const kind = overlayKind(item);
  const Renderer = resolveOverlayRenderer(theme, 'text');
  const content = item.content as { text?: string; reveal?: 'line' | 'all' | 'none'; hide?: 'fade' | 'none'; fontSize?: number };
  return (
    <Renderer
      text={content.text ?? ''}
      placement={(item.position as Placement) ?? DEFAULT_PLACEMENT}
      fontSize={content.fontSize}
      reveal={content.reveal}
      hide={content.hide}
      palette={theme.accentSlots}
      config={overlayConfig(theme, kind)}
      tokens={theme.tokens}
      appearAtMs={0}
      durationMs={item.endMs - item.startMs}
    />
  );
};

/** The content bag a `captions` overlay item carries. Times are
 *  composition-ABSOLUTE, like every other time in the layered schema —
 *  `rebaseCaptionTimes` moves them into the mount's own Sequence domain below. */
interface CaptionsOverlayContent {
  words?: CaptionSourceWord[];
  lines?: CaptionLine[];
  liftWindows?: CaptionLiftWindow[];
}

/**
 * Core's mount for {@link GenericCaptions} — Phase 4 Task 4.3.
 *
 * WHICH TIER OWNS CAPTIONS: the OVERLAY TRACK, as an ordinary overlay kind
 * (`content.kind === 'captions'`) resolved through the SAME
 * `makeOverlayRenderer` dispatch every other overlay kind uses. Reasoning is
 * recorded in docs/superpowers/phase4-extension-contract.md §6; the two load-
 * bearing consequences are:
 *
 *  - **Not clipped by a video item.** Routed 'track' (the default), a caption
 *    item gets its OWN top-level Sequence over [startMs, endMs), so it survives
 *    a cut underneath it — which is the whole point of `lastLineGraceMs`, and
 *    the failure mode an anchored overlay has by construction.
 *  - **It can still be anchored, and cannot disagree with itself if it is.** A
 *    brand that wants the per-item behaviour registers
 *    `overlays: { captions: { routing: 'anchored' } }` and gets the identical
 *    node from the identical function — there is no second caption path to
 *    drift against, which is precisely what `makeOverlayRenderer` exists for.
 *    Both routes wrap the item in a Sequence starting at the item's own
 *    `startMs`, so the ONE rebase origin below is correct for both.
 *
 * Collision with an anchored overlay is resolved by MOVING, never hiding:
 * `liftWindows` raises the caption out of the bottom band for a window (see
 * CaptionLiftWindow). Core does not derive those windows from the anchored
 * overlays automatically — which overlay covers the caption band is a look
 * question only the brand's own renderers can answer.
 */
const TrackCaptionsOverlay: React.FC<{ item: OverlayItem; theme: CompositionTheme }> = ({ item, theme }) => {
  const content = item.content as CaptionsOverlayContent;
  // Composition-absolute (schema) → this mount's Sequence-local domain. The
  // Sequence wrapping this node starts at item.startMs on BOTH routes, so that
  // is the origin. Near a reel's first item this is the identity and the bug it
  // fixes is invisible — which is how the units error survived Phase 3.
  const local = rebaseCaptionTimes(content, item.startMs);
  return (
    <GenericCaptions
      words={local.words}
      lines={local.lines}
      liftWindows={local.liftWindows}
      // The caption token block — the field ThemeTokens documented as threaded
      // NOWHERE until this task. This line is the whole of that threading.
      tokens={theme.tokens?.caption}
    />
  );
};

/** Task 6.3, warnings 2 and 7 — "was this delivered payload actually drawn".
 *
 *  REVIEW ROUND 1, CRITICAL 1 — the original shape of this component mounted
 *  ONCE, as the last child of the root `<AbsoluteFill>`, and audited EVERY
 *  video item regardless of whether that item's own `<Sequence>` was actually
 *  open this frame. React's depth-first, left-to-right child ordering is real
 *  (an earlier sibling's whole subtree finishes before the next sibling's body
 *  runs) — but a `<Sequence>` OUTSIDE its `[from, from+durationInFrames)`
 *  window sets `content = null` (Remotion's own behaviour), so an off-window
 *  item's renderer body never runs AT ALL this frame, never pings the marker,
 *  and the old shape warned — falsely — for every item that simply was not
 *  on screen yet. Because `warnOnce` is permanent per key, ONE such frame
 *  poisons the key for the whole session.
 *
 *  Fixed by mounting a SEPARATE instance of this component PER ITEM, PER
 *  MOUNT, as a sibling of `<Renderer>` INSIDE `renderVideoItemNode`'s own
 *  returned tree — i.e. inside the exact same conditional `<Sequence>` (the
 *  item's own, or a boundary's re-based copy — see video-track.tsx) that
 *  gates the `<Renderer>` it audits. When that Sequence is closed this frame,
 *  BOTH children (the Renderer and this audit) render as `null`, so the audit
 *  simply never runs — it cannot warn about a frame nothing was asked to draw
 *  on. When the Sequence is open, the ordering guarantee above still holds:
 *  this component is a LATER sibling of `<Renderer>` in the same array, so its
 *  body runs only after the Renderer's (and everything it nests) already has.
 *
 *  REVIEW ROUND 2, RESIDUAL ON CRITICAL 1 — the SAME invariant has a second
 *  conditional to travel with: a WRAPPER-axis effect (`applyEffects`, one
 *  level further out) is free to return something OTHER than `{children}` on
 *  some frames (a plate instead of the media, say), and this component used
 *  to be mounted as a sibling of the WHOLE effect-wrapped tree, i.e. OUTSIDE
 *  that conditional. `renderVideoItemNode` now mounts it as a later sibling of
 *  `<Renderer>` itself, BEFORE `applyEffects` ever sees either of them — so a
 *  wrapper effect that drops its children drops the audit too, exactly as a
 *  closed `<Sequence>` does. */
const ItemConsumptionAudit: React.FC<{ get: () => boolean; warn: () => void }> = ({ get, warn }) => {
  if (!get()) warn();
  return null;
};

// Core's item-level generics: the kinds core can draw without any brand
// registration. 'text'/'quote-pull' are the text adapter — 'quote-pull' is the
// legacy alias of 'text' and deliberately resolves the SAME 'text'
// registration. 'captions' is core's burned-in caption track (Task 4.3).
const CORE_OVERLAY_GENERICS: Record<string, React.FC<{ item: OverlayItem; theme: CompositionTheme }>> = {
  text: TrackTextOverlay,
  'quote-pull': TrackTextOverlay,
  captions: TrackCaptionsOverlay,
};

/** ONE dispatch for "how does this overlay item draw", built once per theme —
 *  used for BOTH the main overlay track (each item wrapped in its own
 *  Sequence, below) and `anchoredOverlays` delivered to a video renderer
 *  (Task 4.1). Extracting this is the point: a track-routed and an
 *  anchored-routed overlay of the SAME kind call the exact same function, so
 *  they cannot render differently — there is only one place this dispatch is
 *  written. */
// Task 6.3, warning 1 — `renderer` on a non-core overlay kind is silently
// ignored: `BrandTheme.overlays`' own doc comment names this exact caveat
// (`renderer` is consumed only by the core text adapter, for 'text'/
// 'quote-pull'; any other kind needs `render`, the item-level escape hatch).
// Checked once per registry (not per item), against the merged registry
// `makeOverlayRenderer` already builds, so a brand theme with the mistake
// warns exactly once per misregistered kind, however many items use it.
function warnOnUselessOverlayRenderer(kind: string, reg: { renderer?: unknown; render?: unknown }): void {
  if (kind === 'text' || kind === 'quote-pull') return; // the only kinds `renderer` is consumed for
  if (reg.renderer === undefined) return;
  warnOnce(`overlay-renderer-ignored:${kind}`, () =>
    `[video-toolkit] Overlay kind "${kind}" has a \`renderer\`, which is only consumed for the core ` +
    'text adapter (\'text\'/\'quote-pull\') — it is silently ignored for any other kind. Register ' +
    `"${kind}" with \`render\` (the item-level escape hatch: \`(item) => ReactNode\`) instead. ` +
    '(Warning only; nothing is blocked, and this is reported once per kind.)');
}

export function makeOverlayRenderer(theme: CompositionTheme): (item: OverlayItem) => React.ReactNode {
  const registry = overlayRegistry(theme);
  for (const [kind, reg] of Object.entries(registry)) warnOnUselessOverlayRenderer(kind, reg);
  return (item: OverlayItem) => {
    const kind = overlayKind(item);
    const reg = registry[kind];
    if (reg?.render) return reg.render(item); // item-level escape hatch wins
    const Generic = CORE_OVERLAY_GENERICS[kind];
    return Generic ? <Generic item={item} theme={theme} /> : null;
  };
}

/** One video item's node: the resolved renderer, decorated by the item's
 *  `effects[]` (see lib/theming/effects).
 *
 *  Effects are applied HERE and not inside SegmentMedia for two reasons.
 *  (1) Coverage: this seam owns every video kind, so a card or a brand-custom
 *      clip renderer gets effects too, not just the three footage kinds.
 *  (2) The theme lives here — VideoRenderProps deliberately carries no theme.
 *
 *  `ken-burns` is the one exception: it stays inside SegmentMedia, composing
 *  into the media element's own transform/objectPosition alongside the crop.
 *  applyEffects skips every STYLE-axis type (`isReservedEffectType`, derived
 *  from `theme.styleEffects` — Phase 4 Task 3.2) so it can never be
 *  double-applied, however a brand registers it.
 *
 *  SCOPE, chosen deliberately: effects wrap the renderer's WHOLE output, which
 *  includes any anchoredOverlays the renderer draws inside itself. So a `grade`
 *  or `grain` on an item tints that item's anchored title text too, not only
 *  its media. Wrapping the media alone is not reachable from this seam — the
 *  renderer returns one opaque node — and per-layer scoping would need the
 *  effect entry to name a target layer. A brand porting an effect that used to
 *  wrap only its media should expect this difference and, if it matters, keep
 *  the effect inside its own renderer where it can choose the scope.
 *
 *  MEDIA-scope effects (Phase 4 Task 3.3, `scope: 'media'` on a registration)
 *  are the escape from that last paragraph: `collectMediaEffects` resolves
 *  them here (where the theme lives) and `MediaEffectsContext.Provider`
 *  carries them down to `SegmentMedia` (or a brand's own hand-rolled media
 *  element via `useMediaEffects`) — a component core owns but which sits
 *  INSIDE the brand's own renderer, so a new prop would be dropped by every
 *  existing call site (see ../theming/effects/media-effects-context.tsx for
 *  the verified brand call sites this rests on). `applyEffects` skips
 *  media-scope types entirely, so nothing double-applies. */
export function renderVideoItemNode(
  theme: CompositionTheme,
  item: VideoItem,
  handles: { inHalf: number; outHalf: number },
  extras: {
    anchoredOverlays?: OverlayItem[];
    boundAudio?: AudioItem;
    /** How to draw one anchored overlay — `LayeredReelComposition` builds this
     *  ONCE via `makeOverlayRenderer(theme)` and passes the SAME function to
     *  every item, so it is threaded here rather than rebuilt per item. */
    renderAnchoredOverlay?: (item: OverlayItem) => React.ReactNode;
  } = {},
): React.ReactNode {
  const Renderer = resolveVideoRenderer(theme, item.kind);
  if (!Renderer) return null; // a kind this brand didn't register a renderer for

  const anchoredOverlays = extras.anchoredOverlays ?? [];
  const mediaEffects = collectMediaEffects(theme, item);

  // Task 6.3, warnings 2 and 7 — LOCAL to this call. `renderVideoItemNode` is
  // invoked fresh for every `<Sequence>` this item appears in this render —
  // its own, and again per re-based copy inside a transition boundary (see
  // video-track.tsx) — so each mount gets its OWN flags, checked by an audit
  // mounted INSIDE the same conditional Sequence (see `ItemConsumptionAudit`'s
  // docblock — this is the review round 1 Critical 1 fix: a global,
  // once-per-composition-render Set could not tell "never consumed" from
  // "this item's Sequence just was not open this frame").
  const consumed = { anchored: false, media: false };

  const rendererNode = (
    <Renderer
      item={item}
      handles={handles}
      config={videoConfig(theme, item.kind)}
      anchoredOverlays={anchoredOverlays}
      renderAnchoredOverlay={
        extras.renderAnchoredOverlay
          ? (overlayItem: OverlayItem) => {
              consumed.anchored = true;
              return extras.renderAnchoredOverlay!(overlayItem);
            }
          : undefined
      }
      boundAudio={extras.boundAudio}
      // The theme's look constants for core's GENERIC renderers (tokens.ts).
      // Threaded here because this is where the theme lives — VideoRenderProps
      // still carries no CompositionTheme, only this one narrow typed field.
      tokens={theme.tokens}
      // Same narrow threading for the media-path rule: the brand's wholesale
      // override, or `undefined` → the renderer uses core's resolveMediaSource.
      resolveMediaSource={theme.resolveMediaSource}
      // Same narrow threading for the STYLE-effect registry (Phase 4 Task
      // 3.2) — lets SegmentMedia resolve a brand's own `ken-burns` (or any
      // other style-effect type) without holding the whole theme.
      styleEffects={theme.styleEffects}
    />
  );

  // Review round 2, IMPORTANT (residual on Critical 1, one layer inward) — the
  // audits must be mounted INSIDE `applyEffects`' wrapping, as later siblings
  // of `rendererNode` itself, not appended after `applyEffects` has already
  // run. `applyEffects` wraps the WHOLE of `media` in every WRAPPER-axis
  // effect the item authors, and a wrapper effect is free to return something
  // OTHER than `{children}` on some frames (a plate instead of the media, say)
  // — exactly the same shape as a closed `<Sequence>`: a conditional sits
  // BETWEEN the audit and the renderer it audits. Mounting the audits as
  // later siblings of `rendererNode`, before `applyEffects` ever sees them,
  // means that conditional now sits ABOVE both — so it nulls the audit
  // exactly when it nulls the renderer, restoring the "travel together"
  // invariant Critical 1 established for Sequence windowing and extending it
  // to wrapper-effect conditionals too.
  //
  // Zero-case parity: when neither axis applies, `audited` is `rendererNode`
  // itself — no Fragment, no extra children — so `media`/`withEffects` below
  // are exactly what this function built before Task 6.3 ever added an axis.
  const audited =
    anchoredOverlays.length === 0 && mediaEffects.length === 0 ? (
      rendererNode
    ) : (
      <>
        {rendererNode}
        {anchoredOverlays.length > 0 && (
          <ItemConsumptionAudit
            get={() => consumed.anchored}
            warn={() =>
              warnOnce(`anchored-overlay-unconsumed:${item.id}`, () =>
                `[video-toolkit] Video item "${item.id}" was handed one or more anchored overlays, but its ` +
                'resolved renderer never called `renderAnchoredOverlay` for any of them. If this renderer ' +
                'draws them itself through its own dispatch (bypassing `renderAnchoredOverlay`), core cannot ' +
                'tell that apart from a renderer that drops them — call `renderAnchoredOverlay(item)` too, so ' +
                'this warning can tell the difference. (Warning only; nothing is blocked, and this is reported ' +
                'once per item.)')
            }
          />
        )}
        {mediaEffects.length > 0 && (
          <ItemConsumptionAudit
            get={() => consumed.media}
            warn={() =>
              warnOnce(`media-effects-unconsumed:${item.id}`, () =>
                `[video-toolkit] Video item "${item.id}" has one or more media-scope ("scope: 'media'") effects, ` +
                'but nothing in its resolved renderer ever called `useMediaEffects()` — the effect(s) never ' +
                'applied. A renderer that owns a media element must call `useMediaEffects()` (or use ' +
                '`SegmentMedia`, which already does) and wrap that element with the resolved entries. ' +
                '(Warning only; nothing is blocked, and this is reported once per item.)')
            }
          />
        )}
      </>
    );

  const media = (
    <MediaEffectsConsumptionContext.Provider value={() => { consumed.media = true; }}>
      <MediaEffectsContext.Provider value={mediaEffects}>
        {audited}
      </MediaEffectsContext.Provider>
    </MediaEffectsConsumptionContext.Provider>
  );
  return applyEffects(theme, item, handles, media);
}

export const LayeredReelComposition: React.FC<{ reel: LayeredReel; theme: CompositionTheme }> = ({ reel, theme }) => {
  const { fps, width, height } = useVideoConfig();
  const msToFrames = (ms: number) => Math.round((ms / 1000) * fps);

  // ONE registry for the whole composition: brand tier + the deprecated
  // composition tier, the latter winning per kind (see overlayRegistry).
  const registry = overlayRegistry(theme);
  const { track, anchored } = routeOverlays(reel.tracks.overlays, registry);

  // ONE dispatch for "how does this overlay item draw" (Task 4.1), built ONCE
  // and handed to both the track Sequences below AND every video item's
  // `renderAnchoredOverlay` — so a track-routed and an anchored-routed overlay
  // of the same kind literally cannot render differently.
  const renderOverlayItem = makeOverlayRenderer(theme);

  // ---- video ----------------------------------------------------------------
  const videoItems = theme.prepareVideoTrack ? theme.prepareVideoTrack(reel.tracks.video) : reel.tracks.video;

  const videoNodes = buildVideoNodes(videoItems, {
    width,
    height,
    fps,
    // Lets a transition name a colour by brand accent-slot key (see `wipe`).
    palette: theme.accentSlots,
    // The brand's own transition kinds: what makes them RENDER (resolved above
    // core's generics by resolveTransition) and what stops them warning as
    // unrecognised. Same narrow threading as `palette` — the theme itself does
    // not go down.
    transitions: theme.transitions,
    // What a transition at the reel's leading or trailing edge resolves its
    // missing input to (Task 2.2). The SAME value the root AbsoluteFill below
    // is painted with, so "fade to background" is the brand's background and
    // never a colour core invented.
    background: theme.background,
    renderItem: (item, handles) =>
      renderVideoItemNode(theme, item, handles, {
        anchoredOverlays: anchored.get(item.id) ?? [],
        boundAudio: reel.tracks.audio.find((a) => a.followsVideoId === item.id),
        renderAnchoredOverlay: renderOverlayItem,
      }),
  });

  // ---- audio (voice/beds) -----------------------------------------------------
  // `resolveAudioSource` (deprecated) still WINS when a brand registers one —
  // campaign-reels does, and its rule is the pre-Task-6 prefix list. Otherwise
  // the wholesale `resolveMediaSource` applies, bound to the 'audio' role.
  const resolveAudio =
    theme.resolveAudioSource ??
    (theme.resolveMediaSource ? (raw: string) => theme.resolveMediaSource!(raw, 'audio') : undefined);
  const audioNodes = buildAudioNodes(reel.tracks.audio, { fps, resolveSource: resolveAudio });

  // ---- music -------------------------------------------------------------------
  const { volumeAt } = computeMusicEnvelope(reel, { fps });
  const musicSource = reel.tracks.music.source;

  // ---- overlays ------------------------------------------------------------------
  const overlayNodes = track.map((item) => {
    const from = msToFrames(item.startMs);
    const durationInFrames = msToFrames(item.endMs) - from;
    if (durationInFrames <= 0) return null;
    const node = renderOverlayItem(item);
    if (node === null) return null;
    return (
      <Sequence key={item.id} from={from} durationInFrames={durationInFrames} name={item.id}>
        {node}
      </Sequence>
    );
  });
  return (
    <AbsoluteFill style={{ backgroundColor: theme.background }}>
      {videoNodes}
      {audioNodes}
      {musicSource && (
        // Role 'music' has no folder in ROLE_FOLDERS — a bed's source is
        // already public/-relative in both brands ('audio/boj.wav',
        // 'music/bed.mp3') — so this is byte-identical to the inline
        // http/staticFile rule it replaces; it just lives in one place now.
        // No acceptableTimeShiftInSeconds here on purpose — see media-sync.ts.
        // The music bed is sound; only the picture gets the tightened leash.
        <Audio
          src={resolveGenericSource(musicSource, 'music', theme.resolveMediaSource)}
          volume={volumeAt}
        />
      )}
      {overlayNodes}
      {/* The whole-track escape hatch wins outright when a brand declares it —
          that is what keeps a brand mounting ONE component for several items
          (or spanning every item from 0) rendering exactly as before. With no
          hook, the brand layer is dispatched per kind through the registry. */}
      {theme.renderBrandTrack
        ? theme.renderBrandTrack(reel.tracks.brand)
        : defaultRenderBrandTrack(reel.tracks.brand, theme, fps)}
    </AbsoluteFill>
  );
};
