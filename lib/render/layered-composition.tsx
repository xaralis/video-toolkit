// lib/render/layered-composition.tsx — ONE assembly for the whole layered
// model. Every brand renders every track identically; the CompositionTheme
// contributes only look (renderers, background, routing) — see spec
// docs/superpowers/specs/2026-07-25-layered-reel-composition-design.md.
import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useVideoConfig } from 'remotion';
import type { LayeredReel, OverlayItem } from '../reel-config-base/layered-schema';
import { computeMusicEnvelope } from '../reel-config-base/music-envelope';
import type { CompositionTheme, Placement } from '../theming';
import { resolveOverlayRenderer, overlayConfig, resolveVideoRenderer, videoConfig, DEFAULT_PLACEMENT } from '../theming';
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

const TEXT_KINDS = new Set(['text', 'quote-pull']);

export const LayeredReelComposition: React.FC<{ reel: LayeredReel; theme: CompositionTheme }> = ({ reel, theme }) => {
  const { fps, width, height } = useVideoConfig();
  const msToFrames = (ms: number) => Math.round((ms / 1000) * fps);

  const { track, anchored } = routeOverlays(reel.tracks.overlays, theme.overlayItems);

  // ---- video ----------------------------------------------------------------
  const videoItems = theme.prepareVideoTrack ? theme.prepareVideoTrack(reel.tracks.video) : reel.tracks.video;
  const videoNodes = buildVideoNodes(videoItems, {
    width,
    height,
    fps,
    renderItem: (item, handles) => {
      const Renderer = resolveVideoRenderer(theme, item.kind);
      if (!Renderer) return null; // kind the brand didn't register (e.g. roost multi-clip)
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
    const reg = theme.overlayItems?.[kind];
    if (reg?.render) return reg.render(item);
    if (TEXT_KINDS.has(kind)) return <TrackTextOverlay item={item} theme={theme} />;
    return null;
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
