import type React from 'react';
import type { AccentSlot } from './palette';
import type { Placement } from './placement';
import type { VideoItem, AudioItem, OverlayItem, BrandLayerItem } from '../reel-config-base/layered-schema';

/** The static prop bag every text-overlay renderer receives. Frame-derived
 *  values (localFrame/totalFrames/fps) are read from Remotion hooks INSIDE the
 *  renderer's Sequence, not passed here. */
export interface OverlayRenderProps {
  text: string;
  placement: Placement;
  fontSize?: number;
  /** Appear animation. 'none' = shown instantly (no reveal). */
  reveal?: 'line' | 'all' | 'none';
  /** Disappear animation. 'fade' = fade out at the end; 'none' = cut (no hide). */
  hide?: 'fade' | 'none';
  /** Brand palette; renderers resolve keys→hex via paletteMap/resolveAccentColor. */
  palette: AccentSlot[];
  /** Opaque brand-level config threaded down by the root from the theme. */
  config?: unknown;
  /** Usually 0 — the overlay is mounted in a Sequence at the item's start. */
  appearAtMs: number;
  durationMs: number;
}

export type OverlayRenderer = React.FC<OverlayRenderProps>;

/** Overlay kinds that flow through the theming module. Widened as kinds adopt it. */
export type OverlayKind = 'text';

/** One kind's brand registration: its custom renderer + opaque brand config. */
export interface OverlayRegistration {
  renderer: OverlayRenderer;
  config?: unknown;
}

/** The theming contract a brand's theme object satisfies. */
export interface BrandTheme {
  accentSlots: AccentSlot[];
  /** Per-kind brand-custom renderer + config. Absent kind → core generic. */
  overlays?: Partial<Record<OverlayKind, OverlayRegistration>>;
  /** Per-kind brand-custom video renderer + config. Absent kind → core generic. */
  video?: Partial<Record<VideoKind, VideoRegistration>>;
}

/** All video-track item kinds. Footage kinds have a core generic renderer
 *  (SegmentMedia); the rest render only when the brand registers them. */
export type VideoKind = 'clip' | 'broll' | 'photo' | 'multi-clip' | 'card' | 'outro';
export type FootageVideoKind = 'clip' | 'broll' | 'photo';

/** The static prop bag every video renderer receives. Frame-derived values
 *  (localFrame/fps/dims) are read from Remotion hooks INSIDE the renderer,
 *  not passed here — mirrors OverlayRenderProps. */
export interface VideoRenderProps {
  item: VideoItem;
  /** Extra frames borrowed at each edge for cross-item transitions (0 when none). */
  handles: { inHalf: number; outHalf: number };
  /** Opaque brand-level config threaded down by the root from the theme. */
  config?: unknown;
  /** Overlay items anchored to this video item whose kind routes 'anchored'
   *  (core-supplied — e.g. campaign's title, whose caption-lift lives in the body). */
  anchoredOverlays?: OverlayItem[];
  /** The audio item following this video item, for READ-ONLY use (e.g. deriving
   *  captions via transcriptWindow). The core composition already mounts every
   *  audio-track item on the audio track — a renderer must NOT mount this as an
   *  <Audio> itself, or the voice double-plays. */
  boundAudio?: AudioItem;
}

export type VideoRenderer = React.FC<VideoRenderProps>;

/** One kind's brand registration: its custom renderer + opaque brand config. */
export interface VideoRegistration {
  renderer: VideoRenderer;
  config?: unknown;
}

/** How an overlay kind reaches the screen. 'track' (default): one absolute
 *  Sequence per item. 'anchored': delivered to the owning video renderer via
 *  anchoredOverlays instead (items without anchorVideoId fall back to track).
 *  'singleton': mounted once, unwrapped (e.g. a chevron marker). */
export type OverlayRouting = 'track' | 'anchored' | 'singleton';

export interface OverlayItemRegistration {
  routing?: OverlayRouting;
  /** Item-based renderer. Optional for 'anchored' (the video body renders it)
   *  and for the 'text'/'quote-pull' kinds (core text adapter is the default). */
  render?: (item: OverlayItem) => React.ReactNode;
}

/** The full composition contract a brand hands to LayeredReelComposition. */
export interface CompositionTheme extends BrandTheme {
  /** Root AbsoluteFill background. */
  background: string;
  /** Per-overlay-kind routing + renderer, any kind (core knows modes, not names). */
  overlayItems?: Record<string, OverlayItemRegistration>;
  /** Pre-pass over the video track before buildVideoNodes (e.g. brand-owned
   *  transition asset injection). */
  prepareVideoTrack?: (items: VideoItem[]) => VideoItem[];
  /** Renders the whole brand track (watermark/disclaimer) — one hook, the
   *  brand decides how many components that is. */
  renderBrandTrack?: (items: BrandLayerItem[]) => React.ReactNode;
  /** Override the audio-source folder convention (default: recordings/). */
  resolveAudioSource?: (raw: string) => string;
}
