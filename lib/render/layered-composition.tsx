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
  defaultRenderBrandTrack,
  resolveGenericSource,
} from '../theming';
import { buildVideoNodes } from './video-track';
import { buildAudioNodes } from './audio-track';
import { routeOverlays, overlayKind } from './overlay-routing';

// The default renderer for 'text' (and its legacy 'quote-pull' alias): adapts
// the raw OverlayItem to the theming module's text contract, so brands keep
// registering their Text via BrandTheme.overlays.text exactly as before.
const TrackTextOverlay: React.FC<{ item: OverlayItem; theme: CompositionTheme }> = ({ item, theme }) => {
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
      config={overlayConfig(theme, 'text')}
      appearAtMs={0}
      durationMs={item.endMs - item.startMs}
    />
  );
};

// Core's item-level generics: the kinds core can draw without any brand
// registration. Both entries are the text adapter — 'quote-pull' is the legacy
// alias of 'text' and deliberately resolves the SAME 'text' registration.
const CORE_OVERLAY_GENERICS: Record<string, React.FC<{ item: OverlayItem; theme: CompositionTheme }>> = {
  text: TrackTextOverlay,
  'quote-pull': TrackTextOverlay,
};

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
 *  the effect inside its own renderer where it can choose the scope. */
export function renderVideoItemNode(
  theme: CompositionTheme,
  item: VideoItem,
  handles: { inHalf: number; outHalf: number },
  extras: { anchoredOverlays?: OverlayItem[]; boundAudio?: AudioItem } = {},
): React.ReactNode {
  const Renderer = resolveVideoRenderer(theme, item.kind);
  if (!Renderer) return null; // a kind this brand didn't register a renderer for
  const media = (
    <Renderer
      item={item}
      handles={handles}
      config={videoConfig(theme, item.kind)}
      anchoredOverlays={extras.anchoredOverlays ?? []}
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
  return applyEffects(theme, item, handles, media);
}

export const LayeredReelComposition: React.FC<{ reel: LayeredReel; theme: CompositionTheme }> = ({ reel, theme }) => {
  const { fps, width, height } = useVideoConfig();
  const msToFrames = (ms: number) => Math.round((ms / 1000) * fps);

  // ONE registry for the whole composition: brand tier + the deprecated
  // composition tier, the latter winning per kind (see overlayRegistry).
  const registry = overlayRegistry(theme);
  const { track, anchored } = routeOverlays(reel.tracks.overlays, registry);

  // ---- video ----------------------------------------------------------------
  const videoItems = theme.prepareVideoTrack ? theme.prepareVideoTrack(reel.tracks.video) : reel.tracks.video;
  const videoNodes = buildVideoNodes(videoItems, {
    width,
    height,
    fps,
    // Lets a transition name a colour by brand accent-slot key (see `wipe`).
    palette: theme.accentSlots,
    // The brand's own transition kinds: what makes them RENDER (resolved above
    // core's generics by presentationFor) and what stops them warning as
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
  const renderTrackItem = (item: OverlayItem): React.ReactNode => {
    const kind = overlayKind(item);
    const reg = registry[kind];
    if (reg?.render) return reg.render(item); // item-level escape hatch wins
    const Generic = CORE_OVERLAY_GENERICS[kind];
    return Generic ? <Generic item={item} theme={theme} /> : null;
  };
  const overlayNodes = track.map((item) => {
    const from = msToFrames(item.startMs);
    const durationInFrames = msToFrames(item.endMs) - from;
    if (durationInFrames <= 0) return null;
    const node = renderTrackItem(item);
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
        <Audio src={resolveGenericSource(musicSource, 'music', theme.resolveMediaSource)} volume={volumeAt} />
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
