import type React from 'react';
import type { AccentSlot } from './palette';
import type { Placement } from './placement';
import type { VideoItem } from '../reel-config-base/layered-schema';

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

/** Video-track item kinds that flow through the theming module (the footage
 *  kinds every brand's clip/broll/photo renderer composes around SegmentMedia). */
export type VideoKind = 'clip' | 'broll' | 'photo';

/** The static prop bag every video renderer receives. Frame-derived values
 *  (localFrame/fps/dims) are read from Remotion hooks INSIDE the renderer,
 *  not passed here — mirrors OverlayRenderProps. */
export interface VideoRenderProps {
  item: VideoItem;
  /** Extra frames borrowed at each edge for cross-item transitions (0 when none). */
  handles: { inHalf: number; outHalf: number };
  /** Opaque brand-level config threaded down by the root from the theme. */
  config?: unknown;
}

export type VideoRenderer = React.FC<VideoRenderProps>;

/** One kind's brand registration: its custom renderer + opaque brand config. */
export interface VideoRegistration {
  renderer: VideoRenderer;
  config?: unknown;
}
