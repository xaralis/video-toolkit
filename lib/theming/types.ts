import type React from 'react';
import type { Registration, Registry } from './registry';
// Type-only import — erased at runtime, so this does NOT create a module cycle
// with effects/index.ts (which imports BrandTheme back, also type-only).
import type { EffectRenderProps } from './effects';
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
  palette: readonly AccentSlot[];
  /** Opaque brand-level config threaded down by the root from the theme. */
  config?: unknown;
  /** Usually 0 — the overlay is mounted in a Sequence at the item's start. */
  appearAtMs: number;
  durationMs: number;
}

export type OverlayRenderer = React.FC<OverlayRenderProps>;

/** Overlay kinds are OPEN — a brand names them, core never enumerates them.
 *  Core knows routing MODES and the handful of kinds it can draw itself. */
export type OverlayKind = string;

/** The overlay kinds core has a generic renderer for ('quote-pull' is the
 *  legacy alias of 'text'). Everything else draws only if a brand registers it. */
export type CoreOverlayKind = 'text';

/** The theming contract a brand's theme object satisfies. */
export interface BrandTheme {
  accentSlots: readonly AccentSlot[];
  /** ONE open-keyed overlay registry. Absent kind → core generic (text) → null.
   *
   *  Caveat on which field draws what: at item level core honours `render`
   *  (the escape hatch) for ANY kind, but `renderer` — which takes
   *  OverlayRenderProps — is consumed only through the core text adapter, i.e.
   *  for the core kinds 'text' and its legacy alias 'quote-pull'. A `renderer`
   *  on a non-core kind (`{ chevron: { renderer: X } }`) is therefore ignored;
   *  register such kinds with `render`. */
  overlays?: Record<OverlayKind, OverlayItemRegistration>;
  /** Per-kind brand-custom video renderer + config. Absent kind → core generic. */
  video?: Partial<Record<VideoKind, VideoRegistration>>;
  /** ONE open-keyed effect registry. Effect types are OPEN — a brand names
   *  them, core never enumerates them. Absent type → core generic primitive
   *  (grain/scanlines/vignette/grade/transform) → silently skipped. */
  effects?: Registry<EffectRenderProps>;
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
 *  Sequence per item, so every item animates in its own [startMs, endMs) window.
 *  'anchored': delivered to the owning video renderer via anchoredOverlays
 *  instead (items without anchorVideoId fall back to track). */
export type OverlayRouting = 'track' | 'anchored';

/** One overlay kind's registration. `renderer`/`config`/`params` come from the
 *  shared Registration primitive; `routing` and `render` are this axis's own.
 *  A registration with NO renderer and NO render contributes routing/config
 *  only — it does not mask a core generic for a kind core can draw. */
export interface OverlayItemRegistration extends Registration<OverlayRenderProps> {
  routing?: OverlayRouting;
  /** Item-level escape hatch: full control over the node, bypassing
   *  OverlayRenderProps. Wins over `renderer` when both are present. */
  render?: (item: OverlayItem) => React.ReactNode;
}

/** @deprecated Use {@link OverlayItemRegistration} — the two overlay
 *  registries collapsed into one in Phase 3 Task 1. Kept as an alias so
 *  existing brand imports keep compiling. */
export type OverlayRegistration = OverlayItemRegistration;

/** The full composition contract a brand hands to LayeredReelComposition. */
export interface CompositionTheme extends BrandTheme {
  /** Root AbsoluteFill background. */
  background: string;
  /** @deprecated The composition tier of what is now ONE registry. It still
   *  works — it merges over {@link BrandTheme.overlays}, winning per kind — but
   *  new registrations belong on `overlays`. Phase 3 Task 11 writes the
   *  migration that collapses this away. */
  overlayItems?: Record<OverlayKind, OverlayItemRegistration>;
  /** Pre-pass over the video track before buildVideoNodes (e.g. brand-owned
   *  transition asset injection). */
  prepareVideoTrack?: (items: VideoItem[]) => VideoItem[];
  /** Renders the whole brand track (watermark/disclaimer) — one hook, the
   *  brand decides how many components that is. */
  renderBrandTrack?: (items: BrandLayerItem[]) => React.ReactNode;
  /** Override the audio-source folder convention (default: recordings/). */
  resolveAudioSource?: (raw: string) => string;
}
