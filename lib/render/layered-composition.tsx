// lib/render/layered-composition.tsx — ONE assembly for the whole layered
// model. Every brand renders every track identically; the CompositionTheme
// contributes only look (renderers, background, routing) — see spec
// docs/superpowers/specs/2026-07-25-layered-reel-composition-design.md.
import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useVideoConfig } from 'remotion';
import type { LayeredReel, OverlayItem } from '../reel-config-base/layered-schema';
import { computeMusicEnvelope } from '../reel-config-base/music-envelope';
import type { CompositionTheme, Placement } from '../theming';
import {
  resolveOverlayRenderer,
  overlayConfig,
  overlayRegistry,
  resolveVideoRenderer,
  videoConfig,
  DEFAULT_PLACEMENT,
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
    renderItem: (item, handles) => {
      const Renderer = resolveVideoRenderer(theme, item.kind);
      if (!Renderer) return null; // a kind this brand didn't register a renderer for
      return (
        <Renderer
          item={item}
          handles={handles}
          config={videoConfig(theme, item.kind)}
          anchoredOverlays={anchored.get(item.id) ?? []}
          boundAudio={reel.tracks.audio.find((a) => a.followsVideoId === item.id)}
        />
      );
    },
  });

  // ---- audio (voice/beds) -----------------------------------------------------
  const audioNodes = buildAudioNodes(reel.tracks.audio, { fps, resolveSource: theme.resolveAudioSource });

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
        <Audio src={musicSource.startsWith('http') ? musicSource : staticFile(musicSource)} volume={volumeAt} />
      )}
      {overlayNodes}
      {theme.renderBrandTrack ? theme.renderBrandTrack(reel.tracks.brand) : null}
    </AbsoluteFill>
  );
};
